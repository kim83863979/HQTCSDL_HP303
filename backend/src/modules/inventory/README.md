# Module tồn kho

## Sprint 1

- Truy vấn tồn kho theo máy/khe theo quan hệ trong ERD.
- Xử lý rõ trường hợp máy hoặc khe không tồn tại và trường hợp chưa có dữ liệu.
- Phối hợp với module máy để thống nhất định danh máy/khe.

Các API tồn kho yêu cầu đăng nhập và permission `MANAGE_INVENTORY`.

## Sprint 2

- `GET /api/inventory/availability` kiểm tra số lượng khả dụng (quantity trừ
  số lượng đang giữ).
- `POST /api/inventory/reservations` giữ hàng với khóa dòng tồn kho.
- Endpoint `consume` xác nhận trừ hàng; `release` giải phóng hàng đã giữ.
- Luồng Order/Payment tích hợp các thao tác này cùng transaction để không bán
  vượt tồn kho, không trừ lặp và phục hồi tồn khi thanh toán thất bại/hủy đơn.
