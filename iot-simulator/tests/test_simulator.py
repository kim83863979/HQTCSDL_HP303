"""Unit test cho IoT Simulator Sprint 3. Chạy: python -m unittest discover -s tests -v

Không cần broker thật: dùng InMemoryBroker; thời gian chờ được thay bằng hàm sleep ghi lại.
"""
import json
import tempfile
import threading
import time
import unittest
from typing import Any, Dict, List, Optional

from freshvend_sim.config import SimConfig
from freshvend_sim.auth import sign_payload, verify_payload
from freshvend_sim.faults import FaultInjector
from freshvend_sim.machine import VirtualMachine
from freshvend_sim.protocol import (
    CommandValidationError, ErrorCode, Topics, make_will, normalize_column, parse_dispense_command,
)
from freshvend_sim.state_store import StateStore
from freshvend_sim.transport import InMemoryBroker, InMemoryTransport

CODE = "VM001"


class Harness:
    """Một máy ảo + broker giả + sleep ghi lại (không chờ thật)."""

    def __init__(self, store: Optional[StateStore] = None, clock=None, **overrides: Any) -> None:
        self.cfg = SimConfig(machine_code=CODE, jam_rate=0.0, **overrides).validate()
        self.topics = Topics.for_machine(CODE)
        self.broker = InMemoryBroker()
        self.transport = InMemoryTransport(self.broker, make_will(self.topics, CODE))
        self.sleeps: List[float] = []
        self.faults = FaultInjector()
        kwargs = {"clock": clock} if clock else {}
        self.machine = VirtualMachine(
            self.cfg, self.transport, self.faults, store,
            sleep=lambda s: (self.sleeps.append(s), False)[1], **kwargs)
        self.transport.on_connected = self.machine._on_connected
        self.transport.on_disconnected = self.machine._on_disconnected
        self.transport.connect()
        self.transport.subscribe(self.topics.dispense_command, self.machine.handle_dispense_message)
        self.transport.subscribe(self.topics.control, self.machine.handle_control_message)

    def command(self, items, command_id="cmd_1", order_id="ord-1", **extra) -> Dict[str, Any]:
        payload = {"commandId": command_id, "orderId": order_id, "machineCode": CODE, "items": items, **extra}
        return payload

    def send(self, payload: Any) -> None:
        self.broker.publish_json(self.topics.dispense_command, payload)

    def run(self, items, **kw) -> Dict[str, Any]:
        cmd = parse_dispense_command(self.command(items, **kw), CODE)
        return self.machine.process_command(cmd)

    def results(self) -> List[Dict[str, Any]]:
        return self.broker.messages_on(self.topics.dispense_result)

    def alerts(self) -> List[Dict[str, Any]]:
        return self.broker.messages_on(self.topics.alert)


def item(col="A01", qty=1, **kw):
    return {"columnId": col, "quantity": qty, **kw}


class ProtocolTests(unittest.TestCase):
    def test_parse_valid_and_normalize_column(self):
        cmd = parse_dispense_command(
            {"commandId": 9081, "orderId": "o1", "items": [{"columnId": "a1", "quantity": 2, "productId": 12}]}, CODE)
        self.assertEqual(cmd.command_id, "9081")
        self.assertEqual(cmd.items[0].column_key, "A01")
        self.assertEqual(cmd.items[0].column_id, "a1")   # echo đúng như nhận
        self.assertEqual(cmd.items[0].product_id, "12")

    def test_normalize_column(self):
        self.assertEqual(normalize_column("A001"), "A01")
        with self.assertRaises(ValueError):
            normalize_column("AA1")

    def test_rejects_bad_payloads(self):
        bad = [
            b"not json", b"[]", {"orderId": "o"}, {"commandId": "c"},
            {"commandId": "c", "orderId": "o", "items": []},
            {"commandId": "c", "orderId": "o", "items": [{"columnId": "A01", "quantity": 0}]},
            {"commandId": "c", "orderId": "o", "items": [{"columnId": "A01", "quantity": True}]},
            {"commandId": "c", "orderId": "o", "items": [{"columnId": "A01", "quantity": 101}]},
            {"commandId": "c", "orderId": "o", "items": [{"columnId": "??", "quantity": 1}]},
            {"commandId": True, "orderId": "o", "items": [item()]},
            {"commandId": "c", "orderId": "o", "items": ["x"]},
        ]
        for payload in bad:
            with self.subTest(payload=payload), self.assertRaises(CommandValidationError) as ctx:
                parse_dispense_command(payload, CODE)
            self.assertEqual(ctx.exception.code, ErrorCode.INVALID_COMMAND)

    def test_machine_mismatch_keeps_ids_for_correlation(self):
        with self.assertRaises(CommandValidationError) as ctx:
            parse_dispense_command({"commandId": "c", "orderId": "o", "machineCode": "VM002", "items": [item()]}, CODE)
        self.assertEqual(ctx.exception.code, ErrorCode.MACHINE_MISMATCH)
        self.assertEqual((ctx.exception.command_id, ctx.exception.order_id), ("c", "o"))

    def test_topics_follow_sprint3_proposal_and_reject_wildcards(self):
        t = Topics.for_machine("vm001")
        self.assertEqual(t.telemetry, "freshvend/VM001/telemetry")
        self.assertEqual(t.dispense_command, "freshvend/VM001/commands/dispense")
        self.assertEqual(t.dispense_result, "freshvend/VM001/events/dispense-result")
        for evil in ("VM#", "a/b", "VM+1", ""):
            with self.assertRaises(ValueError):
                Topics.for_machine(evil)


