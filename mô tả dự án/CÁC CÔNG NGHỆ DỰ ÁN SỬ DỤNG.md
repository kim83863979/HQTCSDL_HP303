**TỔNG THỂ CÁC CÔNG NGHỆ CẦN DÙNG**

| Phần của hệ thống | Công nghệ sử dụng | Mục đích sử dụng |
| :---: | :---: | :---: |
| Vending Client | React \+ JavaScript \+ Vite | Xây dựng giao diện khách hàng trên máy bán hàng: xem sản phẩm, chọn sản phẩm, giỏ hàng, thanh toán và nhận kết quả |
| Admin Dashboard | React \+ JavaScript \+ Vite | Xây dựng giao diện cho Admin/Operator: quản lý sản phẩm, tồn kho, máy, cảnh báo, người dùng và theo dõi hoạt động |
| Backend | Node.js \+ Express.js | Xây dựng Backend và xử lý nghiệp vụ của toàn hệ thống |
| API | RESTful API \+ JSON | Giao tiếp giữa Vending Client, Admin Dashboard và Backend |
| Database | PostgreSQL | Lưu trữ dữ liệu sản phẩm, danh mục, đơn hàng, tồn kho, máy bán hàng, người dùng, IoT, cảnh báo... |
| Kết nối Backend – Database | node-postgres (pg) | Cho phép Backend Node.js kết nối và thực hiện truy vấn SQL trên PostgreSQL |
| IoT Simulator | Python | Mô phỏng máy bán hàng, cảm biến nhiệt độ, trạng thái máy, motor và quá trình nhả hàng |
| Giao tiếp IoT | MQTT | Truyền dữ liệu và lệnh giữa Backend và IoT Simulator |
| MQTT Broker | Mosquitto | Trung gian nhận và chuyển các MQTT message giữa Backend và IoT Simulator |
| Thanh toán | Payment Mock | Mô phỏng quá trình thanh toán trong prototype, không cần tích hợp cổng thanh toán thật |
| Kiểm thử API | Postman | Gửi request và kiểm tra các RESTful API của Backend |
| Tài liệu API | Swagger / OpenAPI | Mô tả các API, request, response và hỗ trợ kiểm thử API |
| Kiểm thử Backend | Jest \+ Supertest | Kiểm thử Backend và API khi hệ thống đã ổn định |
| Kiểm thử Frontend | Vitest \+ React Testing Library | Kiểm thử các thành phần và chức năng giao diện React khi có đủ thời gian |
| Quản lý mã nguồn | Git \+ GitHub | Lưu trữ source code, quản lý branch, commit, Pull Request và làm việc nhóm |
| Quản lý Database | pgAdmin | Xem, kiểm tra, tạo và quản lý PostgreSQL trong quá trình phát triển |
| Code Editor | Visual Studio Code | Môi trường lập trình chính cho Backend, Frontend, Database script và IoT Simulator |
| Container / Triển khai | Docker \+ Docker Compose | Đóng gói và chạy các thành phần của hệ thống như Backend, PostgreSQL, MQTT Broker và các service cần thiết |
| Quản lý package JavaScript | npm | Cài đặt và quản lý các thư viện JavaScript cho Backend và Frontend |

 

