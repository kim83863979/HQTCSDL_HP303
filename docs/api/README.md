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

Khách có thể đặt hàng Guest, không cần JWT. Tạo đơn bằng `POST /api/orders`
với `machineId` và `items`, mỗi item gồm
`productId`, `slotId`, `quantity`. Backend khóa và kiểm tra tồn kho, sản phẩm,
khe và máy trước khi tạo đơn PENDING; giá được lấy từ database và hàng được
giữ trong cùng transaction. Response tạo đơn trả `guestAccessToken` ngẫu nhiên;
Client phải giữ bí mật và gửi trong header `x-guest-order-token` khi đọc đơn,
tạo payment attempt hoặc đọc payment. Database chỉ lưu hash token. Thiếu/sai
token không cho phép truy cập đơn hoặc thanh toán.

Giao dịch tạo/thanh toán/giữ hàng được tích hợp trong
`orders/order.router.js`. Các route Admin, máy, thiết bị IoT và tác vụ bảo trì
vẫn giữ JWT/permission hoặc shared secret tương ứng.

Thanh toán có thể bắt đầu qua `POST /api/orders/:orderId/payments` hoặc alias
`POST /api/payments`; cả hai route Guest đều yêu cầu `x-guest-order-token`.
Payment webhook thật dùng `POST /api/orders/payments/:paymentId/callback` với
body `{ "status": "SUCCESS" }`; alias `POST /api/payments/:paymentId/result`
nhận `{ "paymentStatus": "SUCCESS" }`. Cả hai callback chỉ xác thực bằng
`x-payment-key` khớp `PAYMENT_WEBHOOK_SECRET`, không dùng JWT Guest.

Payment mock của Vending Client dùng
`POST /api/payments/:paymentId/demo-result` với
`{ "paymentStatus": "SUCCESS", "transactionReference": "DEMO-001" }` và
`x-guest-order-token`. Đổi `paymentStatus` thành `FAILED` để mô phỏng thất bại;
reference có thể bỏ qua, backend sẽ tạo reference Demo. PaymentId phải thuộc
đơn gắn với Guest token. Route này chỉ bật ngoài production; production luôn
trả 404. Không đặt webhook secret vào Client.

Postman: tạo đơn `POST /api/orders` với machineId và items; lưu
`data.id` thành `orderId`, `data.guestAccessToken` thành `guestToken`. Tạo
payment `POST /api/orders/{{orderId}}/payments` với header
`x-guest-order-token: {{guestToken}}` và body `{ "paymentMethod": "QR" }`;
lưu `data.id` thành `paymentId`. Gọi một trong các request sau với header
`x-guest-order-token: {{guestToken}}`:

- SUCCESS: `POST /api/payments/{{paymentId}}/demo-result`, body
  `{ "paymentStatus": "SUCCESS", "transactionReference": "DEMO-POSTMAN-001" }`.
  Kỳ vọng 200, payment SUCCESS, `paidAt` có giá trị, order PAID và có dispense
  command.
- FAILED: với một payment mới, dùng cùng URL và body
  `{ "paymentStatus": "FAILED", "transactionReference": "DEMO-POSTMAN-002" }`.
  Kỳ vọng 200, payment FAILED, order PENDING, reservation được giải phóng và
  có thể tạo payment attempt mới.

Sau đó GET `/api/admin/payments?status=SUCCESS` hoặc `?status=FAILED` bằng
JWT Admin có `VIEW_REPORT` để xác nhận trạng thái trong Admin. GET
`/api/payments/{{paymentId}}` với guest token cũng trả trạng thái mới nhất.
Gọi lại cùng kết quả và reference trả `changed: false`; thử đổi kết quả đã kết
thúc trả 409; thiếu/sai Guest token không thể cập nhật payment. Webhook thực tế
tiếp tục dùng `POST /api/orders/payments/{{paymentId}}/callback`, body
`{ "status": "SUCCESS", "transactionReference": "PROVIDER-001" }` và
header `x-payment-key`; alias `/api/payments/{{paymentId}}/result` vẫn được bảo
vệ bằng cùng shared secret.

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