class MessageAuthTests(unittest.TestCase):
    def test_signed_message_verifies_and_tampering_is_rejected(self):
        secret = "test-device-secret-at-least-32-bytes"
        signed = sign_payload({"commandId": "c1", "quantity": 1}, secret)
        self.assertTrue(verify_payload(signed, secret))
        signed["quantity"] = 2
        self.assertFalse(verify_payload(signed, secret))

    def test_simulator_rejects_unsigned_mqtt_commands_when_secret_is_configured(self):
        h = Harness(iot_secret="test-device-secret-at-least-32-bytes")
        h.send(h.command([item("A01")]))
        self.assertEqual(h.results()[0]["errorCode"], "UNAUTHENTICATED_MESSAGE")
        signed = sign_payload(h.command([item("A01")], command_id="signed", order_id="signed-order"),
                              h.cfg.iot_secret)
        h.send(signed)
        self.assertTrue(h.machine._queue.qsize())


class DispenseTests(unittest.TestCase):
    def test_success_single_item_and_state_sequence(self):
        h = Harness()
        result = h.run([item("A01", 1, slotId="s1", productId="p1")], order_id="o1", machineId="m-uuid")
        self.assertEqual((result["eventCode"], result["status"]), ("DISPENSE_SUCCESS", "SUCCESS"))
        self.assertIsNone(result["errorCode"])
        self.assertEqual((result["commandId"], result["orderId"], result["machineCode"]), ("cmd_1", "o1", CODE))
        self.assertEqual(result["machineId"], "m-uuid")
        self.assertEqual(result["items"][0]["dispensedQuantity"], 1)
        self.assertEqual(result["items"][0]["slotId"], "s1")
        self.assertFalse(result["replayed"])
        self.assertEqual(list(h.machine.state_log)[:5], ["IDLE", "RECEIVED_COMMAND", "MOTOR_RUNNING", "DISPENSING", "SUCCESS"])
        self.assertEqual(h.machine.internal_state(), "IDLE")
        self.assertEqual(len(h.results()), 1)

    def test_multi_item_dispensed_sequentially_with_pause(self):
        h = Harness()
        result = h.run([item("A01", 2), item("A02", 1)])
        self.assertEqual([i["dispensedQuantity"] for i in result["items"]], [2, 1])
        # 3 lần quay motor + 2 lần nghỉ đệm 1s (giữa 2 hộp cùng cột và giữa 2 món)
        self.assertEqual(h.sleeps.count(1.0), 2)

    def test_motor_time_within_spec_and_scaled(self):
        h = Harness(time_scale=0.5)
        h.run([item("A01")])
        motor = h.sleeps[0]
        self.assertTrue(0.75 <= motor <= 1.0, motor)   # (1.5..2.0) * 0.5

    def test_retry_then_success(self):
        h = Harness()
        h.faults.set_jam("A01", 1)
        result = h.run([item("A01")])
        self.assertEqual(result["status"], "SUCCESS")
        self.assertEqual((result["retryCount"], result["items"][0]["retryCount"]), (1, 1))
        self.assertIn("RETRYING", h.machine.state_log)
        self.assertEqual(h.machine.locked_columns(), [])

    def test_jam_after_two_retries_locks_column_and_fails(self):
        h = Harness()
        h.faults.set_jam("A02")
        result = h.run([item("A02")])
        self.assertEqual((result["eventCode"], result["errorCode"]), ("DISPENSE_FAILED", "DISPENSE_JAM"))
        self.assertEqual(result["retryCount"], 2)
        self.assertEqual(h.machine.locked_columns(), ["A02"])
        self.assertEqual(h.machine.backend_state(), "ERROR")
        self.assertEqual([a["alertCode"] for a in h.alerts()], ["DISPENSE_JAM"])
        self.assertEqual(h.alerts()[0]["orderId"], "ord-1")

    def test_partial_failure_reports_each_item(self):
        h = Harness()
        h.faults.set_jam("A02")
        result = h.run([item("A01"), item("A02"), item("A03")])
        self.assertEqual([i["status"] for i in result["items"]], ["SUCCESS", "FAILED", "SKIPPED"])
        self.assertEqual(result["items"][0]["dispensedQuantity"], 1)
        self.assertEqual(result["status"], "FAILED")

    def test_locked_column_rejected_without_running_motor_then_clear_fault(self):
        h = Harness()
        h.faults.set_jam("A02")
        h.run([item("A02")], command_id="c1", order_id="o1")
        sleeps_before = len(h.sleeps)
        rejected = h.run([item("A01"), item("A02")], command_id="c2", order_id="o2")
        self.assertEqual(rejected["errorCode"], "COLUMN_LOCKED")
        self.assertEqual(len(h.sleeps), sleeps_before, "không được quay motor khi đơn bị từ chối ở bước kiểm tra")
        self.assertEqual([i["status"] for i in rejected["items"]], ["SKIPPED", "REJECTED"])

        h.broker.publish_json(h.topics.control, {"action": "CLEAR_FAULT", "columnId": "a2", "requestId": "r1"})
        ack = h.broker.messages_on(h.topics.control_result)[-1]
        self.assertEqual((ack["status"], ack["requestId"], ack["clearedColumns"]), ("OK", "r1", ["A02"]))
        ok = h.run([item("A02")], command_id="c3", order_id="o3")
        self.assertEqual(ok["status"], "SUCCESS")
        self.assertEqual(h.machine.backend_state(), "IDLE")

    def test_control_rejects_unknown_action_and_unknown_column(self):
        h = Harness()
        h.broker.publish_json(h.topics.control, {"action": "REBOOT"})
        h.broker.publish_json(h.topics.control, {"action": "CLEAR_FAULT", "columnId": "Z99"})
        statuses = [m["status"] for m in h.broker.messages_on(h.topics.control_result)]
        self.assertEqual(statuses, ["REJECTED", "REJECTED"])

    def test_out_of_stock_and_unknown_column(self):
        h = Harness()
        h.faults.set_empty("A03")
        self.assertEqual(h.run([item("A03")], command_id="c1", order_id="o1")["errorCode"], "OUT_OF_STOCK")
        self.assertEqual(h.run([item("B09")], command_id="c2", order_id="o2")["errorCode"], "COLUMN_NOT_FOUND")
        self.assertEqual(h.sleeps, [])

    def test_a1_and_a01_refer_to_same_column(self):
        h = Harness()
        h.faults.set_jam("A1")
        self.assertEqual(h.run([item("A01")])["errorCode"], "DISPENSE_JAM")


