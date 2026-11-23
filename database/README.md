# Database

FreshVend dùng PostgreSQL. File `migrations/dump-FreshVend-202611011643.sql`
là **baseline cũ** gồm schema và dữ liệu mẫu, không phải migration và chỉ nên
được import vào database mới/trống. File dump được tạo bởi PostgreSQL 17; dùng
PostgreSQL 17 để tránh lỗi tương thích khi khôi phục.

## Khởi tạo database mới

1. Tạo database `FreshVend`.
2. Từ thư mục gốc repository, khôi phục baseline:

   ```powershell
   psql -v ON_ERROR_STOP=1 -d FreshVend -f database/migrations/dump-FreshVend-202611011643.sql
   ```

3. Cấu hình `DATABASE_URL` trong file `.env` ở thư mục gốc.
4. Chạy migrations từ thư mục gốc repository:

   ```powershell
   npm --prefix backend run db:migrate
   npm --prefix backend run db:migrate:status
   ```

5. Tùy chọn nạp thêm dữ liệu mẫu:

   ```powershell
   psql -v ON_ERROR_STOP=1 -d FreshVend -f database/seeds/seed_data.sql
   psql -v ON_ERROR_STOP=1 -d FreshVend -f database/seeds/sample-products.sql
   ```

`seed_data.sql` và `sample-products.sql` có thể chạy lại an toàn; chúng không
thay thế migrations. Baseline đã có sẵn các tài khoản, máy và sản phẩm mẫu cơ
bản nên không bắt buộc chạy seed để khởi động API.

## Quy tắc thay đổi schema

- Tạo migration mới trong `migrations/` với tên dạng
  `YYYYMMDDHHMMSS_mo_ta.sql`, bọc câu lệnh bằng `BEGIN;`/`COMMIT;`; không sửa
  dump hoặc migration đã áp dụng.
- Chạy migrations bằng `npm run db:migrate`, không chạy từng file thủ công.
  Runner áp dụng theo thứ tự, dùng transaction, advisory lock, checksum và lưu
  phiên bản trong `public.schema_migrations`.
- Runner nhận diện migration order/inventory cũ đã được chạy thủ công để ghi
  nhận lại. Nếu phát hiện schema chỉ được áp dụng một phần, runner dừng và báo
  lỗi thay vì đoán cách sửa dữ liệu.
- Backup database trước khi triển khai migration lên dữ liệu có giá trị.

Chi tiết về thứ tự migration nằm trong [migrations/README.md](./migrations/README.md).
