# Payment API — Sprint 2 (Nghĩa)

- `POST /api/payments`: alias tạo payment cho đơn PENDING; gọi cùng service
  transaction với `POST /api/orders/:orderId/payments`.
- `GET /api/payments/:paymentId`: tra cứu thanh toán.
- `POST /api/payments/:paymentId/result`: alias callback mô phỏng; nhận
  `paymentStatus` và `transactionReference` tùy chọn. Yêu cầu
  `x-payment-key` khớp `PAYMENT_WEBHOOK_SECRET`.

Callback này dùng cho demo tích hợp, chưa thay cổng thanh toán thật. Callback
được xử lý qua cùng service của Order API; thành công tiêu thụ reservation,
thất bại giải phóng reservation và callback lặp không cập nhật tồn kho lần hai.
