**KIẾN TRÚC TỔNG THỂ**

![][image1]

# **MÔ TẢ ĐỀ TÀI**

# 3.1.2. Tên dự án

Tiếng Anh: FreshVend \- A Smart IoT-Enabled Automated Fruit Vending Machine with Real-Time Inventory and Cold Chain Management.

Tiếng Việt: Fresh Vend \- Máy bán trái cây tự động thông minh tích hợp IoT, quản lý tồn kho thời gian thực và chuỗi lạnh.

## (\*) 3.2. Nội dung đề xuất chính (bao gồm kết quả và sản phẩm)

### a) Bối cảnh:

Thị trường bán lẻ trái cây tươi tại các khu vực đô thị của Việt Nam đang phải đối mặt với một thách thức mang tính cơ cấu nghiêm trọng: nhân viên văn phòng, sinh viên và cư dân tại các tòa nhà có mật độ cao — đặc biệt là những người có ít thời gian để đi mua thực phẩm — thiếu khả năng tiếp cận trái cây tươi một cách thuận tiện, vệ sinh và suốt 24 giờ, với các phần trái cây được chia sẵn, ở gần nơi làm việc, trường học và khu dân cư.

Hiện nay, người tiêu dùng phải lựa chọn giữa một hệ thống các phương án bị phân mảnh: họ phải dựa vào các chợ truyền thống với thời gian hoạt động không cố định, các cửa hàng tiện lợi với lựa chọn trái cây hạn chế và thường có chất lượng thấp, hoặc các ứng dụng giao hàng với chi phí cao và thời gian giao hàng không ổn định. Bối cảnh thiếu đồng bộ này gây ra sự bất tiện đáng kể, lãng phí thực phẩm do mua quá nhiều và làm giảm khả năng tiếp cận thực phẩm tươi đối với nhóm dân cư đô thị có quỹ thời gian hạn chế.

Đối với các đơn vị vận hành tòa nhà và quản lý cơ sở vật chất, tình hình cũng gặp nhiều vấn đề tương tự. Việc tìm kiếm một nhà cung cấp thực phẩm tươi đáng tin cậy, đàm phán các điều khoản về mặt bằng và chia sẻ doanh thu, đồng thời đảm bảo chất lượng sản phẩm và tiêu chuẩn vệ sinh ổn định đều phải được thực hiện thông qua các thỏa thuận không chính thức, mang tính tạm thời. Hiện chưa có một giải pháp tự phục vụ hoàn chỉnh, sẵn sàng triển khai để cung cấp trái cây tươi như một tiện ích của tòa nhà mà không cần nhân viên trực tiếp.

Khoảng trống trên thị trường là rất rõ ràng: hiện chưa tồn tại ở quy mô lớn trên thị trường máy bán hàng tự động Việt Nam một giải pháp bán hàng tự động hiện đại, không cần người vận hành trực tiếp, có kiểm soát nhiệt độ, có khả năng duy trì độ tươi của trái cây thông qua việc bảo quản trong chuỗi lạnh ổn định, cung cấp trải nghiệm lựa chọn và thanh toán nhanh chóng thông qua màn hình cảm ứng, tự động thực hiện cơ chế phân phối sản phẩm mà không cần sự can thiệp của con người, đồng thời cho phép giám sát tồn kho từ xa và gửi cảnh báo bổ sung hàng cho người vận hành.

Dự án này — FreshVend — trực tiếp giải quyết những vấn đề trên bằng cách xây dựng một máy bán trái cây tự phục vụ, có làm lạnh, được trang bị giao diện màn hình cảm ứng để lựa chọn sản phẩm và thanh toán, cùng với cơ chế phân phối tự động có khả năng cung cấp một phần trái cây tươi theo yêu cầu, được thiết kế đặc biệt cho các tòa nhà văn phòng, khuôn viên trường đại học và khu dân cư tại Việt Nam.

### b) Giải pháp đề xuất:

