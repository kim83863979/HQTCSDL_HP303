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
- `POST /api/orders/:orderId/cancel` và `/api/orders/expire`: hủy đơn, giải
  phóng hàng đã giữ.
- `POST /api/orders/:orderId/dispense-result`: ghi nhận kết quả nhả hàng; nếu
  thất bại, tồn kho đã trừ được hoàn lại.

`GET /api/orders/:orderId` hiện chưa giới hạn theo khách hàng do schema chưa lưu
`user_id` trên orders.
