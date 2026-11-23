"""Durable retry queue for the authenticated HTTP telemetry fallback."""
from __future__ import annotations

import json
import logging
import os
import threading
import urllib.error
import urllib.request
from collections import deque
from pathlib import Path
from typing import Any, Deque, Dict, Optional

log = logging.getLogger("freshvend.http")


class HttpTelemetrySender:
    def __init__(
        self,
        backend_url: str,
        iot_secret: str,
        timeout: float = 5.0,
        state_dir: str = ".sim_state",
        machine_code: str = "machine",
    ) -> None:
        if not iot_secret or len(iot_secret.encode("utf-8")) < 32:
            raise ValueError("HTTP telemetry requires an IOT_DEVICE_SECRET of at least 32 bytes.")
        self.endpoint = f"{backend_url.rstrip('/')}/api/machines/simulator/status"
        self._secret = iot_secret
        self._timeout = timeout
        self._spool_file = Path(state_dir) / f"http-telemetry-{machine_code}.json"
        self._pending: Deque[Dict[str, Any]] = deque()
        self._lock = threading.Lock()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._last_error: Optional[str] = None
        self._spool_file.parent.mkdir(parents=True, exist_ok=True)
        if self._spool_file.exists():
            saved = json.loads(self._spool_file.read_text(encoding="utf-8"))
            if not isinstance(saved, list) or not all(isinstance(item, dict) for item in saved):
                raise ValueError(f"Invalid HTTP telemetry spool: {self._spool_file}")
            self._pending.extend(saved)
        self._thread = threading.Thread(target=self._run, name=f"http-telemetry-{machine_code}", daemon=True)
        self._thread.start()

    def __call__(self, payload: Dict[str, Any]) -> bool:
        with self._lock:
            self._pending.append(dict(payload))
            try:
                self._persist()
            except OSError:
                self._pending.pop()
                log.exception("Unable to persist HTTP telemetry spool.")
                return False
        self._wake.set()
        return True

    def _persist(self) -> None:
        temporary = self._spool_file.with_suffix(self._spool_file.suffix + ".tmp")
        temporary.write_text(
            json.dumps(list(self._pending), ensure_ascii=False, separators=(",", ":"), allow_nan=False),
            encoding="utf-8",
        )
        os.replace(temporary, self._spool_file)

    def _send_once(self, payload: Dict[str, Any]) -> Optional[str]:
        headers = {
            "Content-Type": "application/json",
            "x-iot-key": self._secret,
        }
        request = urllib.request.Request(
            self.endpoint,
            data=json.dumps(payload, allow_nan=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=self._timeout):
                return None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:200]
            return f"Backend rejected telemetry (HTTP {exc.code}): {detail}"
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            return f"Backend is unavailable at {self.endpoint}: {exc}"

    def _run(self) -> None:
        delay = 1.0
        while not self._stop.is_set():
            self._wake.wait(1.0)
            self._wake.clear()
            while not self._stop.is_set():
                with self._lock:
                    payload = self._pending[0] if self._pending else None
                if payload is None:
                    delay = 1.0
                    break

                error = self._send_once(payload)
                if error is None:
                    with self._lock:
                        if self._pending and self._pending[0] is payload:
                            self._pending.popleft()
                            try:
                                self._persist()
                            except OSError:
                                self._pending.appendleft(payload)
                                log.exception("Unable to update HTTP telemetry spool after delivery.")
                                self._stop.wait(delay)
                                continue
                    self._last_error = None
                    delay = 1.0
                    continue

                if error != self._last_error:
                    self._last_error = error
                    log.warning(error)
                self._stop.wait(delay)
                delay = min(delay * 2, 60.0)

    def close(self) -> None:
        self._stop.set()
        self._wake.set()
        self._thread.join(timeout=2.0)
