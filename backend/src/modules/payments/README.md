# Payment API — Sprint 2 (Nghĩa)

- `POST /api/payments`: tạo payment PENDING từ order PENDING; amount được lấy từ total_amount của order.
- `GET /api/payments/:paymentId`: tra cứu thanh toán.
- `POST /api/payments/:paymentId/result`: callback mô phỏng; nhận paymentStatus SUCCESS/FAILED và transactionReference tùy chọn. Cập nhật payment và trạng thái order trong cùng transaction; lặp lại cùng kết quả không cập nhật lần hai.

Callback này dùng cho demo tích hợp, chưa thay cổng thanh toán thật. Phần giữ/trừ/giải phóng tồn kho cần được nối với module Inventory; middleware đăng nhập/phân quyền cần được gắn khi tích hợp auth của nhóm.
