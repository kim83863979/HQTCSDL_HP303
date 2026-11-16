"""Cấu hình simulator: đọc từ biến môi trường (.env) và tham số CLI. Không chứa secret trong mã nguồn."""
from __future__ import annotations

import os
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from .protocol import DEFAULT_TOPIC_PREFIX, normalize_column, normalize_machine_code

DEFAULT_SLOTS = ("A01", "A02", "A03", "A04")  # khớp seed_data.sql của VM001


def load_env_file(path: Path) -> None:
    """Nạp file .env đơn giản (KEY=VALUE). Không ghi đè biến đã có trong môi trường."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass
class SimConfig:
    machine_code: str = "VM001"

    # Broker (thông tin xác thực CHỈ lấy từ môi trường)
    broker_host: str = "localhost"
    broker_port: int = 1883
    username: Optional[str] = None
    password: Optional[str] = None
    use_tls: bool = False
    topic_prefix: str = DEFAULT_TOPIC_PREFIX

    # Telemetry
    telemetry_interval: float = 2.0
    telemetry_transport: str = "mqtt"        # mqtt | http | both
    backend_url: str = "http://localhost:3000"
    iot_secret: Optional[str] = None
    require_message_auth: bool = False
    min_temp: float = 2.0
    max_temp: float = 8.0
    temp_lock_after: float = 300.0           # giây vượt ngưỡng liên tục trước khi khóa bán hàng (ERR-06)
    sensor_fault_threshold: int = 3          # số lần đọc lỗi liên tiếp trước khi gắn cờ FAULT (ERR-07)

    # Cơ cấu nhả hàng
    slots: List[str] = field(default_factory=lambda: list(DEFAULT_SLOTS))
    motor_min: float = 1.5
    motor_max: float = 2.0
    drop_window: float = 3.0                 # N giây chờ cảm biến rơi
    drop_detect_delay: float = 0.5           # thời gian cảm biến báo rơi khi nhả thành công
    inter_item_pause: float = 1.0
    max_retries: int = 2
    jam_rate: float = 0.0                    # xác suất kẹt ngẫu nhiên mỗi lần quay (thiết kế: < 2%)
    time_scale: float = 1.0                  # 0.1 = chạy nhanh gấp 10 lần (demo/test)
    seed: Optional[int] = None

    # Bền vững & hàng đợi offline
    persist: bool = True
    state_dir: str = ".sim_state"
    outbox_size: int = 500

    @classmethod
    def from_env(cls) -> "SimConfig":
        cfg = cls()
        cfg.machine_code = os.getenv("MACHINE_CODE", cfg.machine_code)
        cfg.broker_host = os.getenv("MQTT_HOST", cfg.broker_host)
        try:
            cfg.broker_port = int(os.getenv("MQTT_PORT", cfg.broker_port))
        except ValueError as exc:
            raise ValueError("MQTT_PORT phải là số nguyên.") from exc
        cfg.username = os.getenv("MQTT_USERNAME") or None
        cfg.password = os.getenv("MQTT_PASSWORD") or None
        cfg.use_tls = env_bool("MQTT_TLS", cfg.use_tls)
        cfg.topic_prefix = os.getenv("MQTT_TOPIC_PREFIX", cfg.topic_prefix)
        cfg.backend_url = os.getenv("BACKEND_URL", cfg.backend_url)
        cfg.iot_secret = os.getenv("IOT_DEVICE_SECRET") or None
        cfg.require_message_auth = os.getenv("NODE_ENV", "").lower() == "production"
        return cfg

    def validate(self) -> "SimConfig":
        self.machine_code = normalize_machine_code(self.machine_code)
        self.slots = sorted({normalize_column(s) for s in self.slots})
        if not self.slots:
            raise ValueError("Cần ít nhất một khe (--slots).")
        if self.telemetry_transport not in {"mqtt", "http", "both"}:
            raise ValueError("telemetry_transport phải là mqtt, http hoặc both.")
        if not 0 < self.broker_port < 65536:
            raise ValueError("broker_port không hợp lệ.")
        numeric_values = {
            "telemetry_interval": self.telemetry_interval,
            "time_scale": self.time_scale,
            "min_temp": self.min_temp,
            "max_temp": self.max_temp,
            "temp_lock_after": self.temp_lock_after,
            "jam_rate": self.jam_rate,
            "motor_min": self.motor_min,
            "motor_max": self.motor_max,
            "drop_window": self.drop_window,
            "drop_detect_delay": self.drop_detect_delay,
            "inter_item_pause": self.inter_item_pause,
        }
        if any(not math.isfinite(value) for value in numeric_values.values()):
            raise ValueError("Các giá trị cấu hình dạng số phải hữu hạn.")
        if self.telemetry_interval <= 0 or self.time_scale <= 0:
            raise ValueError("telemetry_interval và time_scale phải > 0.")
        if self.min_temp >= self.max_temp:
            raise ValueError("min_temp phải nhỏ hơn max_temp.")
        if self.iot_secret and len(self.iot_secret.encode("utf-8")) < 32:
            raise ValueError("IOT_DEVICE_SECRET phải có ít nhất 32 byte.")
        if self.require_message_auth and not self.iot_secret:
            raise ValueError("IOT_DEVICE_SECRET là bắt buộc khi NODE_ENV=production.")
        if self.telemetry_transport in {"http", "both"} and not self.iot_secret:
            raise ValueError("IOT_DEVICE_SECRET là bắt buộc khi gửi telemetry qua HTTP.")
        if not 0 <= self.jam_rate <= 1:
            raise ValueError("jam_rate phải trong [0, 1].")
        if self.motor_min <= 0 or self.motor_min > self.motor_max:
            raise ValueError("motor_min/motor_max không hợp lệ.")
        if self.max_retries < 0 or self.outbox_size < 1:
            raise ValueError("max_retries >= 0 và outbox_size >= 1.")
        return self