Xây dựng một hệ thống máy bán hàng tự động tích hợp phần cứng và phần mềm — FreshVend — hoạt động như một điểm bán lẻ trái cây tươi hoàn toàn tự động, không cần nhân viên trực tiếp phục vụ người tiêu dùng, đồng thời là một công cụ quản lý tập trung dành cho người vận hành.

Hệ thống cung cấp sáu trụ cột chức năng chính:

(1) Module Đặt hàng và Thanh toán bằng màn hình cảm ứng:

Hỗ trợ giao diện màn hình cảm ứng 14 inch hiển thị các lựa chọn phần trái cây có sẵn cùng với giá, hình ảnh và trạng thái tồn kho; được tích hợp cổng thanh toán QR để hoàn tất toàn bộ giao dịch trong vòng chưa đến 30 giây.

(2) Cơ chế Phân phối và Lấy sản phẩm tự động:

Tích hợp hệ thống phân phối sử dụng trục điều khiển bằng servo, có khả năng giải phóng từng phần trái cây một từ các cột sản phẩm được xếp theo chiều dọc sau khi xác nhận thanh toán, đảm bảo nguyên tắc FIFO (First-In-First-Out — nhập trước, xuất trước) trong việc luân chuyển hàng tồn kho và có khả năng phát hiện kẹt sản phẩm với cơ chế tự động thử lại.

(3) Module Chuỗi lạnh và Kiểm soát nhiệt độ:

Duy trì nhiệt độ bên trong ổn định (phạm vi mục tiêu, ví dụ: 2–8°C) thông qua một bộ làm lạnh sử dụng máy nén, đồng thời ghi nhận nhiệt độ theo thời gian thực, gửi cảnh báo khi nhiệt độ vượt ngưỡng và hiển thị thông báo suy giảm hoạt động một cách phù hợp trên màn hình cảm ứng nếu hiệu suất làm lạnh giảm xuống dưới mức chấp nhận được.

(4) Module Giám sát tồn kho từ xa và Quản lý IoT:

Cung cấp bảng điều khiển được kết nối với nền tảng đám mây, hiển thị số lượng tồn kho theo thời gian thực của từng cột sản phẩm, cảnh báo khi hàng sắp hết và sắp hết hạn, nhật ký giao dịch bán hàng và các chỉ số tình trạng máy (nhiệt độ, trạng thái cửa, lỗi phân phối), cho phép người vận hành chủ động bổ sung hàng và bảo trì.

(5) Cổng Quản lý người vận hành và Bổ sung hàng:

Cho phép nhân viên hiện trường đăng nhập thông qua giao diện quản trị của máy hoặc ứng dụng di động đi kèm để cập nhật giá sản phẩm, điều chỉnh việc phân bổ các cột sản phẩm, ghi nhận các sự kiện bổ sung hàng và xóa các trạng thái lỗi.

(6) Bảng điều khiển Phân tích kinh doanh và Bán hàng:

Tổng hợp lịch sử giao dịch, doanh thu theo sản phẩm và địa điểm, thời gian sử dụng cao điểm.

---

## c) Yêu cầu chức năng:

### 3.2.1. Người tiêu dùng cuối

- Với vai trò là Khách hàng, tôi muốn duyệt các lựa chọn phần trái cây có sẵn trên màn hình cảm ứng 14 inch với hình ảnh chất lượng cao, giá cả và trạng thái tồn kho theo thời gian thực, để tôi có thể đưa ra quyết định mua hàng một cách đầy đủ thông tin.
- Với vai trò là Khách hàng, tôi muốn chọn một hoặc nhiều phần trái cây và thêm chúng vào giỏ hàng ảo, để tôi có thể tiến hành thanh toán tập trung.
- Với vai trò là Khách hàng, tôi muốn hoàn tất giao dịch bằng các cổng thanh toán được tích hợp (mã QR, ví điện tử hoặc thẻ tín dụng) trong vòng 30 giây, để tôi có trải nghiệm thanh toán nhanh chóng và thuận tiện.
- Với vai trò là Khách hàng, tôi muốn nhận phần trái cây đã chọn từ khe phân phối tự động sau khi thanh toán thành công, đảm bảo sản phẩm được giao mà không cần sự can thiệp của con người.
- Với vai trò là Khách hàng, tôi muốn nhận được thông báo trên màn hình hoặc hóa đơn điện tử nếu xảy ra tình trạng kẹt trong quá trình phân phối, để tôi được thông báo về lỗi và có thể thực hiện theo hướng dẫn tự động thử lại hoặc hoàn tiền.

