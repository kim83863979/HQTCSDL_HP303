# Backend

Thư mục này chứa backend API dùng chung. Nhóm cần thống nhất framework và ngôn
ngữ trước khi thêm mã nguồn phụ thuộc công nghệ.

## Phạm vi Sprint 1

- `src/config/`: cấu hình ứng dụng và kết nối PostgreSQL.
- `src/middleware/`: xác thực request và xử lý lỗi dùng chung.
- `src/modules/auth/`: User, Role, đăng nhập và kiểm tra quyền cơ bản.
- `src/modules/products/`: API đọc sản phẩm và danh mục.
- `src/modules/inventory/`: API đọc tồn kho theo máy/khe.
- `src/modules/machines/`: thông tin máy và trạng thái cơ bản.
- `tests/`: kiểm thử module và API nền tảng.

Mọi module phải dùng schema/migration tại `database/`, theo ERD đã chốt. Không
tạo schema riêng hoặc sửa quan hệ mà chưa thống nhất với cả nhóm.

## Cấu hình

Sao chép `.env.example` ở thư mục gốc thành `.env` và điền cấu hình PostgreSQL
cục bộ. Không đưa `.env` lên Git.

Lệnh cài đặt, khởi chạy và kiểm thử sẽ được cập nhật khi nhóm chốt framework.
