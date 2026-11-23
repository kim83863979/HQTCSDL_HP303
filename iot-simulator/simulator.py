#!/usr/bin/env python3
"""FreshVend IoT Simulator (Sprint 3) - phụ trách: HẢI.

Ví dụ:
    python simulator.py --machine VM001
    python simulator.py --machine VM001 --telemetry-transport both --console
    python simulator.py --jam-slot A02          # A02 luôn kẹt -> demo nhả thất bại
"""
from __future__ import annotations

import argparse
import logging
import signal
import sys
import threading
from pathlib import Path

from freshvend_sim.config import SimConfig, load_env_file
from freshvend_sim.auth import sign_payload
from freshvend_sim.console import run_console
from freshvend_sim.faults import FaultInjector
from freshvend_sim.http_telemetry import HttpTelemetrySender
from freshvend_sim.machine import VirtualMachine
from freshvend_sim.state_store import StateStore
from freshvend_sim.transport import PahoTransport
from freshvend_sim.protocol import Topics, make_will


def build_parser(defaults: SimConfig) -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="FreshVend IoT Simulator (Sprint 3: MQTT + mô phỏng nhả hàng)")
    p.add_argument("--machine", default=defaults.machine_code, help="Mã máy, ví dụ VM001")
    p.add_argument("--broker-host", default=defaults.broker_host)
    p.add_argument("--broker-port", type=int, default=defaults.broker_port)
    p.add_argument("--tls", action="store_true", default=defaults.use_tls, help="Bật TLS khi nối broker")
    p.add_argument("--topic-prefix", default=defaults.topic_prefix)
    p.add_argument("--telemetry-transport", choices=["mqtt", "http", "both"], default=defaults.telemetry_transport,
                   help="Kênh gửi telemetry. 'both'/'http' để dùng với Backend chưa có MQTT subscriber.")
    p.add_argument("--telemetry-interval", type=float, default=defaults.telemetry_interval)
    p.add_argument("--backend-url", default=defaults.backend_url, help="Chỉ dùng cho telemetry HTTP")
    p.add_argument("--slots", default=",".join(defaults.slots), help="Danh sách cột, ví dụ A01,A02,A03,A04")
    p.add_argument("--jam-rate", type=float, default=defaults.jam_rate, help="Xác suất kẹt ngẫu nhiên mỗi lần quay (0-1)")
    p.add_argument("--jam-slot", action="append", default=[], metavar="CỘT[:SỐ_LẦN]",
                   help="Ép kẹt cột ngay từ đầu; có thể lặp lại. A02 = kẹt vĩnh viễn, A02:1 = kẹt 1 lần rồi retry OK")
    p.add_argument("--temp-lock-after", type=float, default=defaults.temp_lock_after,
                   help="Số giây nhiệt độ ngoài ngưỡng liên tục trước khi khóa bán hàng")
    p.add_argument("--time-scale", type=float, default=defaults.time_scale, help="0.1 = chạy nhanh gấp 10 lần")
    p.add_argument("--seed", type=int, default=defaults.seed, help="Seed ngẫu nhiên để demo lặp lại được")
    p.add_argument("--no-persist", action="store_true", help="Không lưu state ra đĩa")
    p.add_argument("--state-dir", default=defaults.state_dir)
    p.add_argument("--console", action="store_true", help="Bật console tiêm lỗi (đọc từ stdin)")
    p.add_argument("--log-level", default="INFO")
    return p


def main() -> int:
    load_env_file(Path(__file__).with_name(".env"))
    defaults = SimConfig.from_env()
    args = build_parser(defaults).parse_args()
    logging.basicConfig(level=args.log_level.upper(), format="%(asctime)s %(levelname)-7s %(name)s: %(message)s")

    defaults.machine_code = args.machine
    defaults.broker_host, defaults.broker_port, defaults.use_tls = args.broker_host, args.broker_port, args.tls
    defaults.topic_prefix = args.topic_prefix
    defaults.telemetry_transport, defaults.telemetry_interval = args.telemetry_transport, args.telemetry_interval
    defaults.backend_url = args.backend_url
    defaults.slots = [s for s in args.slots.split(",") if s.strip()]
    defaults.jam_rate, defaults.temp_lock_after = args.jam_rate, args.temp_lock_after
    defaults.time_scale, defaults.seed = args.time_scale, args.seed
    defaults.persist, defaults.state_dir = not args.no_persist, args.state_dir
    try:
        cfg = defaults.validate()
    except ValueError as exc:
        print(f"Cấu hình không hợp lệ: {exc}", file=sys.stderr)
        return 2

    faults = FaultInjector()
    try:
        for spec in args.jam_slot:
            column, _, count = spec.partition(":")
            faults.set_jam(column, int(count) if count else -1)
    except ValueError as exc:
        print(f"--jam-slot không hợp lệ: {exc}", file=sys.stderr)
        return 2

    topics = Topics.for_machine(cfg.machine_code, cfg.topic_prefix)
    will = make_will(topics, cfg.machine_code)
    will = (will[0], sign_payload(will[1], cfg.iot_secret), will[2], will[3])
    try:
        transport = PahoTransport(cfg.broker_host, cfg.broker_port, f"freshvend-sim-{cfg.machine_code}",
                                  cfg.username, cfg.password, cfg.use_tls, will)
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 2

    http_sender = HttpTelemetrySender(
        cfg.backend_url, cfg.iot_secret, state_dir=cfg.state_dir, machine_code=cfg.machine_code,
    ) \
        if cfg.telemetry_transport in {"http", "both"} else None
    machine = VirtualMachine(cfg, transport, faults, StateStore(cfg.state_dir, cfg.machine_code, cfg.persist),
                             http_sender=http_sender)

    done = threading.Event()
    signal.signal(signal.SIGINT, lambda *_: done.set())
    signal.signal(signal.SIGTERM, lambda *_: done.set())
    machine.start()
    if args.console:
        run_console(machine, done.set)
    print(f"Simulator {cfg.machine_code} đang chạy. Broker {cfg.broker_host}:{cfg.broker_port} | "
          f"lệnh: {topics.dispense_command} | Ctrl+C để dừng.")
    done.wait()
    machine.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