### 3.2.2. Người vận hành / Nhân viên hiện trường

- Với vai trò là Người vận hành, tôi muốn đăng nhập an toàn vào giao diện quản trị của máy hoặc ứng dụng di động đi kèm, để tôi có thể thực hiện các nhiệm vụ bảo trì và bổ sung hàng.
- Với vai trò là Người vận hành, tôi muốn cập nhật giá sản phẩm và điều chỉnh việc phân bổ các cột cho các loại phần trái cây khác nhau, để hàng tồn kho của máy luôn linh hoạt và được cập nhật.
- Với vai trò là Người vận hành, tôi muốn ghi nhận các sự kiện bổ sung hàng và “xóa” các trạng thái lỗi (chẳng hạn như kẹt sản phẩm hoặc lỗi cảm biến), để hệ thống duy trì nhật ký kiểm toán chính xác đối với tất cả các thao tác thủ công.
- Với vai trò là Người vận hành, tôi muốn nhận cảnh báo theo thời gian thực về tình trạng sắp hết hàng và sản phẩm sắp hết hạn trên thiết bị di động của mình, để tôi có thể chủ động lên lịch các chuyến bổ sung hàng nhằm ngăn chặn tình trạng hết hàng.
- Với vai trò là Người vận hành, tôi muốn xem nhật ký nhiệt độ bên trong máy và trạng thái cửa (mở/đóng), để tôi có thể đảm bảo chuỗi lạnh được duy trì và thiết bị được bảo vệ an toàn.

### 3.2.3. Quản trị viên hệ thống / Quản lý

- Với vai trò là Quản trị viên, tôi muốn truy cập một bảng điều khiển tập trung được kết nối với nền tảng đám mây để giám sát trạng thái và các chỉ số tình trạng theo thời gian thực của toàn bộ hệ thống máy bán hàng tự động, để tôi có thể quản lý hoạt động theo khu vực một cách hiệu quả.
- Với vai trò là Quản trị viên, tôi muốn quản lý tài khoản người dùng và vai trò của nhân viên vận hành và nhân viên bảo trì, để tôi có thể kiểm soát quyền truy cập và đảm bảo an toàn hệ thống.
- Với vai trò là Quản trị viên, tôi muốn cấu hình các cảnh báo ngưỡng nhiệt độ và các thông báo “suy giảm hoạt động phù hợp” trên màn hình cảm ứng, để khách hàng được thông báo nếu hiệu suất làm lạnh giảm xuống dưới các tiêu chuẩn an toàn thực phẩm.
- Với vai trò là Quản trị viên, tôi muốn xem nhật ký giao dịch bán hàng chi tiết và các phân tích kinh doanh (doanh thu theo sản phẩm, địa điểm và thời gian sử dụng cao điểm), để tôi có thể đưa ra các quyết định dựa trên dữ liệu về giá cả và vị trí đặt máy.
- Với vai trò là Quản trị viên, tôi muốn xuất các báo cáo vận hành và tài chính dưới định dạng PDF/CSV, để tôi có thể hỗ trợ công tác kiểm toán kinh doanh và lập kế hoạch tồn kho.

---

## d) Yêu cầu phi chức năng:

### Hiệu năng (Performance):

- Hệ thống phải hoàn tất quá trình giao dịch thanh toán trong vòng dưới 30 giây.
- API của nền tảng cốt lõi phải trả về kết quả trong vòng 500 mili-giây đối với 95% số request trong điều kiện tải vận hành bình thường.
- Dữ liệu cảm biến IoT (nhiệt độ, trạng thái máy) phải được truyền đến bảng điều khiển quản lý trong vòng 2 giây thông qua WebSocket.

### Khả năng sử dụng (Usability):

