# FreshVend — API Sprint 2 (Nghĩa)

Base URL local: `http://localhost:3000`

## Sản phẩm

### `GET /api/products`

Lấy sản phẩm đang bán, có phân trang:
- Query tùy chọn: `page` (mặc định 1), `limit` (mặc định 20, tối đa 100), `categoryId` (UUID).
- Ví dụ: `GET /api/products?page=1&limit=20`

### `GET /api/products/:productId`

Lấy chi tiết một sản phẩm đang bán. ID sai định dạng trả 400; không tồn tại/không bán trả 404.

## Đơn hàng

### `POST /api/orders`

Body:
```json
{
  "machineId": "<UUID máy ACTIVE>",
  "items": [
    { "productId": "<UUID sản phẩm ACTIVE>", "quantity": 2 }
  ]
}
```

Server tự đọc giá từ database, tính subtotal/tổng tiền và tạo order cùng order_items trong một transaction. Đơn mới có trạng thái `PENDING`. Máy, sản phẩm và tồn ở khe ACTIVE của máy được kiểm tra trước khi tạo.

### `GET /api/orders/:orderId`

Trả đơn, các Order Item và payment (nếu có).

## Thanh toán

### `POST /api/payments`

Body:
```json
{
  "orderId": "<UUID đơn PENDING>",
  "paymentMethod": "QR"
}
```

Số tiền lấy từ `orders.total_amount`, client không tự gửi amount.

### `GET /api/payments/:paymentId`

Tra cứu thanh toán.

### `POST /api/payments/:paymentId/result`

Endpoint callback mô phỏng cho bài tập; body ví dụ:
```json
{
  "paymentStatus": "SUCCESS",
  "transactionReference": "DEMO-TRANSACTION-001"
}
```

`paymentStatus` nhận `SUCCESS` hoặc `FAILED`. Cập nhật payment và order trong cùng transaction; gửi lại cùng kết quả không cập nhật lần hai. Endpoint này mô phỏng callback, chưa phải cổng thanh toán thật.

## Ranh giới cần tích hợp

- API tạo đơn kiểm tra tồn nhưng chưa giữ/trừ hàng; cần nối với Inventory để tránh bán vượt số lượng và xử lý hàng đã giữ khi payment thất bại/hủy.
- Schema hiện chưa lưu `user_id` trên `orders`; chưa thể giới hạn GET order theo khách hàng.
- Middleware đăng nhập/phân quyền cần được gắn khi tích hợp auth của nhóm.
