# Order API — Sprint 2

- `POST /api/orders`: nhận `machineId` và danh sách
  `items[{productId, slotId, quantity}]`. Máy phải ACTIVE; sản phẩm và khe phải
  ACTIVE, khe phải thuộc máy và đủ tồn khả dụng. Giá/tổng tiền lấy từ database.
- Đơn mới ở trạng thái PENDING; Order Items lưu slot, giá tại thời điểm đặt,
  và số lượng được giữ nguyên tử cùng transaction.
- `GET /api/orders/:orderId`: trả đơn, Order Items và lịch sử payment.
- `POST /api/orders/:orderId/payments`: tạo lần thanh toán PENDING.
- `POST /api/orders/payments/:paymentId/callback`: nhận callback có shared key;
  kết quả SUCCESS/FAILED được xử lý idempotent.
- Payment SUCCESS chuyển đơn sang PAID, tiêu thụ hàng giữ và đưa lệnh xuất
  hàng vào outbox trong cùng transaction. FAILED giải phóng reservation;
  khách Guest có thể tạo lần thanh toán mới khi đơn còn PENDING.
- `POST /api/orders/:orderId/cancel` và `/api/orders/expire`: hủy đơn, giải
  phóng hàng đã giữ.
- `POST /api/orders/:orderId/dispense-result`: ghi nhận kết quả nhả hàng; nếu
  thất bại, tồn kho đã trừ được hoàn lại.

Guest Checkout nhận `guestAccessToken` khi tạo đơn và phải gửi token đó trong
header `x-guest-order-token` khi đọc đơn hoặc tạo payment. Database chỉ lưu hash
token.