- Giao diện màn hình cảm ứng 14 inch phải trực quan, cho phép khách hàng hoàn tất một giao dịch mua hàng trong tối đa 5 lần tương tác.
- Bảng điều khiển quản trị phải hoàn toàn đáp ứng trên thiết bị di động (mobile-responsive) để hỗ trợ nhân viên hiện trường sử dụng nhiều loại thiết bị di động.

### Bảo mật (Security):

- Tất cả dữ liệu giao dịch và thông tin liên lạc của người dùng phải được mã hóa khi truyền bằng TLS 1.2+ và được mã hóa khi lưu trữ bằng AES-256.
- Role-Based Access Control (RBAC) phải được thực thi nghiêm ngặt ở tầng API; nhân viên vận hành hiện trường không được phép truy cập các dữ liệu phân tích tài chính cấp cao dành riêng cho Quản trị viên.

### Khả năng mở rộng (Scalability):

- Hạ tầng đám mây phải hỗ trợ quản lý đồng thời ít nhất 1.000 máy bán hàng tự động mà không làm suy giảm hiệu năng.
- Các microservice AI và IoT phải hỗ trợ khả năng mở rộng theo chiều ngang thông qua triển khai dạng container (ví dụ: Docker).

### Tính sẵn sàng (Availability):

- Giao diện máy bán hàng tự động phải đạt 99,9% uptime để phục vụ khách hàng 24/7.
- Hệ thống phải bao gồm “Offline Mode” để hiển thị các trạng thái cơ bản hoặc thông báo rõ ràng “Out of Order” nếu mất kết nối với nền tảng đám mây hoặc hiệu suất làm lạnh gặp sự cố.

### Độ tin cậy (Reliability):

- Cơ chế phân phối tự động phải duy trì tỷ lệ lỗi/kẹt dưới 2% trên toàn bộ các chu kỳ vận hành.
- Hệ thống phải duy trì chuỗi lạnh ổn định trong khoảng 2–8°C; mọi sai lệch phải kích hoạt cảnh báo mức ưu tiên cao ngay lập tức.
- Tất cả các tác vụ xử lý nền, chẳng hạn như đồng bộ hóa tồn kho, phải bao gồm cơ chế thử lại (retry) và hàng đợi thư chết (dead-letter queue) để đảm bảo tính toàn vẹn dữ liệu.

### Khả năng bảo trì (Maintainability):

- Codebase phải tuân theo các nguyên tắc Clean Architecture, với sự phân tách rõ ràng trách nhiệm giữa các tầng.
- Các hợp đồng API phải được tài liệu hóa đầy đủ thông qua Swagger/OpenAPI và được quản lý phiên bản phù hợp để tạo điều kiện cho việc nâng cấp trong tương lai.

---

## e) Lý thuyết & Thực hành:

Sinh viên phải áp dụng quy trình phát triển phần mềm Agile/Scrum và phương pháp mô hình hóa hệ thống UML 2.0 trong suốt quá trình thực hiện dự án.

Các sản phẩm bàn giao bắt buộc bao gồm:

- User Requirements Specification (URS) và Software Requirements Specification (SRS).
- System Architecture Design Document, bao gồm Component Diagram, Deployment Diagram và ERD.
- Detailed Design Document, bao gồm API Specification, Database Schema và UI Wireframes.
- System Implementation Report và Test Plan/Test Report (kiểm thử Unit, Integration và Performance).
- Installation Guide và User Manuals (cụ thể dành cho Customer, Operator và Administrator).
- Mã nguồn có thể triển khai hoàn chỉnh và các gói triển khai dựa trên Docker.

---

## f) Sản phẩm (Kết quả bàn giao dự kiến):

1\. Centralized Management API — API Quản lý tập trung:

Một API hoàn chỉnh, có xác thực và được tài liệu hóa, phục vụ tất cả các chức năng của nền tảng, bao gồm quản lý tồn kho, giao dịch và nhật ký chuỗi lạnh.

2\. Vending Machine Client Application — Ứng dụng máy bán hàng tự động:

