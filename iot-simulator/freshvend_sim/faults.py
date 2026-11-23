"""Bảng giả lập lỗi (Fault Injection Panel): ép kẹt hàng, nhiệt độ cao, hỏng DHT22, mở cửa, cột trống."""
from __future__ import annotations

import threading
from typing import Dict, Optional, Set

from .protocol import normalize_column


class FaultInjector:
    """Thread-safe: console (stdin), worker nhả hàng và luồng telemetry cùng truy cập."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._jam: Dict[str, int] = {}      # cột -> số lần kiểm tra rơi sẽ thất bại còn lại (-1 = vĩnh viễn)
        self._empty: Set[str] = set()
        self.force_temp: Optional[float] = None
        self.sensor_fault = False
        self.door_open = False

    def set_jam(self, column: str, failures: int = -1) -> None:
        if failures == 0 or failures < -1:
            raise ValueError("failures phải là số nguyên dương hoặc -1 (kẹt vĩnh viễn).")
        with self._lock:
            self._jam[normalize_column(column)] = failures

    def clear_jam(self, column: Optional[str] = None) -> None:
        with self._lock:
            if column is None:
                self._jam.clear()
            else:
                self._jam.pop(normalize_column(column), None)

    def consume_jam(self, column: str) -> bool:
        """True nếu lần kiểm tra cảm biến rơi này phải thất bại (đồng thời trừ bộ đếm)."""
        key = normalize_column(column)
        with self._lock:
            remaining = self._jam.get(key)
            if remaining is None:
                return False
            if remaining > 0:
                remaining -= 1
                if remaining == 0:
                    del self._jam[key]
                else:
                    self._jam[key] = remaining
            return True

    def jammed_columns(self) -> Dict[str, int]:
        with self._lock:
            return dict(self._jam)

    def set_empty(self, column: str, empty: bool = True) -> None:
        key = normalize_column(column)
        with self._lock:
            (self._empty.add if empty else self._empty.discard)(key)

    def is_empty(self, column: str) -> bool:
        with self._lock:
            return normalize_column(column) in self._empty

    def clear_empty(self, column: Optional[str] = None) -> None:
        with self._lock:
            if column is None:
                self._empty.clear()
            else:
                self._empty.discard(normalize_column(column))