class IdempotencyTests(unittest.TestCase):
    def test_duplicate_command_replays_result_without_motor(self):
        h = Harness()
        payload = h.command([item("A01")])
        h.send(payload)
        h.machine._queue.get_nowait()          # lấy lệnh ra như worker
        cmd = parse_dispense_command(payload, CODE)
        first = h.machine.process_command(cmd)
        sleeps = len(h.sleeps)

        h.send(payload)                         # Backend/broker gửi lại
        replay = h.results()[-1]
        self.assertTrue(replay["replayed"])
        self.assertEqual((replay["commandId"], replay["status"]), (first["commandId"], first["status"]))
        self.assertEqual(len(h.sleeps), sleeps, "không được quay motor lần hai")
        self.assertTrue(h.machine._queue.empty())

    def test_duplicate_of_a_failed_command_replays_failure_even_after_fault_cleared(self):
        h = Harness()
        h.faults.set_jam("A01")
        payload = h.command([item("A01")], command_id="c1", order_id="o1")
        h.machine.process_command(parse_dispense_command(payload, CODE))
        h.machine.clear_faults()               # lỗi đã được sửa, nhưng cùng commandId vẫn không được nhả lại
        sleeps = len(h.sleeps)
        h.send(payload)
        replay = h.results()[-1]
        self.assertEqual((replay["status"], replay["errorCode"], replay["replayed"]), ("FAILED", "DISPENSE_JAM", True))
        self.assertEqual(len(h.sleeps), sleeps)
        self.assertTrue(h.machine._queue.empty())

    def test_same_command_id_for_a_different_order_is_rejected_not_replayed(self):
        h = Harness()
        h.run([item("A01")], command_id="cmd_12345678", order_id="12345678-aaaa")
        sleeps = len(h.sleeps)
        h.send(h.command([item("A02")], command_id="cmd_12345678", order_id="12345678-bbbb"))
        r = h.results()[-1]
        self.assertEqual((r["status"], r["errorCode"], r["orderId"]), ("FAILED", "COMMAND_ID_CONFLICT", "12345678-bbbb"))
        self.assertFalse(r.get("replayed"))
        self.assertEqual(len(h.sleeps), sleeps)
        self.assertTrue(h.machine._queue.empty())

    def test_command_id_collision_while_first_is_inflight_is_reported_not_swallowed(self):
        h = Harness()
        h.send(h.command([item("A01")], command_id="cmd_12345678", order_id="12345678-aaaa"))   # đang chờ xử lý
        h.send(h.command([item("A02")], command_id="cmd_12345678", order_id="12345678-bbbb"))
        self.assertEqual(h.machine._queue.qsize(), 1)
        self.assertEqual([(r["orderId"], r["errorCode"]) for r in h.results()], [("12345678-bbbb", "COMMAND_ID_CONFLICT")])

    def test_same_order_new_command_id_after_success_never_dispenses_twice(self):
        h = Harness()
        h.run([item("A01")], command_id="c1", order_id="o1")
        sleeps = len(h.sleeps)
        h.send(h.command([item("A01")], command_id="c2", order_id="o1"))
        replay = h.results()[-1]
        self.assertEqual((replay["commandId"], replay["status"], replay["replayed"]), ("c2", "SUCCESS", True))
        self.assertEqual(len(h.sleeps), sleeps)

    def test_same_order_new_command_id_after_failure_is_processed_again(self):
        h = Harness()
        h.faults.set_jam("A01")
        h.run([item("A01")], command_id="c1", order_id="o1")
        h.machine.clear_faults()
        h.send(h.command([item("A01")], command_id="c2", order_id="o1"))
        self.assertEqual(h.machine._queue.qsize(), 1)

    def test_duplicate_while_inflight_is_ignored(self):
        h = Harness()
        payload = h.command([item("A01")])
        h.send(payload)
        h.send(payload)
        self.assertEqual(h.machine._queue.qsize(), 1)
        self.assertEqual(h.results(), [])

    def test_persisted_results_survive_restart(self):
        with tempfile.TemporaryDirectory() as tmp:
            h1 = Harness(store=StateStore(tmp, CODE))
            h1.faults.set_jam("A04")
            h1.run([item("A04")], command_id="cj", order_id="oj")
            h1.run([item("A01")], command_id="c1", order_id="o1")

            h2 = Harness(store=StateStore(tmp, CODE))
            h2.machine._load_state()
            self.assertEqual(h2.machine.locked_columns(), ["A04"])
            h2.send(h2.command([item("A01")], command_id="c1", order_id="o1"))
            self.assertTrue(h2.results()[-1]["replayed"])
            self.assertEqual(h2.sleeps, [])

    def test_corrupt_state_file_is_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            store = StateStore(tmp, CODE)
            store.path.write_text("{broken", encoding="utf-8")
            self.assertEqual(store.load(), {})


