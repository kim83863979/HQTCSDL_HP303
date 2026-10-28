# Database

PostgreSQL là cơ sở dữ liệu dự kiến theo tài liệu dự án. ERD đã chốt là nguồn
chuẩn để tạo schema; migration phải có thể chạy lại theo thứ tự và được quản lý
bằng Git.

- `migrations/`: các thay đổi schema có thứ tự/phiên bản.
- `seeds/`: dữ liệu mẫu phục vụ phát triển và kiểm thử.
- `diagrams/`: ERD và sơ đồ liên quan ở định dạng nhóm thống nhất.

Chưa tạo SQL schema tại đây vì cần chuyển chính xác ERD đã duyệt thành migration,
không tự suy đoán bảng hoặc quan hệ.
