"""Console tương tác để tiêm lỗi khi demo (Fault Injection Panel)."""
from __future__ import annotations

import json
import logging
import sys
import threading
from typing import Callable

from .machine import VirtualMachine

log = logging.getLogger("freshvend.console")

HELP = """Lệnh:
  jam <cột> [số_lần]   ép kẹt hàng (bỏ trống số_lần = kẹt tới khi clear; 1 = kẹt 1 lần rồi retry thành công)
  empty <cột>          cảm biến báo cột trống (OUT_OF_STOCK)
  temp <độ C>|auto     ép nhiệt độ (ví dụ 9.5) hoặc trả về dao động tự nhiên
  sensor-fault on|off  hỏng / sửa cảm biến DHT22
  door open|close      mở / đóng cửa máy
  clear [cột]          CLEAR_FAULT: mở khóa cột (hoặc toàn máy)
  status               in trạng thái hiện tại
  help | quit"""


def _handle(machine: VirtualMachine, line: str) -> bool:
    parts = line.split()
    if not parts:
        return True
    cmd, args = parts[0].lower(), parts[1:]
    faults = machine.faults
    try:
        if cmd == "jam" and args:
            faults.set_jam(args[0], int(args[1]) if len(args) > 1 else -1)
        elif cmd == "empty" and args:
            faults.set_empty(args[0])
        elif cmd == "temp" and args:
            faults.force_temp = None if args[0].lower() == "auto" else float(args[0])
        elif cmd == "sensor-fault" and args:
            faults.sensor_fault = args[0].lower() == "on"
        elif cmd == "door" and args:
            faults.door_open = args[0].lower() == "open"
        elif cmd == "clear":
            from .protocol import normalize_column
            machine.clear_faults(normalize_column(args[0]) if args else None)
        elif cmd == "status":
            print(json.dumps(machine.snapshot(), indent=2, ensure_ascii=False))
        elif cmd in {"quit", "exit"}:
            return False
        else:
            print(HELP)
            return True
        print("OK")
    except ValueError as exc:
        print(f"Lỗi: {exc}")
    return True


def run_console(machine: VirtualMachine, on_quit: Callable[[], None]) -> threading.Thread:
    def loop() -> None:
        print(HELP)
        for line in sys.stdin:
            if not _handle(machine, line.strip()):
                break
        on_quit()

    thread = threading.Thread(target=loop, name="console", daemon=True)
    thread.start()
    return thread
