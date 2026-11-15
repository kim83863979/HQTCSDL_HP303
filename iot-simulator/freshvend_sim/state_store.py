"""Lưu bền vững cache kết quả (idempotency) và trạng thái khóa cột để sống sót qua việc khởi động lại."""
from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import Any, Dict

log = logging.getLogger("freshvend.store")


class StateStore:
    VERSION = 1

    def __init__(self, directory: str, machine_code: str, enabled: bool = True) -> None:
        self.enabled = enabled
        self.path = Path(directory) / f"{machine_code}.json"

    def load(self) -> Dict[str, Any]:
        if not self.enabled or not self.path.is_file():
            return {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and data.get("version") == self.VERSION:
                return data
            log.warning("File state %s sai phiên bản, bỏ qua.", self.path)
        except (OSError, ValueError) as exc:
            log.warning("Không đọc được state %s (%s); khởi động với state rỗng.", self.path, exc)
        return {}

    def save(self, data: Dict[str, Any]) -> None:
        if not self.enabled:
            return
        payload = dict(data, version=self.VERSION)
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            # Ghi nguyên tử: không để lại file hỏng nếu tiến trình bị dừng giữa chừng.
            fd, tmp_name = tempfile.mkstemp(dir=str(self.path.parent), suffix=".tmp")
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False)
            os.replace(tmp_name, self.path)
        except OSError as exc:
            log.error("Không ghi được state %s: %s", self.path, exc)
