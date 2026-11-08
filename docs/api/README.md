# Tài liệu API

Backend chạy mặc định tại `http://localhost:3000`. Các endpoint hiện được mount:

| Nhóm | Endpoint |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Admin / RBAC | `GET /api/admin/users`, `PATCH /api/admin/users/:userId/role` |
| Products | `GET /api/products`, `GET /api/products/:id` |
| Categories | `GET /api/categories`, `GET /api/categories/:id` |
| Machines | `GET /api/machines`, `GET /api/machines/:id`, `GET /api/machines/:id/slots`, `POST /api/machines/simulator/status` |
| Inventory | `GET /api/inventory/machines/:machineId`, `GET /api/inventory/slots/:slotId` |
| Orders & Payments | `POST /api/orders`, `GET /api/orders/:orderId`, `POST /api/orders/:orderId/payments`, `POST /api/orders/:orderId/cancel`, `POST /api/orders/:orderId/dispense-result`, `POST /api/orders/payments/:paymentId/callback`, `POST /api/orders/expire` |

Auth register nhận `email`, `fullname`, `password`; vai trò mặc định là
`OPERATOR` và không thể chọn role từ request. Login nhận `email`, `password`
và trả JWT. Gửi token ở header `Authorization: Bearer <token>` cho `/api/auth/me`
và API được bảo vệ. `/api/admin/users` và đổi role yêu cầu permission
`MANAGE_USER` trong `role_permissions`; quyền được đọc từ database hiện tại cho
mỗi request. Đổi role chỉ chấp nhận `ADMIN` hoặc `OPERATOR` và không cho tự đổi
role. Dữ liệu seed mẫu dùng `admin@freshvend.com` / `Password@123` và
`operator@freshvend.com` / `Password@123`; chỉ dùng các tài khoản này ở môi
trường local/test. Telemetry IoT nhận
`machineCode`, `machineState`, `temperature`, `humidity`, `doorStatus`,
`sensorStatus`; gửi header `x-iot-key` khi `IOT_DEVICE_SECRET` được cấu hình.
Các API đọc máy yêu cầu permission `VIEW_MACHINE`; API đọc tồn kho yêu cầu
`MANAGE_INVENTORY`. Gửi Bearer JWT cho các endpoint này. Endpoint telemetry
simulator xác thực bằng shared device key, không dùng JWT người dùng. API đọc
sản phẩm/danh mục vẫn công khai. Các ID của máy, khe, sản phẩm và danh mục là
UUID.

Order creation accepts `machineId` and `items`, with each item containing
`productId`, `slotId`, and a positive integer `quantity`. The backend captures
the current product price and reserves stock atomically. Payment attempts accept
`paymentMethod` (`CASH`, `CARD`, or `QR`); failed attempts release stock and may
be retried while the order remains `PENDING` and unexpired. Payment callbacks
accept `status` (`SUCCESS`, `FAILED`, or `REFUNDED`) and optional
`transactionReference`, and require `x-payment-key` matching
`PAYMENT_WEBHOOK_SECRET`. Schedule `POST /api/orders/expire` with
`x-order-maintenance-key` matching `ORDER_MAINTENANCE_SECRET` to cancel expired
pending orders and release any remaining reservations. The dispense-result
endpoint accepts `{ "success": true|false }`; a failure marks the order `FAILED`
and restores its reserved stock, while payment refund processing remains the
payment provider's responsibility.

Apply the order/payment schema migration once, after restoring the base database
dump, as described in `database/migrations/README.md`.

Postman collections:

- [Sprint 1 API](./sprint1-api.postman_collection.json) — Auth, Machines,
  Inventory; bao gồm các kiểm tra thiếu token và quyền OPERATOR.
- [Products & Categories](./product-api.postman_collection.json).

Đặt `baseUrl`, `machineId`, `slotId`, `iotDeviceSecret` trong collection trước
khi chạy. Giá trị ID mặc định lấy từ dữ liệu mẫu trong database dump.
Kiểm thử tự động: chạy `npm test` trong thư mục `backend` sau khi cấu hình DB
và cài dependency.