class InvalidInputTests(unittest.TestCase):
    def test_invalid_command_with_ids_publishes_failed(self):
        h = Harness()
        h.send({"commandId": "c9", "orderId": "o9", "items": []})
        r = h.results()[0]
        self.assertEqual((r["status"], r["errorCode"], r["commandId"], r["orderId"]), ("FAILED", "INVALID_COMMAND", "c9", "o9"))
        self.assertTrue(h.machine._queue.empty())

    def test_garbage_without_ids_is_only_logged(self):
        h = Harness()
        h.transport._broker.deliver(h.topics.dispense_command, b"\xff\xfe not json")
        self.assertEqual(h.results(), [])

    def test_machine_mismatch_is_rejected(self):
        h = Harness()
        h.send(h.command([item()], machineCode="VM002"))
        self.assertEqual(h.results()[0]["errorCode"], "MACHINE_MISMATCH")
        self.assertEqual(h.results()[0]["machineCode"], CODE)
        self.assertTrue(h.machine._queue.empty())


class SensorTests(unittest.TestCase):
    def test_telemetry_is_backward_compatible_with_sprint1_and_backend_state_is_valid(self):
        h = Harness()
        t = h.machine.publish_telemetry()
        for key in ("machineCode", "machineState", "temperature", "humidity", "doorStatus", "sensorStatus", "timestamp"):
            self.assertIn(key, t)
        self.assertIn(t["machineState"], {"IDLE", "BUSY", "DISPENSING", "ERROR", "MAINTENANCE", "OFFLINE"})
        self.assertTrue(3.5 <= t["temperature"] <= 6.5)
        self.assertEqual(h.broker.messages_on(h.topics.telemetry)[0]["machineCode"], CODE)

    def test_telemetry_reports_transport_offline_separately_from_internal_state(self):
        h = Harness(iot_secret="test-device-secret-at-least-32-bytes")
        h.transport.simulate_network_loss()
        payload = h.machine.build_telemetry(h.machine.sample_sensors())
        self.assertEqual(payload["connectionStatus"], "OFFLINE")
        self.assertEqual(payload["machineState"], "OFFLINE")
        self.assertEqual(payload["internalState"], "IDLE")

    def test_sensor_fault_holds_last_value_then_flags_fault_after_threshold(self):
        h = Harness()
        good = h.machine.sample_sensors()["temperature"]
        h.faults.sensor_fault = True
        s1, s2 = h.machine.sample_sensors(), h.machine.sample_sensors()
        self.assertEqual((s1["temperature"], s1["sensorStatus"]), (good, "OK"))
        self.assertEqual((s2["temperature"], s2["sensorStatus"]), (good, "OK"))
        s3 = h.machine.sample_sensors()
        self.assertEqual((s3["temperature"], s3["sensorStatus"]), (None, "FAULT"))
        h.machine.sample_sensors()
        self.assertEqual([a["alertCode"] for a in h.alerts()], ["SENSOR_FAULT"], "chỉ cảnh báo một lần")
        self.assertEqual(h.machine.backend_state(), "ERROR")
        h.machine.clear_faults()
        self.assertEqual(h.machine.sample_sensors()["sensorStatus"], "OK")

    def test_high_temperature_alerts_then_locks_sales_then_auto_unlocks(self):
        now = [0.0]
        h = Harness(clock=lambda: now[0], temp_lock_after=60)
        h.faults.force_temp = 9.8
        h.machine.sample_sensors()
        self.assertEqual([a["alertCode"] for a in h.alerts()], ["TEMP_OUT_OF_RANGE"])
        self.assertFalse(h.machine._temp_locked)
        now[0] = 61
        h.machine.sample_sensors()
        self.assertTrue(h.machine._temp_locked)
        self.assertEqual(h.alerts()[-1]["alertCode"], "TEMP_LOCK")
        self.assertEqual(h.alerts()[-1]["severity"], "CRITICAL")
        self.assertEqual(h.run([item("A01")])["errorCode"], "MACHINE_LOCKED")
        self.assertEqual(h.sleeps, [])
        h.faults.force_temp = 5.0
        h.machine.sample_sensors()
        self.assertFalse(h.machine._temp_locked)
        self.assertEqual(h.run([item("A01")])["status"], "SUCCESS")

    def test_door_open_alert_once(self):
        h = Harness()
        h.faults.door_open = True
        self.assertEqual(h.machine.sample_sensors()["doorStatus"], "OPEN")
        h.machine.sample_sensors()
        self.assertEqual([a["alertCode"] for a in h.alerts()], ["DOOR_OPEN"])


