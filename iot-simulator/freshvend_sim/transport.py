"""Lớp truyền thông MQTT.

- PahoTransport  : kết nối broker thật (Mosquitto) bằng paho-mqtt >= 2.0.
- InMemoryBroker : broker giả trong tiến trình, dùng cho unit test và demo không cần cài broker.

VirtualMachine chỉ làm việc với giao diện Transport nên logic nghiệp vụ test được độc lập với broker.
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any, Callable, Dict, List, Optional, Tuple

log = logging.getLogger("freshvend.transport")

MessageHandler = Callable[[str, bytes], None]


class Transport:
    """Giao diện tối thiểu mà VirtualMachine cần."""

    on_connected: Optional[Callable[[], None]] = None
    on_disconnected: Optional[Callable[[], None]] = None

    def connect(self) -> None: raise NotImplementedError
    def disconnect(self) -> None: raise NotImplementedError
    def is_connected(self) -> bool: raise NotImplementedError

    def subscribe(self, topic: str, handler: MessageHandler, qos: int = 1) -> None:
        raise NotImplementedError

    def publish(self, topic: str, payload: Dict[str, Any], qos: int = 0, retain: bool = False) -> bool:
        """Trả False nếu hiện không gửi được (mất kết nối) để caller đưa vào bộ đệm."""
        raise NotImplementedError


# ─── Broker thật ─────────────────────────────────────────────────────────────

class PahoTransport(Transport):
    def __init__(self, host: str, port: int, client_id: str,
                 username: Optional[str] = None, password: Optional[str] = None, use_tls: bool = False,
                 will: Optional[Tuple[str, Dict[str, Any], int, bool]] = None) -> None:
        try:
            import paho.mqtt.client as mqtt
        except ImportError as exc:  # pragma: no cover - phụ thuộc môi trường
            raise RuntimeError("Thiếu thư viện paho-mqtt. Chạy: pip install -r requirements.txt") from exc

        self._mqtt = mqtt
        self._host, self._port = host, port
        self._connected = threading.Event()
        self._last_publish = None
        self._handlers: Dict[str, Tuple[MessageHandler, int]] = {}

        # clean_session=True: lệnh gửi khi máy offline sẽ không bị phát lại muộn; Backend chịu trách nhiệm gửi lại.
        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=client_id,
            protocol=mqtt.MQTTv311,
        )
        if username:
            self._client.username_pw_set(username, password or None)
        if use_tls:
            self._client.tls_set()
        if will:
            topic, payload, qos, retain = will
            self._client.will_set(topic, json.dumps(payload), qos=qos, retain=retain)
        self._client.reconnect_delay_set(min_delay=1, max_delay=30)
        self._client.on_connect = self._handle_connect
        self._client.on_disconnect = self._handle_disconnect
        self._client.on_message = self._handle_message

    def connect(self) -> None:
        # connect_async + loop_start: tự kết nối lại nền, kể cả khi broker chưa chạy lúc khởi động.
        self._client.connect_async(self._host, self._port, keepalive=15)
        self._client.loop_start()

    def disconnect(self) -> None:
        try:
            if self._last_publish is not None and self.is_connected():
                try:  # đảm bảo bản tin cuối (status OFFLINE) kịp rời máy trước khi ngắt
                    self._last_publish.wait_for_publish(timeout=2)
                except (ValueError, RuntimeError):
                    pass
            self._client.disconnect()
        finally:
            self._client.loop_stop()
            self._connected.clear()

    def is_connected(self) -> bool:
        return self._connected.is_set()

    def subscribe(self, topic: str, handler: MessageHandler, qos: int = 1) -> None:
        self._handlers[topic] = (handler, qos)
        if self.is_connected():
            self._client.subscribe(topic, qos)

    def publish(self, topic: str, payload: Dict[str, Any], qos: int = 0, retain: bool = False) -> bool:
        if not self.is_connected():
            return False
        info = self._client.publish(topic, json.dumps(payload, ensure_ascii=False), qos=qos, retain=retain)
        if qos > 0:
            self._last_publish = info
        return info.rc == self._mqtt.MQTT_ERR_SUCCESS

    # paho VERSION2 callbacks
    def _handle_connect(self, client, userdata, flags, reason_code, properties) -> None:
        if reason_code.is_failure:
            log.error("Broker từ chối kết nối: %s", reason_code)
            return
        log.info("Đã kết nối broker %s:%s", self._host, self._port)
        for topic, (_, qos) in self._handlers.items():
            client.subscribe(topic, qos)  # session sạch nên phải subscribe lại sau mỗi lần nối
        self._connected.set()
        if self.on_connected:
            self.on_connected()

    def _handle_disconnect(self, client, userdata, disconnect_flags, reason_code, properties) -> None:
        was_connected = self._connected.is_set()
        self._connected.clear()
        if was_connected:
            log.warning("Mất kết nối broker (%s). Tự động kết nối lại...", reason_code)
            if self.on_disconnected:
                self.on_disconnected()

    def _handle_message(self, client, userdata, message) -> None:
        entry = self._handlers.get(message.topic)
        if entry is None:
            return
        try:
            entry[0](message.topic, bytes(message.payload))
        except Exception:  # noqa: BLE001 - không để lỗi handler làm chết luồng mạng của paho
            log.exception("Lỗi khi xử lý message trên %s", message.topic)


# ─── Broker giả trong bộ nhớ (test/demo) ─────────────────────────────────────

class InMemoryBroker:
    """Broker tối giản: khớp topic chính xác, hỗ trợ retained + Last Will khi mất kết nối."""

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._subs: Dict[str, List[Tuple["InMemoryTransport", MessageHandler]]] = {}
        self.retained: Dict[str, bytes] = {}
        self.log: List[Tuple[str, bytes]] = []

    def attach_listener(self, topic: str, handler: MessageHandler) -> None:
        """Đăng ký 1 listener thuần (Backend giả, không cần Transport)."""
        with self._lock:
            self._subs.setdefault(topic, []).append((None, handler))  # type: ignore[arg-type]

    def _subscribe(self, owner: "InMemoryTransport", topic: str, handler: MessageHandler) -> None:
        with self._lock:
            self._subs.setdefault(topic, []).append((owner, handler))

    def deliver(self, topic: str, payload: bytes, retain: bool = False) -> None:
        with self._lock:
            self.log.append((topic, payload))
            if retain:
                self.retained[topic] = payload
            targets = list(self._subs.get(topic, []))
        for owner, handler in targets:
            if owner is None or owner.is_connected():
                handler(topic, payload)

    def publish_json(self, topic: str, payload: Any, retain: bool = False) -> None:
        self.deliver(topic, json.dumps(payload).encode("utf-8"), retain)

    def messages_on(self, topic: str) -> List[Dict[str, Any]]:
        with self._lock:
            return [json.loads(p) for t, p in self.log if t == topic]


class InMemoryTransport(Transport):
    def __init__(self, broker: InMemoryBroker,
                 will: Optional[Tuple[str, Dict[str, Any], int, bool]] = None) -> None:
        self._broker = broker
        self._will = will
        self._connected = False
        self._subscriptions: List[Tuple[str, MessageHandler]] = []

    def connect(self) -> None:
        self._connected = True
        if self.on_connected:
            self.on_connected()

    def disconnect(self) -> None:
        self._connected = False  # ngắt chủ động: không phát Last Will (giống MQTT thật)

    def is_connected(self) -> bool:
        return self._connected

    def subscribe(self, topic: str, handler: MessageHandler, qos: int = 1) -> None:
        self._subscriptions.append((topic, handler))
        self._broker._subscribe(self, topic, handler)

    def publish(self, topic: str, payload: Dict[str, Any], qos: int = 0, retain: bool = False) -> bool:
        if not self._connected:
            return False
        self._broker.publish_json(topic, payload, retain)
        return True

    # Hàm hỗ trợ test mất/khôi phục mạng
    def simulate_network_loss(self) -> None:
        if not self._connected:
            return
        self._connected = False
        if self._will:
            topic, payload, _, retain = self._will
            self._broker.publish_json(topic, payload, retain)  # broker phát Last Will
        if self.on_disconnected:
            self.on_disconnected()

    def restore_network(self) -> None:
        self._connected = True
        if self.on_connected:
            self.on_connected()
