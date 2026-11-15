"""Đường gửi telemetry HTTP (tương thích Sprint 1) tới POST /api/machines/simulator/status.

Dùng tạm cho tới khi Backend (KIM) có MQTT subscriber: chạy với --telemetry-transport both|http.
"""
from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

log = logging.getLogger("freshvend.http")


class HttpTelemetrySender:
    def __init__(self, backend_url: str, iot_secret: Optional[str] = None, timeout: float = 5.0) -> None:
        self.endpoint = f"{backend_url.rstrip('/')}/api/machines/simulator/status"
        self._secret = iot_secret
        self._timeout = timeout
        self._last_error: Optional[str] = None  # chỉ log khi lỗi đổi, tránh spam mỗi 2 giây

    def __call__(self, payload: Dict[str, Any]) -> bool:
        headers = {"Content-Type": "application/json"}
        if self._secret:
            headers["x-iot-key"] = self._secret
        request = urllib.request.Request(
            self.endpoint, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=self._timeout):
                self._last_error = None
                return True
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:200]
            self._report(f"Backend từ chối telemetry (HTTP {exc.code}): {detail}")
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            self._report(f"Backend chưa sẵn sàng tại {self.endpoint}: {exc}")
        return False

    def _report(self, message: str) -> None:
        if message != self._last_error:
            self._last_error = message
            log.warning(message)
