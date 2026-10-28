# FreshVend

FreshVend là dự án máy bán trái cây tự động, hướng đến quản lý sản phẩm, tồn kho,
tài khoản và trạng thái máy. Phạm vi Sprint 1 là dựng nền tảng backend và database,
đăng nhập cơ bản, các API nền tảng và khung IoT Simulator.

## Cấu trúc dự án

- `backend/`: backend API và các module của Sprint 1.
- `database/`: migration và dữ liệu mẫu theo ERD đã được nhóm chốt.
- `iot-simulator/`: khung mô phỏng trạng thái máy cho các bước tích hợp tiếp theo.
- `vending-client/`: giao diện khách hàng, triển khai ở sprint sau.
- `admin-dashboard/`: giao diện Admin/Operator, triển khai ở sprint sau.
- `mô tả dự án/`: tài liệu mô tả và phân công dự án hiện có.

## Bắt đầu

Framework, lệnh cài đặt và lệnh chạy backend sẽ được bổ sung sau khi nhóm thống
nhất công nghệ. Xem `backend/README.md` và `database/README.md` để biết quy ước
phát triển Sprint 1.

Không commit file `.env` hoặc thông tin xác thực thật. Tạo cấu hình cục bộ từ
`.env.example` và điền giá trị phù hợp với môi trường của bạn.

## Phạm vi Sprint 1

- Backend khởi động và kết nối PostgreSQL.
- Migration database dựa trên ERD đã chốt.
- API đọc sản phẩm và tồn kho.
- Đăng nhập và kiểm tra quyền cơ bản.
- Khung IoT Simulator có thể cung cấp dữ liệu trạng thái mẫu.

Đặt hàng, thanh toán, trừ tồn khi mua, điều khiển thiết bị thật và giao diện người
dùng nằm ngoài phạm vi Sprint 1.
