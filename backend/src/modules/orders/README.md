# Order API — Sprint 2 (Nghĩa)

- `POST /api/orders`: nhận `machineId` và danh sách `items[{productId, quantity}]`; giá và tổng tiền lấy/tính từ database; đơn mới ở trạng thái PENDING.
- `GET /api/orders/:orderId`: trả đơn, Order Items và payment nếu đã tạo.

Tạo đơn kiểm tra máy ACTIVE, sản phẩm ACTIVE và số lượng đang có ở các khe ACTIVE của máy. Module này chưa giữ/trừ tồn; thao tác đó thuộc Inventory. Khi tích hợp, cần phối hợp để giữ/trừ tồn nguyên tử với việc tạo đơn, tránh bán vượt tồn kho và giải phóng hàng khi đơn thất bại/hủy.

Schema hiện chưa có customer_id/user_id trên orders, vì vậy endpoint tra cứu chưa thể giới hạn đơn theo khách hàng. Cần thống nhất với nhóm khi cập nhật schema và auth.
