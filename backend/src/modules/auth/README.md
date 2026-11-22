# Module xác thực và phân quyền

Module dùng trực tiếp schema PostgreSQL trong `database/`; không dùng Sequelize
hay tự tạo bảng. Mật khẩu được băm bằng bcryptjs, JWT có thời hạn cấu hình qua
`JWT_EXPIRES_IN` (mặc định 8 giờ), và `JWT_SECRET` phải được đặt trong production.

## API

- `POST /api/auth/register`: tạo tài khoản `OPERATOR`; không nhận role từ client.
- `POST /api/auth/login`: xác minh mật khẩu và trả JWT.
- `GET /api/auth/me`: xác thực Bearer JWT và trả hồ sơ hiện tại.
- `GET /api/admin/users`: yêu cầu permission `MANAGE_USER`.
- `POST /api/admin/users`: chỉ Admin có permission `MANAGE_USER` được tạo tài
  khoản. Body gồm `email`, `fullname`, `password`, `role`; role chỉ nhận
  `ADMIN` hoặc `OPERATOR`. Mật khẩu dùng cùng validation và bcrypt hash như
  đăng ký công khai.
- `PATCH /api/admin/users/:userId/role`: chỉ Admin có permission `MANAGE_USER`
  được đổi role; role chỉ nhận `ADMIN` hoặc `OPERATOR`, và người dùng không thể
  tự đổi role của mình. Không thể hạ quyền quản trị viên cuối cùng.
- `DELETE /api/admin/users/:userId`: chỉ Admin có permission `MANAGE_USER` được
  xóa tài khoản `ADMIN` hoặc `OPERATOR`; không thể tự xóa hoặc xóa Admin cuối
  cùng. Tài khoản có lịch sử nhập hàng không thể xóa để bảo toàn dữ liệu nghiệp
  vụ; API trả `409` và giữ nguyên lịch sử.
- API đọc máy yêu cầu `VIEW_MACHINE`; API đọc tồn kho yêu cầu
  `MANAGE_INVENTORY`. Telemetry simulator dùng shared device key riêng.

Permission và role hiện tại được truy vấn từ database ở mỗi request quản trị,
do đó thay đổi role có hiệu lực ngay cả với JWT còn hạn.

Mọi API được phân quyền phải đi qua `authenticateToken` và kiểm tra permission
hoặc role ở router trước khi vào controller. Không bảo vệ API đọc catalog công
khai hoặc callback thiết bị/thanh toán bằng JWT người dùng.
