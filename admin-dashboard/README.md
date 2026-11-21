# FreshVend Admin Dashboard

Portal FreshVend xây dựng bằng React, JavaScript và Vite. Admin và Operator dùng chung một màn hình đăng nhập; sau khi xác thực, giao diện được chọn tự động theo role.

## Chạy ứng dụng

```powershell
cd admin-dashboard
npm install
npm run dev
```

Mặc định Vite chạy tại `http://localhost:5174` và proxy `/api` đến backend `http://localhost:3000`. Có thể cấu hình API bằng biến môi trường `VITE_API_BASE_URL` (ví dụ `http://localhost:3000/api` khi backend đã cho phép CORS).

## Chức năng đã kết nối

- Đăng nhập chung qua `POST /api/auth/login`, xác thực phiên bằng `GET /api/auth/me`; token được lưu cục bộ và vai trò `ADMIN`/`OPERATOR` quyết định khu vực được mở.
- Admin vào dashboard quản trị; Operator được mount từ `operator.js` trong cùng phiên đăng nhập, dùng chung token và đăng xuất. Không có lựa chọn role thủ công tại form đăng nhập.
- Tổng quan hệ thống, danh sách/trạng thái máy và chi tiết máy/khe hàng.
- Trong môi trường phát triển, Admin mở **Máy bán hàng → chọn máy → Bật máy demo** để backend gửi nhịp kết nối mô phỏng và cho phép thử đặt hàng/thanh toán. Máy giữ trạng thái bật cho đến khi Admin bấm **Tắt máy demo**; nếu backend khởi động lại, lựa chọn này được khôi phục từ tệp cục bộ. Chế độ này không mô phỏng cơ cấu nhả hàng; muốn thử nhả hàng thực tế cần IoT Simulator và MQTT broker.
- Tra cứu tồn kho theo máy; gán sản phẩm vào khe trống; nhập hàng theo khe; xem chi tiết và phân trang lịch sử nhập kho; xuất CSV.
- Operator xem trạng thái máy, tồn kho, cảnh báo theo máy và lịch sử nhập; có thể nhập hàng hoặc phân bổ sản phẩm vào khe trống theo quyền backend.
- Quản lý catalog: tạo/cập nhật sản phẩm và danh mục, đổi giá, tìm kiếm/lọc theo danh mục/trạng thái, ngừng bán/kích hoạt sản phẩm và xóa danh mục chưa được tham chiếu.
- Xem tài khoản, đổi role giữa `ADMIN` và `OPERATOR`; không cho đổi role của tài khoản hiện tại.
- Quản lý vòng đời cảnh báo: lọc lịch sử theo thời gian/mức độ/trạng thái, tạo cảnh báo thủ công, xác nhận và giải quyết cảnh báo telemetry.
- Báo cáo doanh thu theo ngày/sản phẩm/máy, tổng hợp đơn hàng và hoàn tiền, danh sách/phân trang đơn hàng và thanh toán, xem chi tiết đơn hàng và xuất CSV.

## Giới hạn hiện tại

Mục cấu hình ngưỡng cảnh báo chưa có API tương ứng nên vẫn hiển thị trạng thái chưa tích hợp. Danh sách máy và trạng thái vẫn dùng API hiện có; dashboard chưa đăng ký WebSocket nên cần làm mới để nhận dữ liệu mới.

## Quyền API được sử dụng

- Catalog: `MANAGE_PRODUCT`.
- Gán sản phẩm và nhập kho: `MANAGE_INVENTORY`.
- Cảnh báo: `MANAGE_ALERT` (Operator được seed quyền xem cảnh báo; catalog và tài khoản vẫn dành cho Admin).
- Đơn hàng, thanh toán và báo cáo: `VIEW_REPORT`.

Các API quản trị được mô tả trong [`docs/api/admin-dashboard-api.md`](../docs/api/admin-dashboard-api.md); migration hỗ trợ cần được áp dụng trước khi sử dụng.
