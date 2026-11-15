#!/usr/bin/env python3
"""Kịch bản demo nhả hàng thành công / thất bại, lặp lại được (Sprint 3 - HẢI).

Một "Backend giả" publish lệnh DISPENSE và kiểm tra kết quả simulator trả về.

    python demo.py                           # broker giả trong bộ nhớ, không cần cài gì
    python demo.py --broker-host localhost   # dùng Mosquitto thật (cần paho-mqtt)
    python demo.py --only success,jam        # chạy một số kịch bản
    python demo.py --realtime                # giữ nguyên thời gian motor thật (1.5-2s/hộp)
Thoát mã 0 nếu mọi kịch bản đạt, 1 nếu có kịch bản sai.
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import threading
import time
import uuid
from typing import Any, Callable, Dict, List, Optional, Tuple

from freshvend_sim.config import SimConfig
from freshvend_sim.faults import FaultInjector
from freshvend_sim.machine import VirtualMachine
from freshvend_sim.protocol import Topics, make_will
from freshvend_sim.transport import InMemoryBroker, InMemoryTransport, PahoTransport, Transport

MACHINE = "VM001"


class FakeBackend:
    """Đóng vai KIM-backend: gửi lệnh qua MQTT và gom kết quả/cảnh báo."""

    def __init__(self, transport: Transport, topics: Topics) -> None:
        self.t, self.topics = transport, topics
        self.results: List[Dict[str, Any]] = []
        self.alerts: List[Dict[str, Any]] = []
        self.control_results: List[Dict[str, Any]] = []
        self._cond = threading.Condition()
        transport.subscribe(topics.dispense_result, lambda _, p: self._add(self.results, p))
        transport.subscribe(topics.alert, lambda _, p: self._add(self.alerts, p))
        transport.subscribe(topics.control_result, lambda _, p: self._add(self.control_results, p))

    def _add(self, bucket: List[Dict[str, Any]], raw: bytes) -> None:
        with self._cond:
            bucket.append(json.loads(raw))
            self._cond.notify_all()

    def dispense(self, items: List[Dict[str, Any]], order_id: Optional[str] = None,
                 command_id: Optional[str] = None, **extra: Any) -> Tuple[str, str]:
        order_id = order_id or f"order-{uuid.uuid4().hex[:8]}"
        command_id = command_id or f"cmd_{order_id[-8:]}"
        self.send({"commandId": command_id, "orderId": order_id, "machineCode": MACHINE,
                   "machineId": "00000000-0000-0000-0000-000000000001", "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                   "items": items, **extra})
        return command_id, order_id

    def send(self, payload: Dict[str, Any]) -> None:
        self.t.publish(self.topics.dispense_command, payload, qos=1)

    def control(self, payload: Dict[str, Any]) -> None:
        self.t.publish(self.topics.control, payload, qos=1)

    def wait_for(self, bucket: List[Dict[str, Any]], predicate: Callable[[Dict[str, Any]], bool], timeout: float = 15.0):
        deadline = time.time() + timeout
        with self._cond:
            while True:
                hit = next((m for m in bucket if predicate(m)), None)
                if hit or time.time() >= deadline:
                    return hit
                self._cond.wait(0.1)

    def result(self, command_id: str, nth: int = 1) -> Optional[Dict[str, Any]]:
        deadline = time.time() + 15
        with self._cond:
            while True:
                matches = [r for r in self.results if r.get("commandId") == command_id]
                if len(matches) >= nth or time.time() >= deadline:
                    return matches[nth - 1] if len(matches) >= nth else None
                self._cond.wait(0.1)


class Demo:
    def __init__(self, backend: FakeBackend, machine: VirtualMachine, faults: FaultInjector,
                 in_memory: bool, sim_transport: Transport) -> None:
        self.b, self.m, self.f, self.in_memory, self.sim_transport = backend, machine, faults, in_memory, sim_transport
        self.failures: List[str] = []

    def show(self, title: str, result: Optional[Dict[str, Any]]) -> None:
        if result is None:
            print(f"   {title}: KHÔNG nhận được kết quả")
            return
        parts = [f"{i['columnId']}:{i['status']}({i['dispensedQuantity']}/{i['quantity']})" for i in result["items"]]
        print(f"   {title}: {result['eventCode']} errorCode={result['errorCode']} retry={result['retryCount']} "
              f"replayed={result.get('replayed')} items=[{', '.join(parts)}]")

    def check(self, condition: bool, description: str) -> None:
        print(f"   [{'PASS' if condition else 'FAIL'}] {description}")
        if not condition:
            self.failures.append(description)

    # ── các kịch bản ──
    def success(self) -> None:
        cid, _ = self.b.dispense([{"columnId": "A01", "quantity": 1}, {"columnId": "A02", "quantity": 2}])
        r = self.b.result(cid)
        self.show("kết quả", r)
        self.check(bool(r) and r["eventCode"] == "DISPENSE_SUCCESS" and r["retryCount"] == 0, "đơn 2 món (3 hộp) nhả thành công")

    def duplicate(self) -> None:
        cid, oid = self.b.dispense([{"columnId": "A03", "quantity": 1}])
        first = self.b.result(cid)
        self.b.dispense([{"columnId": "A03", "quantity": 1}], order_id=oid, command_id=cid)   # Backend gửi lại cùng lệnh
        again = self.b.result(cid, nth=2)
        self.show("lần 1", first)
        self.show("lần 2", again)
        self.check(bool(again) and again["replayed"] and again["status"] == first["status"],
                   "lệnh trùng chỉ nhận lại kết quả cũ (replayed=true), không quay motor lần hai")

    def retry_success(self) -> None:
        self.f.set_jam("A01", 1)
        cid, _ = self.b.dispense([{"columnId": "A01", "quantity": 1}])
        r = self.b.result(cid)
        self.show("kết quả", r)
        self.check(bool(r) and r["status"] == "SUCCESS" and r["retryCount"] == 1, "kẹt 1 lần, tự thử lại và nhả thành công (retryCount=1)")

    def jam(self) -> None:
        self.f.set_jam("A02")
        cid, _ = self.b.dispense([{"columnId": "A01", "quantity": 1}, {"columnId": "A02", "quantity": 1}])
        r = self.b.result(cid)
        self.show("kết quả", r)
        self.check(bool(r) and r["eventCode"] == "DISPENSE_FAILED" and r["errorCode"] == "DISPENSE_JAM" and r["retryCount"] == 2,
                   "kẹt sau 2 lần thử lại -> DISPENSE_FAILED / DISPENSE_JAM")
        self.check(self.b.wait_for(self.b.alerts, lambda a: a["alertCode"] == "DISPENSE_JAM", 3) is not None, "có cảnh báo DISPENSE_JAM")
        self.check(self.m.locked_columns() == ["A02"], "cột A02 bị khóa, máy báo trạng thái ERROR")

    def locked_column(self) -> None:
        if "A02" not in self.m.locked_columns():      # tự chuẩn bị tiền điều kiện để chạy riêng được (--only locked)
            self.f.set_jam("A02")
            setup, _ = self.b.dispense([{"columnId": "A02", "quantity": 1}])
            self.b.result(setup)
        cid, _ = self.b.dispense([{"columnId": "A02", "quantity": 1}])
        r = self.b.result(cid)
        self.show("kết quả", r)
        self.check(bool(r) and r["errorCode"] == "COLUMN_LOCKED", "đơn vào cột đang khóa bị từ chối (COLUMN_LOCKED)")

    def clear_fault(self) -> None:
        self.b.control({"action": "CLEAR_FAULT", "columnId": "A02", "requestId": "demo-1"})
        ack = self.b.wait_for(self.b.control_results, lambda a: a.get("requestId") == "demo-1", 3)
        self.check(bool(ack) and ack["status"] == "OK", "CLEAR_FAULT được xác nhận")
        cid, _ = self.b.dispense([{"columnId": "A02", "quantity": 1}])
        r = self.b.result(cid)
        self.show("kết quả", r)
        self.check(bool(r) and r["status"] == "SUCCESS", "sau CLEAR_FAULT cột A02 nhả lại bình thường")

    def out_of_stock(self) -> None:
        self.f.set_empty("A04")
        cid, _ = self.b.dispense([{"columnId": "A01", "quantity": 1}, {"columnId": "A04", "quantity": 1}])
        r = self.b.result(cid)
        self.show("kết quả", r)
        self.check(bool(r) and r["errorCode"] == "OUT_OF_STOCK" and r["items"][0]["status"] == "SKIPPED",
                   "cột trống bị phát hiện TRƯỚC khi quay motor (không nhả dở dang món A01)")
        self.m.clear_faults("A04")

    def invalid(self) -> None:
        self.b.send({"commandId": "cmd_bad", "orderId": "order-bad", "items": [{"columnId": "A01", "quantity": 0}]})
        r = self.b.result("cmd_bad")
        self.show("kết quả", r)
        self.check(bool(r) and r["errorCode"] == "INVALID_COMMAND", "payload sai bị từ chối (INVALID_COMMAND)")

    def temperature_lock(self) -> None:
        self.f.force_temp = 9.8
        locked = self._eventually(lambda: self.m.snapshot()["tempLocked"])
        self.check(locked, "nhiệt độ 9.8°C kéo dài -> khóa bán hàng")
        cid, _ = self.b.dispense([{"columnId": "A01", "quantity": 1}])
        r = self.b.result(cid)
        self.show("kết quả", r)
        self.check(bool(r) and r["errorCode"] == "MACHINE_LOCKED", "đơn bị từ chối khi máy khóa vì nhiệt độ (MACHINE_LOCKED)")
        self.f.force_temp = None
        self.check(self._eventually(lambda: not self.m.snapshot()["tempLocked"]), "nhiệt độ về bình thường -> mở khóa")

    def offline_buffer(self) -> None:
        if not self.in_memory:
            print("   (bỏ qua: kịch bản mất mạng chỉ chạy với broker giả; với Mosquitto thật hãy `docker stop` broker)")
            return
        self.sim_transport.simulate_network_loss()          # type: ignore[attr-defined]
        cid, _ = self.b.dispense([{"columnId": "A01", "quantity": 1}])   # lệnh gửi lúc máy offline sẽ không tới được
        time.sleep(0.2)
        self.check(self.b.result(cid) is None, "máy offline không nhận lệnh (Backend phải gửi lại - ERR-03)")
        self.f.set_jam("A03")
        # Mô phỏng lệnh đã nhận ngay trước khi rớt mạng: xử lý khi offline -> kết quả vào bộ đệm
        from freshvend_sim.protocol import parse_dispense_command
        cmd = parse_dispense_command({"commandId": "cmd_off", "orderId": "order-off", "items": [{"columnId": "A03", "quantity": 1}]}, MACHINE)
        self.m.process_command(cmd)
        self.check(self.m.snapshot()["outbox"] >= 1, "kết quả được lưu đệm cục bộ khi mất kết nối")
        self.sim_transport.restore_network()                 # type: ignore[attr-defined]
        r = self.b.result("cmd_off")
        self.show("kết quả đồng bộ lại", r)
        self.check(bool(r) and r["errorCode"] == "DISPENSE_JAM", "kết nối lại -> kết quả được đẩy bù đầy đủ")
        self.m.clear_faults()

    def _eventually(self, predicate: Callable[[], bool], timeout: float = 5.0) -> bool:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if predicate():
                return True
            time.sleep(0.05)
        return False


SCENARIOS = [
    ("success", "1. Nhả hàng thành công (đơn nhiều món)", "success"),
    ("duplicate", "2. Lệnh gửi trùng -> idempotent", "duplicate"),
    ("retry", "3. Kẹt 1 lần rồi thử lại thành công", "retry_success"),
    ("jam", "4. Kẹt hàng -> DISPENSE_FAILED + khóa cột", "jam"),
    ("locked", "5. Đơn vào cột đang khóa", "locked_column"),
    ("clear", "6. Operator CLEAR_FAULT -> nhả lại bình thường", "clear_fault"),
    ("stock", "7. Cột trống (OUT_OF_STOCK)", "out_of_stock"),
    ("invalid", "8. Lệnh sai định dạng", "invalid"),
    ("temp", "9. Nhiệt độ vượt ngưỡng -> khóa bán hàng", "temperature_lock"),
    ("offline", "10. Mất mạng -> lưu đệm -> đồng bộ lại", "offline_buffer"),
]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--broker-host", help="Dùng broker MQTT thật thay vì broker giả trong bộ nhớ")
    ap.add_argument("--broker-port", type=int, default=1883)
    ap.add_argument("--realtime", action="store_true", help="Giữ thời gian motor/cảm biến thật")
    ap.add_argument("--only", default="", help="Danh sách kịch bản, ví dụ success,jam")
    args = ap.parse_args()
    logging.basicConfig(level=logging.WARNING)

    cfg = SimConfig(machine_code=MACHINE, time_scale=1.0 if args.realtime else 0.02, telemetry_interval=0.2,
                    temp_lock_after=0.3, persist=False, seed=7).validate()
    topics = Topics.for_machine(MACHINE, cfg.topic_prefix)
    in_memory = args.broker_host is None
    if in_memory:
        broker = InMemoryBroker()
        sim_t: Transport = InMemoryTransport(broker, make_will(topics, MACHINE))
        backend_t: Transport = InMemoryTransport(broker)
        backend_t.connect()
    else:
        sim_t = PahoTransport(args.broker_host, args.broker_port, "freshvend-sim-demo", None, None, False, make_will(topics, MACHINE))
        backend_t = PahoTransport(args.broker_host, args.broker_port, "freshvend-demo-backend")
        backend_t.connect()
    backend = FakeBackend(backend_t, topics)
    faults = FaultInjector()
    machine = VirtualMachine(cfg, sim_t, faults)
    machine.start()
    deadline = time.time() + 10
    while not sim_t.is_connected() and time.time() < deadline:
        time.sleep(0.05)
    if not sim_t.is_connected():
        print("Không kết nối được broker.", file=sys.stderr)
        return 2

    demo = Demo(backend, machine, faults, in_memory, sim_t)
    wanted = {s.strip() for s in args.only.split(",") if s.strip()}
    print(f"=== DEMO IOT SIMULATOR SPRINT 3 | máy {MACHINE} | {'broker giả (in-memory)' if in_memory else args.broker_host} ===")
    try:
        for key, title, method in SCENARIOS:
            if wanted and key not in wanted:
                continue
            print(f"\n{title}")
            getattr(demo, method)()
    finally:
        machine.stop()
        backend_t.disconnect()
    print("\n" + ("TẤT CẢ KỊCH BẢN ĐẠT." if not demo.failures else f"CÓ {len(demo.failures)} KIỂM TRA SAI:\n - " + "\n - ".join(demo.failures)))
    return 0 if not demo.failures else 1


if __name__ == "__main__":
    sys.exit(main())
