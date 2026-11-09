# Module Machines & Slots (Sprint 1 — Phụ trách: HẢI)

## 1. Ranh giới dữ liệu đã thống nhất với NGUYÊN (Inventory) và KIM (Database)
- **Phần của HẢI (`machines`, `machine_slots`, `machine_statuses`, `temperature_logs`, `machine_events`):**
  - Quản lý định danh máy (`id`, `machine_code`, `name`, `location`, `status`).
  - Quản lý danh sách khe/khay vật lý trong từng máy (`machine_slots`: `id`, `machine_id`, `slot_code`, `capacity`, `slot_status`).
  - Quản lý trạng thái sức khỏe thiết bị và chuỗi lạnh (`machine_statuses`, `temperature_logs`, `machine_events`).
- **Phần của NGUYÊN (`inventories`):**
  - Hải không tạo bảng tồn kho. Module `inventories` của Nguyên sẽ liên kết khóa ngoại với `machine_slots(id)` và `products(id)`.

## 2. API máy và khe

| Method | Endpoint | Bảo mật | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/machines` | JWT + `VIEW_MACHINE` | Lấy danh sách máy và trạng thái mới nhất. |
| `GET` | `/api/machines/:id` | JWT + `VIEW_MACHINE` | Lấy chi tiết máy và danh sách khe. |
| `GET` | `/api/machines/:id/slots` | JWT + `VIEW_MACHINE` | Lấy danh sách khe; `includeInventory=true` thêm tồn kho. |
| `POST` | `/api/machines/simulator/status` | `x-iot-key` | Nhận telemetry từ IoT Simulator. |
| `GET` | `/api/machines/:id/consistency-check` | JWT + `VIEW_MACHINE` | Kiểm tra nhất quán máy, khe và tồn kho. |
| `GET` | `/api/machines/orders/:orderId/dispense-plan` | JWT + `VIEW_MACHINE` | Tạo kế hoạch nhả hàng từ đơn. |
| `POST` | `/api/machines/:id/slots` | JWT + role `ADMIN` hoặc `OPERATOR` | Tạo khe máy. |
| `PATCH` | `/api/machines/:id/slots/:slotId/status` | JWT + role `ADMIN` hoặc `OPERATOR` | Cập nhật trạng thái/sức chứa khe. |

`resolve-order-slots` là endpoint nội bộ phục vụ tích hợp máy và đơn hàng; chỉ
cho phép người dùng có permission `VIEW_MACHINE`.

Telemetry simulator yêu cầu header `x-iot-key` khớp với `IOT_DEVICE_SECRET`.
Nếu secret không được cấu hình, middleware sẽ áp dụng chính sách cấu hình hiện
có của môi trường.

## 3. Ranh giới API nền tảng ban đầu
| Method | Endpoint | Bảo mật | Mô tả |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/machines` | JWT + `VIEW_MACHINE` | Lấy máy kèm trạng thái và nhiệt độ hiện tại (quá 60 giây không heartbeat sẽ thành OFFLINE). |
| `GET` | `/api/machines/:id` | JWT + `VIEW_MACHINE` | Lấy chi tiết máy và danh sách khe. |
| `GET` | `/api/machines/:id/slots` | JWT + `VIEW_MACHINE` | Lấy danh sách khe vật lý của máy. |
| `POST` | `/api/machines/simulator/status` | `x-iot-key` | Nhận telemetry từ IoT Simulator. |