class OfflineTests(unittest.TestCase):
    def test_last_will_published_on_network_loss(self):
        h = Harness()
        h.transport.simulate_network_loss()
        status = json.loads(h.broker.retained[h.topics.status])
        self.assertEqual((status["status"], status["reason"]), ("OFFLINE", "LAST_WILL"))

    def test_results_and_telemetry_buffered_while_offline_then_flushed_in_order(self):
        h = Harness()
        h.transport.simulate_network_loss()
        h.faults.set_jam("A01")
        h.run([item("A01")], command_id="c1", order_id="o1")     # kết quả + cảnh báo
        h.machine.publish_telemetry()
        snap = h.machine.snapshot()
        self.assertEqual((snap["outbox"], snap["telemetryBuffer"], snap["connected"]), (2, 1, False))
        self.assertEqual(h.results(), [])

        h.transport.restore_network()
        self.assertEqual(len(h.results()), 1)
        self.assertEqual(h.results()[0]["commandId"], "c1")
        self.assertEqual(len(h.alerts()), 1)
        flushed = h.broker.messages_on(h.topics.telemetry)
        self.assertTrue(flushed[0]["buffered"])
        self.assertTrue(verify_payload(flushed[0], h.cfg.iot_secret))
        snap = h.machine.snapshot()
        self.assertEqual((snap["outbox"], snap["telemetryBuffer"]), (0, 0))
        self.assertEqual(json.loads(h.broker.retained[h.topics.status])["status"], "ONLINE")

    def test_outbox_is_bounded(self):
        h = Harness(outbox_size=3)
        h.transport.simulate_network_loss()
        for _ in range(10):
            h.machine.publish_telemetry()
        self.assertEqual(h.machine.snapshot()["telemetryBuffer"], 3)


