# Kiểm thử backend

Cài dependency trong `backend` bằng `npm install`, cấu hình `DATABASE_URL` và
`JWT_SECRET` (nếu cần), sau đó chạy migration và dữ liệu seed của database.
Chạy toàn bộ kiểm thử bằng `npm test`.

Các test Products/Categories, Machines, Inventory và Auth cần PostgreSQL cùng
dữ liệu mẫu. Nhóm test Machines/Inventory/Auth tự bỏ qua các trường hợp cần DB
nếu chưa cấu hình `DATABASE_URL`; test validate input vẫn chạy. Test Auth tạo
tài khoản riêng theo UUID và xóa tài khoản đó sau khi hoàn tất.

Các API tương ứng cũng có trong Postman Collection
`docs/api/sprint1-api.postman_collection.json`; Products/Categories có
collection riêng tại `docs/api/product-api.postman_collection.json`.
