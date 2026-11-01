# Module Machines & Slots (Sprint 1 — Phụ trách: HẢI)

## 1. Ranh giới dữ liệu đã thống nhất với NGUYÊN (Inventory) và KIM (Database)
- **Phần của HẢI (`machines`, `machine_slots`, `machine_statuses`, `temperature_logs`, `machine_events`):**
  - Quản lý định danh máy (`id`, `machine_code`, `name`, `location`, `status`).
  - Quản lý danh sách khe/khay vật lý trong từng máy (`machine_slots`: `id`, `machine_id`, `slot_code`, `capacity`, `slot_status`).
  - Quản lý trạng thái sức khỏe thiết bị và chuỗi lạnh (`machine_statuses`, `temperature_logs`, `machine_events`).
- **Phần của NGUYÊN (`inventories`):**
  - Hải không tạo bảng tồn kho. Module `inventories` của Nguyên sẽ liên kết khóa ngoại với `machine_slots(id)` và `products(id)`.

## 2. Danh sách API nền tảng trong Sprint 1
| Method | Endpoint | Bảo mật | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/machines` | Public | Lấy danh sách tất cả máy kèm trạng thái và nhiệt độ hiện tại (tự động check timeout 60s thành OFFLINE). |
| `GET` | `/api/machines/:id` | Public | Lấy chi tiết 1 máy kèm danh sách các khe (`slots`) của máy đó. |
| `GET` | `/api/machines/:id/slots` | Public | Lấy danh sách các khe vật lý của máy `:id`. |
| `POST` | `/api/machines/simulator/status` | Protected (`x-iot-key`) | Nhận bản ghi trạng thái giả lập từ IoT Simulator (Yêu cầu Header `x-iot-key` khớp với `IOT_DEVICE_SECRET` nếu Backend bật bảo mật). |