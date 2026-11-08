# FreshVend — API Sprint 2

Base URL local: `http://localhost:3000`

## Sản phẩm

### `GET /api/products`

Lấy các sản phẩm đang bán. Query tùy chọn:

- `page` (mặc định 1), `limit` (mặc định 20, tối đa 100)
- `categoryId` (UUID)

Response gồm `success`, `data` và thông tin `pagination`.

### `GET /api/products/:productId`

Lấy chi tiết sản phẩm đang bán. ID sai định dạng trả 400; sản phẩm không tồn
tại hoặc không còn bán trả 404.

## Đơn hàng

### `POST /api/orders`

Body:

```json
{
  "machineId": "<UUID máy ACTIVE>",
  "items": [
    { "productId": "<UUID sản phẩm ACTIVE>", "slotId": "<UUID khe ACTIVE>", "quantity": 2 }
  ]
}
```

Máy phải ACTIVE; khe phải thuộc máy, đang ACTIVE và có đủ tồn khả dụng cho sản
phẩm. Mỗi sản phẩm/khe chỉ xuất hiện một lần trong danh sách. Server đọc giá từ
database, lưu giá tại thời điểm đặt hàng và tạo order, order_items cùng
reservation trong một transaction. Đơn mới có trạng thái `PENDING`.

### `GET /api/orders/:orderId`

Trả đơn, Order Items, slot và lịch sử payment. Schema chưa lưu `user_id` trên
orders nên API hiện chưa thể giới hạn đơn theo khách hàng.

### Các thao tác đơn hàng

- `POST /api/orders/:orderId/cancel`: hủy đơn PENDING và giải phóng reservation.
- `POST /api/orders/expire`: tác vụ bảo trì có
  `x-order-maintenance-key`, hủy các đơn hết hạn và giải phóng hàng.
- `POST /api/orders/:orderId/dispense-result`: nhận `{ "success": true|false }`;
  dispense thất bại sẽ hoàn hàng đã trừ.

## Thanh toán

Tạo payment qua `POST /api/orders/:orderId/payments` hoặc alias
`POST /api/payments`, với body:

```json
{ "paymentMethod": "QR" }
```

Các phương thức hợp lệ: `CASH`, `CARD`, `QR`. Số tiền lấy từ đơn hàng; callback
thành công tiêu thụ hàng đã giữ đúng một lần, thất bại giải phóng hàng để có thể
tạo lần thanh toán mới.

Callback tích hợp:

### `POST /api/orders/payments/:paymentId/callback`

Header `x-payment-key` phải khớp `PAYMENT_WEBHOOK_SECRET`. Body:

```json
{
  "status": "SUCCESS",
  "transactionReference": "DEMO-TRANSACTION-001"
}
```

`status` nhận `SUCCESS`, `FAILED` hoặc `REFUNDED`. Gửi lại cùng kết quả là
idempotent; kết quả mâu thuẫn với trạng thái đã chốt trả 409.

Alias tương thích:

- `GET /api/payments/:paymentId`
- `POST /api/payments/:paymentId/result` nhận `paymentStatus` thay cho `status`
  và cũng yêu cầu `x-payment-key`.

Đây là callback mô phỏng, chưa phải cổng thanh toán thật.

## Tồn kho và máy/khe

Order API giữ tồn trong cùng transaction với việc tạo đơn để tránh bán vượt
hàng. Payment FAILED, hủy/hết hạn đơn hoặc dispense thất bại sẽ giải phóng/hoàn
tồn đúng theo trạng thái reservation. API inventory yêu cầu quyền
`MANAGE_INVENTORY`; API đọc máy yêu cầu `VIEW_MACHINE`.

Machine/slot API cung cấp kiểm tra tính nhất quán và kế hoạch nhả hàng phục vụ
Sprint 3. Sprint này chưa hoàn thiện IoT Simulator hay mô phỏng motor.

Các bước chạy migration và seed được ghi trong
[`database/migrations/README.md`](../../database/migrations/README.md).
