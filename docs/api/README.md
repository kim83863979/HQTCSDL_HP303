# Tài liệu API

Backend chạy mặc định tại `http://localhost:3000`.

| Nhóm | Endpoint chính |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Admin / RBAC | `GET /api/admin/users`, `PATCH /api/admin/users/:userId/role` |
| Products | `GET /api/products`, `GET /api/products/:productId` |
| Categories | `GET /api/categories`, `GET /api/categories/:categoryId` |
| Machines | `GET /api/machines`, `GET /api/machines/:id`, `GET /api/machines/:id/slots`, `POST /api/machines/simulator/status` |
| Inventory | `GET /api/inventory/machines/:machineId`, `GET /api/inventory/slots/:slotId`, `GET /api/inventory/availability`, reservation endpoints |
| Orders & Payments | `POST /api/orders`, `GET /api/orders/:orderId`, `POST /api/orders/:orderId/payments`, `POST /api/orders/:orderId/cancel`, `POST /api/orders/:orderId/dispense-result`, payment callback endpoints |

## Xác thực và phân quyền

Auth register nhận `email`, `fullname`, `password`; tài khoản mới có role
`OPERATOR` và không thể chọn role từ request. Login trả JWT; gửi token trong
header `Authorization: Bearer <token>` cho API cần đăng nhập.

- API đọc máy yêu cầu permission `VIEW_MACHINE`.
- API quản lý khe máy yêu cầu role `ADMIN` hoặc `OPERATOR`.
- API tồn kho yêu cầu permission `MANAGE_INVENTORY`.
- API đọc sản phẩm và danh mục là public.
- Telemetry IoT dùng `x-iot-key`, không dùng JWT người dùng.
- Payment callback dùng `x-payment-key`; tác vụ hết hạn đơn dùng
  `x-order-maintenance-key`.

Permissions được truy vấn từ database ở mỗi request. Tài khoản mẫu chỉ dùng
trong môi trường local/test.

## Sản phẩm và danh mục

`GET /api/products` chỉ trả sản phẩm `ACTIVE`, hỗ trợ `page` (mặc định 1),
`limit` (mặc định 20, tối đa 100) và `categoryId`. Response chứa `success`,
`data` và `pagination`. `GET /api/products/:productId` chỉ trả sản phẩm đang
được bán. ID máy, khe, sản phẩm và danh mục là UUID.

## Đơn hàng và thanh toán

Tạo đơn bằng `POST /api/orders` với `machineId` và `items`, mỗi item gồm
`productId`, `slotId`, `quantity`. Backend khóa và kiểm tra tồn kho, sản phẩm,
khe và máy trước khi tạo đơn PENDING; giá được lấy từ database và hàng được
giữ trong cùng transaction. Giao dịch tạo/thanh toán/giữ hàng được tích hợp
trong `orders/order.router.js`.

Thanh toán có thể bắt đầu qua `POST /api/orders/:orderId/payments` hoặc alias
`POST /api/payments`. Callback tích hợp dùng
`POST /api/orders/payments/:paymentId/callback` với body `{ "status":
"SUCCESS" }`; alias `POST /api/payments/:paymentId/result` nhận
`{ "paymentStatus": "SUCCESS" }`. Cả hai callback đều yêu cầu
`x-payment-key` khớp `PAYMENT_WEBHOOK_SECRET`.

Payment thất bại, đơn bị hủy/hết hạn hoặc dispense thất bại sẽ giải phóng hàng
đã giữ; payment thành công sẽ tiêu thụ số lượng giữ đúng một lần. Tác vụ hết
hạn đơn yêu cầu `ORDER_MAINTENANCE_SECRET`. Endpoint dispense-result nhận
`{ "success": true|false }`.

Apply migration order/payment/inventory một lần sau khi restore database dump,
theo hướng dẫn trong [database/migrations/README.md](../../database/migrations/README.md).

Postman collections:

- [Sprint 1 API](./sprint1-api.postman_collection.json)
- [Products & Categories](./product-api.postman_collection.json)
- [Sprint 2 API (Nghĩa)](./sprint2-nghia.md)

Chạy kiểm thử backend bằng `npm test` trong thư mục `backend` sau khi cấu hình
database, migrations và seed.
