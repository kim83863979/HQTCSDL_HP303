"""Máy bán hàng ảo: máy trạng thái, mô phỏng motor/cảm biến rơi, idempotency và bộ đệm offline.

Luồng nhả hàng (khớp tài liệu thiết kế mục 2.4.3 và Sprint 3):
  nhận lệnh -> validate -> chống trùng -> hàng đợi (FIFO, mỗi lúc một lệnh)
  -> kiểm tra vật lý toàn bộ cột -> với từng món: MOTOR_RUNNING -> DISPENSING (cảm biến rơi)
     -> RETRYING (tối đa max_retries) -> DISPENSE_JAM + khóa cột
  -> publish DISPENSE_SUCCESS / DISPENSE_FAILED (QoS 1) -> IDLE.
"""
from __future__ import annotations

import logging
import queue
import random
import threading
import time
from collections import OrderedDict, deque
from typing import Any, Callable, Deque, Dict, List, Optional, Tuple

from .config import SimConfig
from .auth import sign_payload, verify_payload
from .faults import FaultInjector
from .protocol import (
    CommandValidationError, DispenseCommand, DispenseItem, ErrorCode, ItemStatus, Topics,
    EVENT_FAILED, EVENT_SUCCESS, decode_json_object, normalize_column, parse_dispense_command, utc_now_iso,
)
from .state_store import StateStore
from .transport import Transport

log = logging.getLogger("freshvend.machine")

# Trạng thái nội bộ (thiết kế 2.4.2)
IDLE, RECEIVED_COMMAND, MOTOR_RUNNING, DISPENSING = "IDLE", "RECEIVED_COMMAND", "MOTOR_RUNNING", "DISPENSING"
RETRYING, SUCCESS, JAM_LOCKED, OFFLINE = "RETRYING", "SUCCESS", "JAM_LOCKED", "OFFLINE"

# Backend (machine.service.js) chỉ chấp nhận: IDLE, BUSY, DISPENSING, ERROR, MAINTENANCE, OFFLINE
BACKEND_STATE = {
    IDLE: "IDLE", RECEIVED_COMMAND: "BUSY", MOTOR_RUNNING: "DISPENSING", DISPENSING: "DISPENSING",
    RETRYING: "DISPENSING", SUCCESS: "IDLE", JAM_LOCKED: "ERROR", OFFLINE: "OFFLINE",
}

SLOT_ACTIVE, SLOT_JAMMED, SLOT_EMPTY = "ACTIVE", "JAMMED", "EMPTY"
RESULT_CACHE_SIZE = 500


class _Interrupted(Exception):
    """Simulator bị dừng giữa lúc đang nhả hàng."""


