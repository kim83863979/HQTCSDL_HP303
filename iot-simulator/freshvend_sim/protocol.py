"""Hợp đồng MQTT giữa Backend (KIM) và IoT Simulator (HẢI).

Mọi quy ước topic/payload nằm ở MỘT file này để khi nhóm đổi hợp đồng
chỉ cần sửa tại đây (và README).
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Union

DEFAULT_TOPIC_PREFIX = "freshvend"

MACHINE_CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{1,31}$")  # cấm ký tự wildcard / và + #
COLUMN_ID_RE = re.compile(r"^([A-Z])([0-9]{1,3})$")
MAX_PAYLOAD_BYTES = 64 * 1024
MAX_ITEMS = 50
MAX_ITEM_QUANTITY = 100
MAX_ID_LENGTH = 128

EVENT_SUCCESS = "DISPENSE_SUCCESS"
EVENT_FAILED = "DISPENSE_FAILED"


class ErrorCode:
    INVALID_COMMAND = "INVALID_COMMAND"
    MACHINE_MISMATCH = "MACHINE_MISMATCH"
    COMMAND_ID_CONFLICT = "COMMAND_ID_CONFLICT"  # commandId đã gắn với một đơn khác
    MACHINE_LOCKED = "MACHINE_LOCKED"      # khóa bán hàng do nhiệt độ vượt ngưỡng (ERR-06)
    COLUMN_NOT_FOUND = "COLUMN_NOT_FOUND"
    COLUMN_LOCKED = "COLUMN_LOCKED"        # cột đang bị khóa do kẹt hàng
    OUT_OF_STOCK = "OUT_OF_STOCK"          # cảm biến cột báo trống (ERR-05)
    DISPENSE_JAM = "DISPENSE_JAM"          # kẹt hàng sau khi thử lại (ERR-01)


class ItemStatus:
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    REJECTED = "REJECTED"   # bị từ chối ở bước kiểm tra, chưa quay motor
    SKIPPED = "SKIPPED"     # chưa xử lý vì món trước đó đã lỗi


def utc_now_iso(milliseconds: bool = True) -> str:
    spec = "milliseconds" if milliseconds else "seconds"
    return datetime.now(timezone.utc).isoformat(timespec=spec).replace("+00:00", "Z")


def normalize_machine_code(value: str) -> str:
    code = str(value).strip().upper()
    if not MACHINE_CODE_RE.match(code):
        raise ValueError(f"Mã máy không hợp lệ: {value!r} (chỉ gồm A-Z, 0-9, '-', '_'; dài 2-32 ký tự).")
    return code


def normalize_column(column_id: str) -> str:
    """A1, a01, A001 -> 'A01' để khớp quy ước slotCode của Backend (A01) lẫn tài liệu thiết kế (A1)."""
    match = COLUMN_ID_RE.match(str(column_id).strip().upper())
    if not match:
        raise ValueError(f"Mã cột không hợp lệ: {column_id!r} (ví dụ hợp lệ: A01, B2).")
    return f"{match.group(1)}{int(match.group(2)):02d}"


@dataclass(frozen=True)
class Topics:
    """Topic theo đề xuất Sprint 3: freshvend/{machineCode}/..."""

    telemetry: str
    dispense_command: str
    dispense_result: str
    status: str
    control: str
    control_result: str
    alert: str

    @classmethod
    def for_machine(cls, machine_code: str, prefix: str = DEFAULT_TOPIC_PREFIX) -> "Topics":
        code = normalize_machine_code(machine_code)
        prefix = prefix.strip("/")
        if not prefix or any(ch in prefix for ch in "+#"):
            raise ValueError("topic prefix không hợp lệ.")
        base = f"{prefix}/{code}"
        return cls(
            telemetry=f"{base}/telemetry",
            dispense_command=f"{base}/commands/dispense",
            dispense_result=f"{base}/events/dispense-result",
            status=f"{base}/status",
            control=f"{base}/commands/control",
            control_result=f"{base}/events/control-result",
            alert=f"{base}/events/alert",
        )


def make_will(topics: "Topics", machine_code: str):
    """Last Will & Testament: broker tự phát khi máy rớt mạng đột ngột (ERR-08)."""
    payload = {"machineCode": machine_code, "status": "OFFLINE", "machineState": "OFFLINE", "reason": "LAST_WILL"}
    return topics.status, payload, 1, True


# ─── Lệnh DISPENSE ───────────────────────────────────────────────────────────

@dataclass(frozen=True)
class DispenseItem:
    column_id: str                 # đúng như Backend gửi (để echo lại)
    column_key: str                # đã chuẩn hóa (A01)
    quantity: int
    slot_id: Optional[str] = None
    product_id: Optional[str] = None


@dataclass(frozen=True)
class DispenseCommand:
    command_id: str
    order_id: str
    machine_code: str
    items: List[DispenseItem]
    machine_id: Optional[str] = None
    timestamp: Optional[str] = None


class CommandValidationError(Exception):
    def __init__(self, code: str, message: str,
                 command_id: Optional[str] = None, order_id: Optional[str] = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.command_id = command_id
        self.order_id = order_id


def _as_id(value: Any, field: str, required: bool = True) -> Optional[str]:
    if value is None or value == "":
        if required:
            raise CommandValidationError(ErrorCode.INVALID_COMMAND, f"Thiếu '{field}'.")
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int)):
        raise CommandValidationError(ErrorCode.INVALID_COMMAND, f"'{field}' phải là chuỗi hoặc số nguyên.")
    text = str(value).strip()
    if not text or len(text) > MAX_ID_LENGTH or any(ord(ch) < 32 for ch in text):
        raise CommandValidationError(ErrorCode.INVALID_COMMAND, f"'{field}' không hợp lệ.")
    return text


def _safe_id(value: Any) -> Optional[str]:
    try:
        return _as_id(value, "id", required=False)
    except CommandValidationError:
        return None


def decode_json_object(raw: Union[bytes, str, Dict[str, Any]]) -> Dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    data = raw.encode("utf-8") if isinstance(raw, str) else raw
    if len(data) > MAX_PAYLOAD_BYTES:
        raise CommandValidationError(ErrorCode.INVALID_COMMAND, "Payload vượt quá kích thước cho phép.")
    try:
        parsed = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise CommandValidationError(ErrorCode.INVALID_COMMAND, f"Payload không phải JSON hợp lệ: {exc}") from exc
    if not isinstance(parsed, dict):
        raise CommandValidationError(ErrorCode.INVALID_COMMAND, "Payload phải là JSON object.")
    return parsed


def parse_dispense_command(raw: Union[bytes, str, Dict[str, Any]], own_machine_code: str) -> DispenseCommand:
    """Kiểm tra mã máy, mã lệnh/đơn, khe và số lượng. Ném CommandValidationError nếu sai."""
    data = decode_json_object(raw)
    cmd_id_hint, order_id_hint = _safe_id(data.get("commandId")), _safe_id(data.get("orderId"))

    try:
        command_id = _as_id(data.get("commandId"), "commandId")
        order_id = _as_id(data.get("orderId"), "orderId")

        code_raw = data.get("machineCode")
        if code_raw is not None:
            try:
                command_machine = normalize_machine_code(code_raw)
            except ValueError as exc:
                raise CommandValidationError(ErrorCode.INVALID_COMMAND, str(exc)) from exc
            if command_machine != own_machine_code:
                raise CommandValidationError(
                    ErrorCode.MACHINE_MISMATCH,
                    f"Lệnh dành cho máy {command_machine} nhưng được gửi tới {own_machine_code}.",
                )

        items_raw = data.get("items")
        if not isinstance(items_raw, list) or not items_raw:
            raise CommandValidationError(ErrorCode.INVALID_COMMAND, "'items' phải là mảng không rỗng.")
        if len(items_raw) > MAX_ITEMS:
            raise CommandValidationError(ErrorCode.INVALID_COMMAND, f"Tối đa {MAX_ITEMS} dòng items mỗi lệnh.")

        items: List[DispenseItem] = []
        for index, item in enumerate(items_raw):
            if not isinstance(item, dict):
                raise CommandValidationError(ErrorCode.INVALID_COMMAND, f"items[{index}] phải là object.")
            column = _as_id(item.get("columnId"), f"items[{index}].columnId")
            try:
                column_key = normalize_column(column)
            except ValueError as exc:
                raise CommandValidationError(ErrorCode.INVALID_COMMAND, str(exc)) from exc
            quantity = item.get("quantity")
            if isinstance(quantity, bool) or not isinstance(quantity, int) \
                    or not 1 <= quantity <= MAX_ITEM_QUANTITY:
                raise CommandValidationError(
                    ErrorCode.INVALID_COMMAND,
                    f"items[{index}].quantity phải là số nguyên từ 1 đến {MAX_ITEM_QUANTITY}.",
                )
            items.append(DispenseItem(
                column_id=column,
                column_key=column_key,
                quantity=quantity,
                slot_id=_as_id(item.get("slotId"), f"items[{index}].slotId", required=False),
                product_id=_as_id(item.get("productId"), f"items[{index}].productId", required=False),
            ))

        return DispenseCommand(
            command_id=command_id,
            order_id=order_id,
            machine_code=own_machine_code,
            items=items,
            machine_id=_as_id(data.get("machineId"), "machineId", required=False),
            timestamp=data.get("timestamp") if isinstance(data.get("timestamp"), str) else None,
        )
    except CommandValidationError as err:
        err.command_id = err.command_id or cmd_id_hint
        err.order_id = err.order_id or order_id_hint
        raise
