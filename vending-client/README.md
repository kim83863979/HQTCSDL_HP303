# Vending Client — Sprint 3

Giao diện khách hàng FreshVend viết bằng React + JavaScript + Vite, nằm trong thư mục vending-client theo cấu trúc repository hiện tại.

## Chạy ở máy cá nhân

1. Đảm bảo PostgreSQL và Backend đang chạy tại http://localhost:3000.
2. Mở terminal trong thư mục vending-client.
3. Cài thư viện và chạy giao diện. Lệnh `npm run dev` tự chạy simulator VM001 và gửi heartbeat mỗi 5 giây:

~~~powershell
npm install
npm run dev
~~~

Mở http://127.0.0.1:5173. Vite chuyển tiếp /api và /health sang Backend cổng 3000 để tránh cấu hình CORS riêng cho môi trường phát triển. Client tự làm mới trạng thái máy mỗi 15 giây; giữ terminal dev đang chạy để máy không chuyển lại OFFLINE.

Nếu chỉ muốn mở giao diện mà không chạy simulator, dùng `npm run dev:ui`. Khi dừng `npm run dev`, simulator cũng dừng.

Nếu Backend ở địa chỉ khác, tạo vending-client/.env.local và đặt VITE_API_BASE_URL=http://localhost:3000. Không đặt secret thanh toán trong biến VITE_* vì những giá trị này được gửi xuống trình duyệt.

## Chức năng

- Tải sản phẩm, danh mục, máy và tồn kho thật từ Backend.
- Lọc/tìm sản phẩm, hiển thị số lượng khả dụng theo máy và khe.
- Thêm/bỏ sản phẩm, chỉnh số lượng và tính tạm tính.
- Gửi yêu cầu tạo đơn với machineId, productId, slotId, quantity, sau đó tạo payment.
- Mô phỏng kết quả thanh toán thành công/thất bại qua Payment API; có thể thử thanh toán lại sau khi giao dịch thất bại.
- Theo dõi trạng thái đơn/payment do Backend trả về; giao diện không tự sửa trạng thái đơn hoặc tính lại giá từ phía client.

## Điểm cần phối hợp Backend

- Bản demo mở công khai API chỉ đọc `GET /api/machines`, `GET /api/inventory/machines/:machineId` và callback mô phỏng `POST /api/payments/:paymentId/result`. Các route sửa máy, tồn kho và tác vụ bảo trì vẫn giữ cơ chế quyền/secret hiện có.
- Backend hiện cung cấp `orderStatus` trên đơn để theo dõi kết quả nhả hàng. Nếu simulator cần hiển thị trạng thái trung gian riêng như `DISPENSING`, cần thống nhất field/endpoint đọc trạng thái với nhóm Backend/IoT.

## API được dùng

- GET /api/products?page=1&limit=100
- GET /api/categories
- GET /api/machines
- GET /api/inventory/machines/:machineId
- POST /api/orders
- POST /api/payments
- GET /api/orders/:orderId
- GET /api/payments/:paymentId