class VirtualMachine:
    def __init__(
        self,
        config: SimConfig,
        transport: Transport,
        faults: Optional[FaultInjector] = None,
        store: Optional[StateStore] = None,
        sleep: Optional[Callable[[float], bool]] = None,
        clock: Callable[[], float] = time.monotonic,
        http_sender: Optional[Callable[[Dict[str, Any]], bool]] = None,
    ) -> None:
        self.cfg = config
        self.machine_code = config.machine_code
        self.topics = Topics.for_machine(self.machine_code, config.topic_prefix)
        self.faults = faults or FaultInjector()
        self._transport = transport
        self._store = store or StateStore(config.state_dir, self.machine_code, enabled=False)
        self._clock = clock
        self._http_sender = http_sender
        self._rng = random.Random(config.seed)
        self._stop = threading.Event()
        self._sleep = sleep or (lambda seconds: self._stop.wait(seconds))
        self._started_at = time.time()

        self._lock = threading.RLock()
        self._flush_lock = threading.Lock()
        self._slots: Dict[str, str] = {code: SLOT_ACTIVE for code in config.slots}
        self._results: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()   # commandId -> kết quả cuối
        self._order_success: Dict[str, str] = {}                           # orderId -> commandId đã nhả thành công
        self._inflight: Dict[str, str] = {}   # commandId -> orderId đang xử lý/chờ trong hàng đợi
        self._queue: "queue.Queue[DispenseCommand]" = queue.Queue()
        self._outbox: Deque[Tuple[str, Dict[str, Any], int, bool]] = deque(maxlen=config.outbox_size)
        self._telemetry_buffer: Deque[Tuple[str, Dict[str, Any], int, bool]] = deque(maxlen=config.outbox_size)

        self._activity = IDLE
        self.state_log: Deque[str] = deque([IDLE], maxlen=300)   # lịch sử chuyển trạng thái (debug/test)

        # Mô hình cảm biến
        self._temp = 4.5
        self._last_valid_temp = 4.5
        self._sensor_failures = 0
        self._sensor_alerted = False
        self._out_since: Optional[float] = None
        self._range_alerted = False
        self._temp_locked = False
        self._door_alerted = False

        self._threads: List[threading.Thread] = []
        self._started = False

    # ─── Vòng đời ────────────────────────────────────────────────────────────

    def start(self) -> None:
        self._load_state()
        self._started = True
        self._transport.on_connected = self._on_connected
        self._transport.on_disconnected = self._on_disconnected
        self._transport.subscribe(self.topics.dispense_command, self.handle_dispense_message, qos=1)
        self._transport.subscribe(self.topics.control, self.handle_control_message, qos=1)
        self._transport.connect()
        self._spawn(self._command_worker, "dispense-worker")
        self._spawn(self._telemetry_loop, "telemetry")
        log.info("Máy %s khởi động | khe: %s", self.machine_code, ", ".join(self.cfg.slots))

    def stop(self) -> None:
        self._stop.set()
        self._publish(self.topics.status, self._status_payload("OFFLINE"), qos=1, retain=True, buffer="none")
        self._transport.disconnect()
        self._started = False
        if self._http_sender and hasattr(self._http_sender, "close"):
            self._http_sender.close()
        for thread in self._threads:
            thread.join(timeout=3)
        log.info("Máy %s đã dừng.", self.machine_code)

    def _spawn(self, target: Callable[[], None], name: str) -> None:
        thread = threading.Thread(target=target, name=f"{self.machine_code}-{name}", daemon=True)
        thread.start()
        self._threads.append(thread)

    def _on_connected(self) -> None:
        self._publish(self.topics.status, self._status_payload("ONLINE"), qos=1, retain=True, buffer="none")
        self._flush_outbox()

    def _on_disconnected(self) -> None:
        log.warning("Chuyển sang Offline Mode: sự kiện được lưu đệm và đồng bộ lại khi có mạng (ERR-08).")

    def _status_payload(self, status: str) -> Dict[str, Any]:
        return {
            "machineCode": self.machine_code,
            "status": status,
            "connectionStatus": status,
            "machineState": BACKEND_STATE[OFFLINE] if status == "OFFLINE" else self.backend_state(),
            "timestamp": utc_now_iso(),
        }

    # ─── Trạng thái ──────────────────────────────────────────────────────────

    def _set_activity(self, state: str) -> None:
        with self._lock:
            if state != self._activity:
                self._activity = state
                self.state_log.append(state)

    def locked_columns(self) -> List[str]:
        with self._lock:
            return sorted(code for code, status in self._slots.items() if status == SLOT_JAMMED)

    def internal_state(self) -> str:
        with self._lock:
            activity = self._activity
        if activity != IDLE:
            return activity
        if self.locked_columns() or self._temp_locked or self._sensor_failures >= self.cfg.sensor_fault_threshold:
            return JAM_LOCKED
        return IDLE

    def backend_state(self) -> str:
        return BACKEND_STATE[self.internal_state()]

    def snapshot(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "machineCode": self.machine_code,
                "internalState": self.internal_state(),
                "slots": dict(self._slots),
                "tempLocked": self._temp_locked,
                "queued": self._queue.qsize(),
                "cachedResults": len(self._results),
                "outbox": len(self._outbox),
                "telemetryBuffer": len(self._telemetry_buffer),
                "connected": self._transport.is_connected(),
                "injectedJams": self.faults.jammed_columns(),
                "forceTemp": self.faults.force_temp,
                "sensorFault": self.faults.sensor_fault,
                "doorOpen": self.faults.door_open,
            }

    # ─── Publish + bộ đệm offline ────────────────────────────────────────────

    def _publish(self, topic: str, payload: Dict[str, Any], qos: int, retain: bool = False,
                 buffer: str = "critical") -> bool:
        try:
            payload = sign_payload(payload, self.cfg.iot_secret)
            sent = self._transport.publish(topic, payload, qos, retain)
        except Exception:  # noqa: BLE001
            log.exception("Lỗi publish tới %s", topic)
            sent = False
        if not sent and buffer != "none":
            with self._lock:
                if buffer == "telemetry":
                    buffered_payload = sign_payload(
                        dict(payload, buffered=True),
                        self.cfg.iot_secret,
                    )
                    self._telemetry_buffer.append((topic, buffered_payload, qos, retain))
                else:
                    self._outbox.append((topic, payload, qos, retain))
        return sent

    def _flush_outbox(self) -> None:
        """Đẩy bù theo đúng thứ tự: kết quả/cảnh báo trước, telemetry sau."""
        with self._flush_lock:
            for buf in (self._outbox, self._telemetry_buffer):
                while True:
                    with self._lock:
                        item = buf[0] if buf else None
                    if item is None:
                        break
                    if not self._transport.publish(*item):
                        return  # lại rớt mạng: giữ nguyên phần còn lại
                    with self._lock:
                        if buf and buf[0] is item:
                            buf.popleft()

    # ─── Telemetry & cảm biến ────────────────────────────────────────────────

    def _telemetry_loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.publish_telemetry()
            except Exception:  # noqa: BLE001
                log.exception("Lỗi khi gửi telemetry")
            self._stop.wait(self.cfg.telemetry_interval)

    def _next_raw_temperature(self) -> Optional[float]:
        if self.faults.sensor_fault:
            return None  # DHT22 trả NaN
        if self.faults.force_temp is not None:
            return float(self.faults.force_temp)
        self._temp = min(6.5, max(3.5, self._temp + self._rng.uniform(-0.3, 0.3)))
        return self._temp

    def sample_sensors(self) -> Dict[str, Any]:
        cfg = self.cfg
        raw = self._next_raw_temperature()
        sensor_status = "OK"
        if raw is None:
            self._sensor_failures += 1
            if self._sensor_failures >= cfg.sensor_fault_threshold:
                sensor_status, temperature = "FAULT", None
                if not self._sensor_alerted:
                    self._sensor_alerted = True
                    self.emit_alert("SENSOR_FAULT", "ERROR", "Cảm biến DHT22 lỗi liên tiếp, cần bảo trì.")
            else:
                temperature = self._last_valid_temp  # dùng giá trị hợp lệ gần nhất, thử đọc lại (ERR-07)
        else:
            self._sensor_failures, self._sensor_alerted = 0, False
            self._last_valid_temp = temperature = raw

        if temperature is not None:
            self._track_temperature_range(temperature)

        door = "OPEN" if self.faults.door_open else "CLOSED"
        if door == "OPEN" and not self._door_alerted:
            self._door_alerted = True
            self.emit_alert("DOOR_OPEN", "WARNING", "Cửa máy đang mở.")
        elif door == "CLOSED":
            self._door_alerted = False

        return {
            "temperature": None if temperature is None else round(temperature, 2),
            "humidity": round(self._rng.uniform(62.0, 72.0), 2),
            "doorStatus": door,
            "sensorStatus": sensor_status,
        }

    def _track_temperature_range(self, temperature: float) -> None:
        cfg, now = self.cfg, self._clock()
        if temperature < cfg.min_temp or temperature > cfg.max_temp:
            if self._out_since is None:
                self._out_since = now
            if not self._range_alerted:
                self._range_alerted = True
                self.emit_alert("TEMP_OUT_OF_RANGE", "WARNING",
                                f"Nhiệt độ {temperature:.1f}°C ngoài ngưỡng {cfg.min_temp}-{cfg.max_temp}°C.",
                                temperature=round(temperature, 2))
            if not self._temp_locked and now - self._out_since >= cfg.temp_lock_after:
                self._temp_locked = True
                self.emit_alert("TEMP_LOCK", "CRITICAL",
                                "Nhiệt độ vượt ngưỡng kéo dài: khóa bán hàng để bảo vệ chuỗi lạnh.",
                                temperature=round(temperature, 2))
        elif self._out_since is not None:
            log.info("Nhiệt độ trở lại ngưỡng an toàn, mở khóa bán hàng.")
            self._out_since, self._range_alerted, self._temp_locked = None, False, False

    def build_telemetry(self, sample: Dict[str, Any]) -> Dict[str, Any]:
        # Tương thích bản tin Sprint 1; `internalState` và `lockedSlots` là trường bổ sung.
        connected = self._transport.is_connected()
        return {
            "machineCode": self.machine_code,
            "machineState": self.backend_state() if connected else "OFFLINE",
            "connectionStatus": "ONLINE" if connected else "OFFLINE",
            "internalState": self.internal_state(),
            "temperature": sample["temperature"],
            "humidity": sample["humidity"],
            "doorStatus": sample["doorStatus"],
            "sensorStatus": sample["sensorStatus"],
            "lockedSlots": self.locked_columns(),
            "timestamp": utc_now_iso(milliseconds=False),
        }

    def publish_telemetry(self) -> Dict[str, Any]:
        payload = self.build_telemetry(self.sample_sensors())
        if self.cfg.telemetry_transport in {"mqtt", "both"}:
            self._publish(self.topics.telemetry, payload, qos=0, buffer="telemetry")
        if self.cfg.telemetry_transport in {"http", "both"} and self._http_sender:
            self._http_sender(payload)
        return payload

    def emit_alert(self, code: str, severity: str, message: str, **extra: Any) -> None:
        payload = {"alertCode": code, "severity": severity, "message": message,
                   "machineCode": self.machine_code, "timestamp": utc_now_iso(), **extra}
        log.warning("ALERT %s: %s", code, message)
        self._publish(self.topics.alert, payload, qos=1)

    # ─── Nhận lệnh DISPENSE ──────────────────────────────────────────────────

    def handle_dispense_message(self, topic: str, raw: bytes) -> None:
        """Chạy trên luồng mạng: chỉ validate + chống trùng + xếp hàng, tuyệt đối không chặn."""
        try:
            data = decode_json_object(raw)
            if not verify_payload(data, self.cfg.iot_secret):
                raise CommandValidationError(
                    "UNAUTHENTICATED_MESSAGE",
                    "Lệnh MQTT thiếu chữ ký hoặc có chữ ký không hợp lệ.",
                    data.get("commandId") if isinstance(data.get("commandId"), str) else None,
                    data.get("orderId") if isinstance(data.get("orderId"), str) else None,
                )
            cmd = parse_dispense_command(raw, self.machine_code)
        except CommandValidationError as err:
            self._reject_invalid(err)
            return

        action, replay = "queue", None
        with self._lock:
            cached = self._results.get(cmd.command_id)
            owner = cached.get("orderId") if cached is not None else self._inflight.get(cmd.command_id)
            if owner is not None and owner != cmd.order_id:
                # Cùng commandId nhưng KHÁC đơn (vd. Backend cắt 8 ký tự đầu UUID và bị va chạm):
                # tuyệt đối không trả nhầm kết quả của đơn khác, cũng không im lặng bỏ qua.
                action = "conflict"
            else:
                if cached is None and cmd.order_id in self._order_success:
                    # Cùng đơn đã nhả THÀNH CÔNG dưới commandId khác: không bao giờ nhả lần hai.
                    cached = self._results.get(self._order_success[cmd.order_id])
                if cached is not None:
                    action = "replay"
                    replay = dict(cached, commandId=cmd.command_id, replayed=True, replayedAt=utc_now_iso())
                elif cmd.command_id in self._inflight:
                    action = "ignore"
                else:
                    self._inflight[cmd.command_id] = cmd.order_id

        if action == "conflict":
            self._reject_invalid(CommandValidationError(
                ErrorCode.COMMAND_ID_CONFLICT,
                f"commandId {cmd.command_id} đã gắn với một đơn khác (xung đột mã lệnh).",
                cmd.command_id, cmd.order_id))
        elif action == "replay":
            log.info("Lệnh trùng %s/%s: gửi lại kết quả đã lưu, KHÔNG quay motor (ERR-04).",
                     cmd.command_id, cmd.order_id)
            self._publish(self.topics.dispense_result, replay, qos=1)
        elif action == "ignore":
            log.info("Bỏ qua lệnh trùng %s đang được xử lý.", cmd.command_id)
        else:
            self._queue.put(cmd)

    def _reject_invalid(self, err: CommandValidationError) -> None:
        log.warning("Từ chối lệnh không hợp lệ (%s): %s", err.code, err.message)
        if err.command_id is None and err.order_id is None:
            return  # không có mã để Backend đối chiếu, chỉ ghi log
        result = {
            "eventCode": EVENT_FAILED, "status": "FAILED",
            "commandId": err.command_id, "orderId": err.order_id, "machineCode": self.machine_code,
            "items": [], "retryCount": 0, "errorCode": err.code, "errorMessage": err.message,
            "replayed": False, "timestamp": utc_now_iso(),
        }
        self._publish(self.topics.dispense_result, result, qos=1)

    def _command_worker(self) -> None:
        while not self._stop.is_set():
            try:
                cmd = self._queue.get(timeout=0.2)
            except queue.Empty:
                continue
            try:
                self.process_command(cmd)
            except Exception:  # noqa: BLE001
                log.exception("Lỗi không mong đợi khi xử lý lệnh %s", cmd.command_id)
                with self._lock:
                    self._inflight.pop(cmd.command_id, None)

    # ─── Xử lý một lệnh ──────────────────────────────────────────────────────

    def _wait(self, seconds: float) -> None:
        if self._sleep(seconds * self.cfg.time_scale):
            raise _Interrupted()

    def process_command(self, cmd: DispenseCommand) -> Optional[Dict[str, Any]]:
        started_wall, started = utc_now_iso(), self._clock()
        log.info("Nhận lệnh %s (đơn %s): %s", cmd.command_id, cmd.order_id,
                 ", ".join(f"{i.column_key}x{i.quantity}" for i in cmd.items))
        try:
            self._set_activity(RECEIVED_COMMAND)
            rejection = self._precheck(cmd)
            items = rejection if rejection is not None else self._run_items(cmd)
        except _Interrupted:
            log.warning("Lệnh %s bị ngắt do simulator dừng; không ghi kết quả.", cmd.command_id)
            with self._lock:
                self._inflight.pop(cmd.command_id, None)
            return None
        finally:
            self._set_activity(IDLE)

        failed = next((i for i in items if i["status"] in (ItemStatus.FAILED, ItemStatus.REJECTED)), None)
        succeeded = failed is None
        result = {
            "eventCode": EVENT_SUCCESS if succeeded else EVENT_FAILED,
            "status": "SUCCESS" if succeeded else "FAILED",
            "commandId": cmd.command_id, "orderId": cmd.order_id,
            "machineCode": self.machine_code, "machineId": cmd.machine_id,
            "items": items,
            "retryCount": sum(i["retryCount"] for i in items),
            "errorCode": None if succeeded else failed["errorCode"],
            "errorMessage": None if succeeded else failed.get("errorMessage"),
            "replayed": False,
            "startedAt": started_wall, "timestamp": utc_now_iso(),
            "durationMs": int((self._clock() - started) * 1000),
        }
        self._remember_result(cmd, result)
        log.info("Kết quả lệnh %s: %s%s", cmd.command_id, result["eventCode"],
                 "" if succeeded else f" ({result['errorCode']})")
        self._publish(self.topics.dispense_result, result, qos=1)
        return result

    def _remember_result(self, cmd: DispenseCommand, result: Dict[str, Any]) -> None:
        with self._lock:
            self._results[cmd.command_id] = result
            self._results.move_to_end(cmd.command_id)
            while len(self._results) > RESULT_CACHE_SIZE:
                old_id, old = self._results.popitem(last=False)
                if self._order_success.get(old.get("orderId")) == old_id:
                    del self._order_success[old["orderId"]]
            if result["status"] == "SUCCESS":
                self._order_success[cmd.order_id] = cmd.command_id
            self._inflight.pop(cmd.command_id, None)
        self._save_state()

    def _item_record(self, item: DispenseItem, status: str, dispensed: int = 0, retries: int = 0,
                     code: Optional[str] = None, message: Optional[str] = None) -> Dict[str, Any]:
        return {
            "columnId": item.column_id, "slotId": item.slot_id, "productId": item.product_id,
            "quantity": item.quantity, "dispensedQuantity": dispensed, "status": status,
            "retryCount": retries, "errorCode": code, "errorMessage": message,
        }

    def _precheck(self, cmd: DispenseCommand) -> Optional[List[Dict[str, Any]]]:
        """Kiểm tra điều kiện vật lý cho TOÀN BỘ đơn trước khi quay motor để tránh nhả dở dang."""
        problem: Optional[Tuple[int, str, str]] = None
        if self._temp_locked:
            problem = (0, ErrorCode.MACHINE_LOCKED, "Máy đang khóa bán hàng do nhiệt độ vượt ngưỡng.")
        else:
            for index, item in enumerate(cmd.items):
                with self._lock:
                    status = self._slots.get(item.column_key)
                if status is None:
                    problem = (index, ErrorCode.COLUMN_NOT_FOUND, f"Máy không có cột {item.column_id}.")
                elif status == SLOT_JAMMED:
                    problem = (index, ErrorCode.COLUMN_LOCKED, f"Cột {item.column_id} đang bị khóa do kẹt hàng.")
                elif status == SLOT_EMPTY or self.faults.is_empty(item.column_key):
                    problem = (index, ErrorCode.OUT_OF_STOCK, f"Cảm biến báo cột {item.column_id} đã trống.")
                if problem:
                    break
        if problem is None:
            return None
        bad_index, code, message = problem
        return [
            self._item_record(item, ItemStatus.REJECTED, code=code, message=message) if i == bad_index
            else self._item_record(item, ItemStatus.SKIPPED)
            for i, item in enumerate(cmd.items)
        ]

    def _run_items(self, cmd: DispenseCommand) -> List[Dict[str, Any]]:
        """Nhả tuần tự từng món để tránh nghẽn hộc nhận hàng."""
        records: List[Dict[str, Any]] = []
        failed = False
        for index, item in enumerate(cmd.items):
            if failed:
                records.append(self._item_record(item, ItemStatus.SKIPPED))
                continue
            if index > 0:
                self._wait(self.cfg.inter_item_pause)
            record = self._dispense_item(cmd, item)
            records.append(record)
            failed = record["status"] != ItemStatus.SUCCESS
        self._set_activity(SUCCESS if not failed else IDLE)
        return records

    def _drop_sensor_detects(self, column_key: str) -> bool:
        if self.faults.consume_jam(column_key):
            return False
        return self._rng.random() >= self.cfg.jam_rate

    def _dispense_item(self, cmd: DispenseCommand, item: DispenseItem) -> Dict[str, Any]:
        cfg, dispensed, total_retries = self.cfg, 0, 0
        for unit in range(item.quantity):
            if unit > 0:
                self._wait(cfg.inter_item_pause)
            retries = 0
            while True:
                self._set_activity(MOTOR_RUNNING)
                self._wait(self._rng.uniform(cfg.motor_min, cfg.motor_max))
                self._set_activity(DISPENSING)
                dropped = self._drop_sensor_detects(item.column_key)
                self._wait(cfg.drop_detect_delay if dropped else cfg.drop_window)
                if dropped:
                    dispensed += 1
                    break
                if retries < cfg.max_retries:
                    retries += 1
                    total_retries += 1
                    self._set_activity(RETRYING)
                    log.warning("Cột %s không ghi nhận hàng rơi, thử lại %d/%d.",
                                item.column_key, retries, cfg.max_retries)
                    continue
                return self._lock_jammed_column(cmd, item, dispensed, total_retries)
        return self._item_record(item, ItemStatus.SUCCESS, dispensed, total_retries)

    def _lock_jammed_column(self, cmd: DispenseCommand, item: DispenseItem,
                            dispensed: int, retries: int) -> Dict[str, Any]:
        with self._lock:
            self._slots[item.column_key] = SLOT_JAMMED
        message = f"Kẹt hàng tại cột {item.column_id} sau {retries} lần thử lại; cột đã bị khóa."
        self.emit_alert("DISPENSE_JAM", "ERROR", message, commandId=cmd.command_id,
                        orderId=cmd.order_id, columnId=item.column_id)
        return self._item_record(item, ItemStatus.FAILED, dispensed, retries, ErrorCode.DISPENSE_JAM, message)

    # ─── Lệnh điều khiển (Operator/Admin) ────────────────────────────────────

    def handle_control_message(self, topic: str, raw: bytes) -> None:
        request_id: Optional[str] = None
        try:
            data = decode_json_object(raw)
            if not verify_payload(data, self.cfg.iot_secret):
                raise CommandValidationError(
                    "UNAUTHENTICATED_MESSAGE",
                    "Lệnh điều khiển MQTT thiếu chữ ký hoặc có chữ ký không hợp lệ.",
                )
            target_code = data.get("machineCode")
            if target_code is not None and str(target_code).strip().upper() != self.machine_code:
                raise CommandValidationError(
                    "MACHINE_MISMATCH",
                    f"Lệnh điều khiển dành cho máy {target_code}, không phải {self.machine_code}.",
                )
            request_id = data.get("requestId") if isinstance(data.get("requestId"), str) else None
            if not request_id:
                raise CommandValidationError("INVALID_COMMAND", "Thiếu requestId.")
            action = str(data.get("action", "")).upper()
            if action != "CLEAR_FAULT":
                raise CommandValidationError("UNSUPPORTED_ACTION", f"Chưa hỗ trợ action {action!r}.")
            column = data.get("columnId")
            cleared = self.clear_faults(normalize_column(column) if column else None)
            self._publish_control_result(request_id, action, "OK", clearedColumns=cleared)
        except (CommandValidationError, ValueError) as exc:
            code = getattr(exc, "code", "INVALID_COMMAND")
            self._publish_control_result(request_id, "UNKNOWN", "REJECTED", errorCode=code, errorMessage=str(exc))

    def _publish_control_result(self, request_id: Optional[str], action: str, status: str, **extra: Any) -> None:
        payload = {"requestId": request_id, "action": action, "status": status,
                   "machineCode": self.machine_code, "timestamp": utc_now_iso(), **extra}
        self._publish(self.topics.control_result, payload, qos=1)

    def clear_faults(self, column: Optional[str] = None) -> List[str]:
        """CLEAR_FAULT: mở khóa cột (kẹt/trống) và, khi không chỉ định cột, xóa cả lỗi cấp máy."""
        with self._lock:
            targets = [column] if column else list(self._slots)
            if column is not None and column not in self._slots:
                raise ValueError(f"Máy không có cột {column}.")
            cleared = []
            for code in targets:
                if self._slots[code] != SLOT_ACTIVE or self.faults.is_empty(code) or code in self.faults.jammed_columns():
                    cleared.append(code)
                self._slots[code] = SLOT_ACTIVE
                self.faults.clear_jam(code)
                self.faults.clear_empty(code)
            if column is None:
                self.faults.sensor_fault = False
                self._sensor_failures, self._sensor_alerted = 0, False
                self._temp_locked, self._out_since, self._range_alerted = False, None, False
        self._save_state()
        log.info("CLEAR_FAULT %s -> đã xử lý: %s", column or "(toàn máy)", cleared or "không có gì cần xóa")
        return cleared

    # ─── Bền vững ────────────────────────────────────────────────────────────

    def _save_state(self) -> None:
        with self._lock:
            data = {"results": list(self._results.items()), "orderSuccess": dict(self._order_success),
                    "slots": dict(self._slots)}
        self._store.save(data)

    def _load_state(self) -> None:
        data = self._store.load()
        if not data:
            return
        with self._lock:
            for command_id, result in data.get("results", []):
                self._results[command_id] = result
            self._order_success.update(data.get("orderSuccess", {}))
            for code, status in data.get("slots", {}).items():
                if code in self._slots and status in (SLOT_ACTIVE, SLOT_JAMMED, SLOT_EMPTY):
                    self._slots[code] = status
        log.info("Đã khôi phục state: %d kết quả lệnh, cột khóa: %s", len(self._results), self.locked_columns() or "không")
