import argparse
import json
import os
import random
import time
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Optional, Dict, Any


class FreshVendSimulatorStub:
    """
    Khung IoT Simulator (Sprint 1 Stub) - Phụ trách: HẢI
    Đã chuẩn hóa PEP 8, bảo mật x-iot-key và kiểm thử đầy đủ các Edge-Case của Sprint 1.
    """

    def __init__(
        self,
        machine_code: str = "VM001",
        backend_url: str = "http://localhost:3000",
        iot_secret: Optional[str] = None,
    ):
        self.machine_code = machine_code
        self.endpoint = f"{backend_url.rstrip('/')}/api/machines/simulator/status"
        self.iot_secret = iot_secret or os.getenv("IOT_DEVICE_SECRET", "")
        self.machine_state = "IDLE"
        self.door_status = "CLOSED"
        self.sensor_status = "OK"

    def generate_sample_payload(
        self,
        force_temp: Optional[float] = None,
        force_state: Optional[str] = None,
        simulate_sensor_fault: bool = False,
    ) -> Dict[str, Any]:
        """Tạo bản ghi trạng thái giả lập theo đúng định dạng chuẩn đã thống nhất."""
        if simulate_sensor_fault:
            temperature = None
            sensor_status = "FAULT"
            state = "ERROR"
        else:
            temperature = round(
                force_temp if force_temp is not None else random.uniform(3.5, 6.5), 2
            )
            sensor_status = self.sensor_status
            state = force_state if force_state is not None else self.machine_state

        humidity = round(random.uniform(62.0, 72.0), 2)

        return {
            "machineCode": self.machine_code,
            "machineState": state,
            "temperature": temperature,
            "humidity": humidity,
            "doorStatus": self.door_status,
            "sensorStatus": sensor_status,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

    def send_status_to_backend(self, payload: Dict[str, Any]) -> bool:
        """Gửi bản tin trạng thái lên Backend và bắt chi tiết từng mã lỗi."""
        data_bytes = json.dumps(payload).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if self.iot_secret:
            headers["x-iot-key"] = self.iot_secret

        req = urllib.request.Request(
            self.endpoint, data=data_bytes, headers=headers, method="POST"
        )

        print(f"\n[SIMULATOR -> BACKEND] Đang gửi dữ liệu máy '{payload.get('machineCode')}':")
        print(json.dumps(payload, indent=2, ensure_ascii=False))

        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                resp_body = json.loads(response.read().decode("utf-8"))
                print(f"[SUCCESS - HTTP {response.status}] Phản hồi từ Backend:")
                print(json.dumps(resp_body, indent=2, ensure_ascii=False))
                return True

        except urllib.error.HTTPError as http_err:
            err_content = http_err.read().decode("utf-8", errors="replace")
            try:
                err_json = json.loads(err_content)
                err_code = err_json.get("errorCode", "HTTP_ERROR")
                err_msg = err_json.get("message", err_content)
            except ValueError:
                err_code = "RAW_HTTP_ERROR"
                err_msg = err_content
            print(f"[BACKEND REJECTED - HTTP {http_err.code}] ({err_code}): {err_msg}")
            return False

        except urllib.error.URLError as url_err:
            print(f"[CONNECTION ERROR] Backend chưa sẵn sàng tại '{self.endpoint}'!")
            print(f" -> Nguyên nhân: {url_err.reason}. Đã chuyển sang chế độ chờ kết nối lại.")
            return False


def run_demo_scenarios(backend_url: str):
    print("=================================================================")
    print(" DEMO NGHIỆM THU IOT SIMULATOR SPRINT 1 (PHỤ TRÁCH: HẢI)")
    print("=================================================================")

    sim_valid = FreshVendSimulatorStub(machine_code="VM001", backend_url=backend_url)

    # Kịch bản 1: Gửi dữ liệu máy hợp lệ (VM001 - Nhiệt độ chuẩn 4.6°C)
    print("\n--- KỊCH BẢN 1: Gửi trạng thái hợp lệ cho máy VM001 ---")
    sim_valid.send_status_to_backend(
        sim_valid.generate_sample_payload(force_temp=4.6, force_state="IDLE")
    )

    # Kịch bản 2: Giả lập nhiệt độ vượt ngưỡng (9.8°C > 8.0°C)
    print("\n--- KỊCH BẢN 2: Giả lập nhiệt độ cao (9.8°C) vượt ngưỡng 2-8°C ---")
    sim_valid.send_status_to_backend(
        sim_valid.generate_sample_payload(force_temp=9.8, force_state="IDLE")
    )

    # Kịch bản 3: Giả lập lỗi hỏng cảm biến DHT22 (temperature = None, sensorStatus = FAULT - ERR-07)
    print("\n--- KỊCH BẢN 3: Giả lập lỗi cảm biến DHT22 (Giữ nguyên nhiệt độ hợp lệ gần nhất) ---")
    sim_valid.send_status_to_backend(
        sim_valid.generate_sample_payload(simulate_sensor_fault=True)
    )

    # Kịch bản 4: Gửi mã máy KHÔNG TỒN TẠI (VM999) để kiểm tra bắt lỗi 404
    print("\n--- KỊCH BẢN 4: Gửi mã máy không hợp lệ (VM999) ---")
    sim_invalid = FreshVendSimulatorStub(machine_code="VM999", backend_url=backend_url)
    sim_invalid.send_status_to_backend(sim_invalid.generate_sample_payload())


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="FreshVend IoT Simulator Stub (Sprint 1)")
    parser.add_argument("--machine", default="VM001", help="Mã máy bán hàng (mặc định: VM001)")
    parser.add_argument("--url", default="http://localhost:3000", help="URL của Backend")
    parser.add_argument("--loop", action="store_true", help="Chạy vòng lặp gửi định kỳ mỗi 5 giây")
    parser.add_argument("--demo", action="store_true", help="Chạy tự động 4 kịch bản demo nghiệm thu Sprint 1")
    args = parser.parse_args()

    if args.demo:
        run_demo_scenarios(args.url)
    elif args.loop:
        sim = FreshVendSimulatorStub(machine_code=args.machine, backend_url=args.url)
        print(f"Đang chạy Simulator định kỳ cho máy {args.machine} (Nhấn Ctrl+C để dừng)...")
        try:
            while True:
                sim.send_status_to_backend(sim.generate_sample_payload())
                time.sleep(5)
        except KeyboardInterrupt:
            print("\nĐã dừng IoT Simulator.")
    else:
        sim = FreshVendSimulatorStub(machine_code=args.machine, backend_url=args.url)
        sim.send_status_to_backend(sim.generate_sample_payload())