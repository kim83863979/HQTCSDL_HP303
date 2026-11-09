# Module xác thực và phân quyền

Module dùng trực tiếp schema PostgreSQL trong `database/`; không dùng Sequelize
hay tự tạo bảng. Mật khẩu được băm bằng bcryptjs, JWT có thời hạn cấu hình qua
`JWT_EXPIRES_IN` (mặc định 8 giờ), và `JWT_SECRET` phải được đặt trong production.

## API

- `POST /api/auth/register`: tạo tài khoản `OPERATOR`; không nhận role từ client.
- `POST /api/auth/login`: xác minh mật khẩu và trả JWT.
- `GET /api/auth/me`: xác thực Bearer JWT và trả hồ sơ hiện tại.
- `GET /api/admin/users`: yêu cầu permission `MANAGE_USER`.
- `PATCH /api/admin/users/:userId/role`: yêu cầu `MANAGE_USER`; role chỉ nhận
  `ADMIN` hoặc `OPERATOR`, và người dùng không thể tự đổi role của mình.
- API đọc máy yêu cầu `VIEW_MACHINE`; API đọc tồn kho yêu cầu
  `MANAGE_INVENTORY`. Telemetry simulator dùng shared device key riêng.

Permission được truy vấn từ `users` → `role_permissions` → `permissions` ở mỗi
request quản trị, do đó thay đổi role có hiệu lực ngay cả với JWT còn hạn.

Mọi API được phân quyền phải đi qua `authenticateToken` và kiểm tra permission
hoặc role ở router trước khi vào controller. Không bảo vệ API đọc catalog công
khai hoặc callback thiết bị/thanh toán bằng JWT người dùng.
