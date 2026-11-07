 	**SPRINT 1**

1\. Mục tiêu Sprint 1

Cuối tuần, nhóm có thể chạy backend kết nối PostgreSQL, tạo được các bảng theo ERD, gọi được API cơ bản cho sản phẩm và tồn kho, đăng nhập và kiểm tra quyền ở mức nền tảng. IoT Simulator chỉ cần có khung và dữ liệu mẫu để chuẩn bị tích hợp ở Sprint 3\.

Chưa đưa vào phạm vi Sprint 1: đặt hàng, thanh toán, trừ tồn khi mua, điều khiển/nhả hàng, MQTT hoàn chỉnh, giao diện khách hàng và dashboard vận hành.

2\. Phân công theo thành viên

| Thành viên | Phụ trách chính | Việc cần hoàn thành trong Sprint 1 | Bàn giao |
| :---- | :---- | :---- | :---- |
| KIM | Điều phối nền tảng và database | Tạo cấu hình PostgreSQL; tạo migration/schema theo ERD đã chốt; thiết lập kết nối backend–database; thống nhất quy tắc đặt tên, cấu trúc module và cách chạy dự án. Rà soát các bảng dùng chung để tránh tạo trùng. | Database khởi tạo được từ đầu; hướng dẫn chạy; migration/schema; backend kết nối database thành công. |
| NGHĨA | Sản phẩm và danh mục | Làm module sản phẩm/danh mục theo schema đã thống nhất; xây API đọc danh sách và chi tiết sản phẩm; thêm kiểm tra dữ liệu đầu vào và xử lý trường hợp không tìm thấy. | API sản phẩm chạy được, có dữ liệu mẫu và hướng dẫn/test request. |
| NGUYÊN | Tồn kho | Làm module truy vấn tồn kho theo máy/khe; xác định rõ cách biểu diễn số lượng và liên kết với sản phẩm, máy, khe theo ERD; xử lý trường hợp máy hoặc khe không tồn tại. | API đọc tồn kho theo máy/khe; dữ liệu mẫu và hướng dẫn/test request. |
| HẢI | Máy, khe máy và khung IoT Simulator | Phụ trách thông tin máy và trạng thái máy. Phối hợp với KIM để thống nhất bảng máy/khe, nhưng không tự tạo trùng phần schema tồn kho của NGUYÊN. Tạo khung IoT Simulator có thể trả về trạng thái giả lập và ví dụ dữ liệu gửi về backend; chưa cần triển khai điều khiển thiết bị thật. | Module máy/trạng thái cơ bản; simulator khởi chạy được và trả dữ liệu mẫu theo định dạng nhóm thống nhất. |
| HUY | Tài khoản, vai trò và xác thực | Làm User/Role theo ERD; xây API đăng nhập cơ bản; mã hóa mật khẩu đúng chuẩn thư viện được chọn; bảo vệ API bằng xác thực và kiểm tra quyền theo vai trò ở tầng API. | Đăng nhập thành công/thất bại đúng; API được bảo vệ; có ví dụ kiểm tra quyền của từng vai trò. |

Ranh giới để tránh chồng chéo

* KIM quản lý migration và cấu trúc database dùng chung; thành viên phụ trách module góp ý trường dữ liệu theo ERD, không tự tạo schema riêng chưa thống nhất.  
* HẢI phụ trách máy và khung simulator; NGUYÊN phụ trách truy vấn tồn kho. Hai bạn cần thống nhất cách nối máy–khe–sản phẩm trước khi làm API.  
* HUY làm xác thực và kiểm tra quyền; các thành viên khác tích hợp cơ chế này khi tạo API, không tự làm một cơ chế đăng nhập riêng.  
* Các API chỉ dùng dữ liệu mẫu để kiểm tra trong Sprint 1; quy trình tạo đơn, thanh toán và trừ tồn để Sprint 2\.

3\. Kế hoạch thực hiện trong tuần