Một giao diện màn hình cảm ứng tích hợp, cung cấp chức năng duyệt sản phẩm, quản lý giỏ hàng và tích hợp cổng thanh toán (QR/Ví điện tử).

3\. Automated Hardware Controller — Bộ điều khiển phần cứng tự động:

Một module firmware dựa trên ESP32, có nhiệm vụ điều khiển cơ chế phân phối sử dụng servo và giám sát dữ liệu môi trường theo thời gian thực.

4\. Operator Mobile App — Ứng dụng di động dành cho người vận hành:

Một ứng dụng chuyên dụng dành cho nhân viên hiện trường để nhận cảnh báo hàng sắp hết/sắp hết hạn và ghi nhận các sự kiện bổ sung hàng.

5\. Admin Business Dashboard — Bảng điều khiển kinh doanh dành cho quản trị viên:

Một cổng web để giám sát toàn bộ hệ thống máy theo thời gian thực, phân tích chuỗi lạnh và lập báo cáo tài chính.

---

## g) Các nhiệm vụ đề xuất:

### Gói công việc 1: Thiết kế cơ sở dữ liệu và Phát triển REST API cốt lõi

Thiết kế lược đồ cơ sở dữ liệu quan hệ (PostgreSQL) và phát triển các dịch vụ backend cốt lõi, bao gồm xác thực (JWT/OAuth2), kiểm soát truy cập dựa trên vai trò (RBAC), quản lý tồn kho sản phẩm và logic giao dịch.

### Gói công việc 2: Tích hợp phần cứng IoT và Firmware

Phát triển firmware cho vi điều khiển ESP32 để điều khiển cơ chế phân phối sử dụng servo, tích hợp cảm biến DHT22 để giám sát chuỗi lạnh và triển khai việc truyền dữ liệu theo thời gian thực lên nền tảng đám mây.

### Gói công việc 3: Giao diện khách hàng trên màn hình cảm ứng và Tích hợp thanh toán

Phát triển giao diện người dùng trên màn hình cảm ứng 14 inch dành cho khách hàng, tập trung vào trải nghiệm duyệt sản phẩm, quản lý giỏ hàng và tích hợp liền mạch với các cổng thanh toán bên thứ ba (mã QR, ví điện tử).

### Gói công việc 4: Cổng Web tập trung (Bảng điều khiển Admin & Operator)

Xây dựng một cổng quản lý trên nền web toàn diện và responsive. Cổng này bao gồm module Administrator (giám sát toàn bộ hệ thống máy, phân tích doanh số) và module Operator dành cho nhân viên hiện trường để xử lý việc bổ sung hàng, quản lý hạn sử dụng sản phẩm và nhận cảnh báo hệ thống thông qua thông báo trên web.

### Gói công việc 5: Tích hợp hệ thống, Kiểm thử và Triển khai

Thực hiện tích hợp đầu cuối giữa các thành phần phần cứng và phần mềm, tiến hành đánh giá hiệu năng (độ tin cậy của chuỗi lạnh và độ chính xác của cơ chế phân phối), đóng gói các dịch vụ bằng Docker và thiết lập các quy trình CI/CD.

### Gói công việc 6: Tài liệu dự án và Đảm bảo chất lượng

Chuẩn bị tất cả các sản phẩm bàn giao bắt buộc: SRS, tài liệu Architecture & Detailed Design, tài liệu API, Test Plan/Reports, Installation Guides và User Manuals (Customer, Operator, Admin).

---

### Thông báo:

Tất cả sinh viên được yêu cầu hiểu rõ toàn bộ kiến trúc hệ thống, các nguyên tắc tích hợp IoT và phần cứng (bao gồm cơ chế phân phối tự động và quản lý chuỗi lạnh), cũng như phần module mà cá nhân mình phụ trách.

Mỗi thành viên trong nhóm phải có khả năng giải thích rõ ràng thiết kế tổng thể của hệ thống và phần triển khai cụ thể của mình trước hội đồng vấn đáp (viva committee).

## 4\. Các nhận xét khác

(Đề xuất tất cả những nội dung liên quan nếu có.)