class EndToEndWorkerTest(unittest.TestCase):
    def test_worker_thread_processes_queue_fifo_and_stops_cleanly(self):
        h = Harness(time_scale=0.001, telemetry_interval=0.05)
        h.machine._sleep = lambda s: (time.sleep(min(s, 0.002)), False)[1]
        h.faults.set_jam("A02")
        h.machine.start()                      # nối lại + thread worker/telemetry
        try:
            h.send(h.command([item("A01")], command_id="c1", order_id="o1"))
            h.send(h.command([item("A02")], command_id="c2", order_id="o2"))
            deadline = time.time() + 5
            while len(h.results()) < 2 and time.time() < deadline:
                time.sleep(0.01)
            self.assertEqual([r["commandId"] for r in h.results()], ["c1", "c2"])
            self.assertEqual([r["status"] for r in h.results()], ["SUCCESS", "FAILED"])
            self.assertGreaterEqual(len(h.broker.messages_on(h.topics.telemetry)), 1)
        finally:
            h.machine.stop()
        self.assertEqual(json.loads(h.broker.retained[h.topics.status])["status"], "OFFLINE")
        self.assertFalse(any(t.is_alive() for t in h.machine._threads))

    def test_shutdown_mid_dispense_does_not_record_a_result(self):
        h = Harness()
        h.machine._sleep = lambda s: True      # mô phỏng bị dừng ngay khi đang chờ motor
        cmd = parse_dispense_command(h.command([item("A01")]), CODE)
        self.assertIsNone(h.machine.process_command(cmd))
        self.assertEqual(h.results(), [])
        self.assertEqual(h.machine.snapshot()["cachedResults"], 0)
        self.assertEqual(h.machine.internal_state(), "IDLE")


class FaultInjectorTests(unittest.TestCase):
    def test_jam_counter(self):
        f = FaultInjector()
        f.set_jam("A01", 2)
        self.assertEqual([f.consume_jam("A01") for _ in range(3)], [True, True, False])
        f.set_jam("A02")
        self.assertTrue(all(f.consume_jam("A02") for _ in range(5)))
        f.clear_jam("A02")
        self.assertFalse(f.consume_jam("A02"))
        with self.assertRaises(ValueError):
            f.set_jam("A01", 0)


if __name__ == "__main__":
    unittest.main()