| Thời điểm | Công việc và kết quả cần chốt |
| :---- | :---- |
| Ngày 1 — Chốt hợp đồng tích hợp | Cả nhóm xác nhận ERD là nguồn chuẩn; thống nhất công nghệ, cấu trúc thư mục, quy tắc đặt tên, cách cấu hình môi trường và format lỗi/API. KIM tạo skeleton backend, database và migration đầu tiên. HUY chốt cách biểu diễn vai trò và luồng đăng nhập. |
| Ngày 2 — Hoàn thành nền database và chia module | KIM chạy được database từ cấu hình mới. NGHĨA, NGUYÊN, HẢI, HUY triển khai model/repository hoặc cấu trúc tương ứng theo dự án. Cả nhóm kiểm tra quan hệ và khóa ngoại theo ERD trước khi tiếp tục. |
| Ngày 3 — Xây API nền | NGHĨA hoàn thành API đọc sản phẩm; NGUYÊN hoàn thành API đọc tồn kho; HẢI hoàn thành API/thành phần máy cơ bản và simulator stub; HUY hoàn thành đăng nhập và middleware xác thực ban đầu. |
| Ngày 4 — Tích hợp chéo | Gắn các module vào cùng backend và database. HUY kiểm tra API được bảo vệ; KIM kiểm tra migration, cấu hình và luồng khởi động; các thành viên kiểm thử thành công, dữ liệu rỗng, ID không tồn tại và dữ liệu đầu vào sai. |
| Ngày 5 — Kiểm thử và chốt Sprint | Cả nhóm chạy lại dự án từ đầu theo hướng dẫn; xử lý lỗi tích hợp; cập nhật hướng dẫn chạy, danh sách API và ví dụ request/response. Mỗi người trình bày phần mình phụ trách và cách phần đó liên kết với kiến trúc chung. |

Nếu nhóm làm việc không theo lịch thứ Hai–thứ Sáu, có thể xem đây là 5 ngày làm việc và giữ nguyên thứ tự.

4\. Tiêu chí nghiệm thu Sprint 1

Sprint chỉ được xem là hoàn thành khi:

1\.    Thành viên khác có thể khởi động PostgreSQL và backend theo hướng dẫn, không phải sửa thủ công schema.

2\.    Các bảng thuộc phạm vi Sprint 1 được tạo từ migration/schema và quan hệ khớp ERD.

3\.    Backend kết nối PostgreSQL thành công; lỗi kết nối được hiển thị rõ, không báo chạy thành công giả.

4\.    API sản phẩm trả về dữ liệu mẫu hợp lệ; API tồn kho truy vấn được theo máy/khe.

5\.    API đăng nhập kiểm tra được thông tin xác thực; mật khẩu không lưu dạng văn bản thuần.

6\.    API cần đăng nhập từ chối request chưa xác thực; quyền vai trò được kiểm tra ở tầng API.

7\.    IoT Simulator có thể khởi chạy và trả dữ liệu mẫu theo format đã thống nhất; chưa yêu cầu điều khiển servo, MQTT hay thiết bị thật.

8\.    Có hướng dẫn chạy dự án, dữ liệu mẫu và ví dụ kiểm thử cho các API nền tảng.

9\.    Mỗi thay đổi đã được tích hợp và cả nhóm chạy được phiên bản chung — không chỉ chạy riêng trên máy người viết.

5\. Quy ước phối hợp nên áp dụng

* KIM công bố sớm tên bảng, khóa và cách khởi tạo database để các module không phát triển lệch schema.  
* HẢI và NGUYÊN cùng chốt cấu trúc máy/khe/tồn kho trước khi hoàn thiện API.  
* HUY chia sẻ cách gọi xác thực và danh sách vai trò để các thành viên áp dụng thống nhất.  
* Mỗi người kiểm tra module của mình trước; sau đó kiểm thử lại trên phiên bản tích hợp chung.  
* Tài liệu yêu cầu API nền tảng phản hồi dưới 500 ms ở điều kiện vận hành bình thường, nhưng Sprint 1 nên ưu tiên kiểm tra API hoạt động và đo được độ trễ cơ bản; chưa nên tuyên bố đạt ngưỡng khi chưa có kịch bản tải kiểm chứng.

 

