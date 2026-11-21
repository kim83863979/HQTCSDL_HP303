# Payment API — Sprint 2 (Nghĩa)

- `POST /api/payments`: alias tạo payment cho đơn PENDING; gọi cùng service
  transaction với `POST /api/orders/:orderId/payments`.
- `GET /api/payments/:paymentId`: tra cứu thanh toán.
- `POST /api/payments/:paymentId/result`: alias webhook/provider callback; nhận
  `paymentStatus` và `transactionReference` tùy chọn. Yêu cầu
  `x-payment-key` khớp `PAYMENT_WEBHOOK_SECRET`.
- `POST /api/payments/:paymentId/demo-result`: mô phỏng dành riêng cho Guest
  Checkout ngoài production. Yêu cầu `x-guest-order-token` thuộc đúng payment,
  nhận `paymentStatus` SUCCESS/FAILED và reference tùy chọn. Không dùng JWT
  khách hàng hoặc webhook secret ở Frontend.

Callback này dùng cho demo tích hợp, chưa thay cổng thanh toán thật. Callback
được xử lý qua cùng service transaction của Order API; thành công tiêu thụ
reservation và phát lệnh xuất hàng, thất bại giải phóng reservation. Callback
lặp cùng trạng thái không thay đổi kết quả; chuyển trạng thái hoặc đổi
reference của giao dịch đã hoàn tất bị từ chối.
