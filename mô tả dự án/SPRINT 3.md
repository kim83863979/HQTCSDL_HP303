# SPRINT 3 — XÂY DỰNG IOT SIMULATOR VÀ GIAO DIỆN VẬN HÀNH (ADMIN/OPERATOR)

**Thời gian:** Tuần 3

## 1. Mục tiêu

Kết nối đơn hàng đã thanh toán với máy bán hàng mô phỏng; hoàn thiện giao diện khách hàng để theo dõi quá trình mua và nhả hàng; xây dựng giao diện Operator cho công việc hiện trường; đồng thời xây dựng giao diện Admin để giám sát tập trung máy móc và quản lý vận hành.

Sprint này tập trung hoàn thành luồng chính trên môi trường phát triển. Kiểm thử hồi quy toàn hệ thống, mở rộng kiểm thử các tình huống lỗi và đóng gói triển khai thuộc Sprint 4–5.

## 2. Đầu vào Sprint

- Backend, Database, đăng nhập và luồng mua hàng Sprint 2 có thể chạy; nhóm ghi nhận các lỗi tồn tại để phân biệt lỗi nền với lỗi mới.
- Có dữ liệu mẫu máy, khe, sản phẩm và tồn kho để tạo và chạy thử đơn hàng.
- NGHĨA, HẢI và KIM thống nhất cách tra cứu máy/khe cho từng sản phẩm trong đơn hàng.
- NGUYÊN, HUY và KIM thống nhất API, quyền truy cập và dữ liệu cần ghi nhận cho thao tác bổ sung hàng, theo dõi máy và xử lý cảnh báo.
- KIM phụ trách giao diện Admin; HUY phụ trách đăng nhập, phân quyền và API quản trị tài khoản/role, nhật ký. Hai bạn thống nhất request/response và quyền của API trước khi tích hợp.
- HẢI cung cấp dữ liệu máy/telemetry, NGUYÊN cung cấp dữ liệu tồn kho/cảnh báo; KIM kết nối các nguồn dữ liệu này vào Admin dashboard.
- HẢI và KIM thống nhất trước khi tích hợp về broker MQTT, thông tin kết nối, topic, payload và cách đối chiếu lệnh với kết quả.

## 3. Phân công chi tiết

### NGHĨA — Giao diện khách hàng trên máy bán hàng

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Màn hình sản phẩm | Kết nối Product API; hiển thị danh sách/chi tiết sản phẩm, giá và tình trạng còn hàng. Có trạng thái đang tải, danh mục trống và lỗi kết nối rõ ràng. |
| Giỏ hàng | Cho phép thêm, bỏ sản phẩm và đổi số lượng; tính tạm tính từ giá Backend trả về; kiểm tra số lượng khả dụng trước khi gửi đơn. |
| Tạo đơn và thanh toán | Kết nối Order/Payment API Sprint 2 theo đúng request/response hiện có; không tự quyết định giá hoặc cập nhật trạng thái đơn ở client; hiển thị rõ kết quả thanh toán. |
| Theo dõi nhả hàng | Sau khi thanh toán thành công, hiển thị trạng thái chờ xử lý/đang nhả/hoàn tất/thất bại dựa trên dữ liệu Backend; thông báo cho khách nếu nhả hàng thất bại. |
| Tích hợp và bàn giao | Chạy giao diện với Backend và dữ liệu máy/khe; ghi hướng dẫn khởi chạy, cấu hình địa chỉ API và các bước demo luồng khách hàng. |

**Đầu ra NGHĨA**

- Giao diện khách hàng dùng được API thật.
- Demo được luồng xem sản phẩm → giỏ hàng → tạo đơn/thanh toán → theo dõi kết quả nhả hàng.
- Có hướng dẫn chạy, cấu hình và danh sách phần còn phụ thuộc Backend.

### NGUYÊN — Giao diện và nghiệp vụ hỗ trợ nhân viên hiện trường

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Tổng quan máy | Tạo giao diện responsive cho Operator; xem danh sách máy, trạng thái online/offline, trạng thái hoạt động và nhiệt độ gần nhất; mở được chi tiết máy và danh sách khe. |
| Tồn kho và cảnh báo | Hiển thị tồn kho theo máy/khe/sản phẩm; làm nổi bật tồn thấp và cảnh báo do Backend cung cấp; thể hiện thời gian hoặc nguyên nhân khi dữ liệu có sẵn. |
| Ghi nhận bổ sung hàng | Tạo form chọn máy/khe/sản phẩm, nhập số lượng và ghi chú; kiểm tra dữ liệu trước khi gửi; gọi API để cập nhật tồn kho và tạo sự kiện bổ sung. Chỉ báo thành công sau khi Backend xác nhận. |
| Cập nhật dữ liệu sau thao tác | Tải lại dữ liệu máy/tồn kho sau khi bổ sung hoặc khi có cập nhật trạng thái; không tự cộng tồn kho ở giao diện và không gửi lặp thao tác ngoài ý muốn. |
| Tích hợp và bàn giao | Phối hợp HUY để kiểm tra quyền Operator, phối hợp KIM thống nhất API và dữ liệu cảnh báo; ghi hướng dẫn chạy và kịch bản demo. |

**Đầu ra NGUYÊN**

- Giao diện Operator responsive dùng API thật để xem máy, khe, tồn kho và cảnh báo.
- Demo được thao tác bổ sung hợp lệ, tồn kho được cập nhật và sự kiện bổ sung được lưu.
- Có hướng dẫn chạy và ghi chú về API/quyền cần cấu hình.

### HẢI — IoT Simulator, MQTT và mô phỏng cơ chế nhả hàng

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Mở rộng simulator hiện tại | Nâng cấp khung simulator Sprint 1; cho phép cấu hình mã máy và kết nối môi trường phát triển; tiếp tục hỗ trợ bản tin telemetry đã thống nhất gồm trạng thái máy, nhiệt độ, độ ẩm, trạng thái cửa/cảm biến và thời gian. |
| Thống nhất và triển khai MQTT | Cùng KIM chốt broker, cấu hình kết nối, topic và JSON payload trước khi tích hợp. Topic đề xuất: `freshvend/{machineCode}/telemetry`, `freshvend/{machineCode}/commands/dispense`, `freshvend/{machineCode}/events/dispense-result`. |
| Nhận lệnh nhả hàng | Subscribe lệnh của đúng máy; kiểm tra mã máy, mã lệnh/đơn, khe và số lượng; mô phỏng hoạt động motor và thời gian nhả. Sprint này chỉ mô phỏng, không điều khiển phần cứng thật. |
| Gửi kết quả | Publish `DISPENSE_SUCCESS` hoặc `DISPENSE_FAILED`, kèm mã lệnh, mã đơn, máy, khe, thời điểm và thông tin lỗi phù hợp để Backend đối chiếu. |
| Kịch bản demo và tài liệu | Chuẩn bị kịch bản lặp lại được cho nhả thành công và thất bại; ghi hướng dẫn chạy broker/simulator, cấu hình và định dạng topic/payload trong README của simulator. Không ghi thông tin xác thực broker vào mã nguồn. |

**Đầu ra HẢI**

- IoT Simulator nhận lệnh DISPENSE qua MQTT, mô phỏng motor/nhả hàng và gửi kết quả tương ứng.
- Có tài liệu topic/payload, cấu hình và hướng dẫn khởi chạy.
- Có kịch bản demo nhả thành công và nhả thất bại.

### HUY — Đăng nhập, phân quyền và API quản trị

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Đăng nhập và phân quyền | Dùng cơ chế xác thực hiện có; xác định rõ quyền Admin và Operator; bảo vệ API theo vai trò/permission ở Backend, không dựa riêng vào ẩn/hiện chức năng trên giao diện. |
| Bảo vệ API theo chức năng | Phối hợp NGUYÊN và KIM xác định quyền tối thiểu cho xem máy/tồn kho, bổ sung hàng và xử lý cảnh báo; bảo đảm cả API Operator lẫn API Admin (bao gồm cấu hình ngưỡng) được kiểm tra quyền ở Backend. |
| Nhật ký thao tác | Bảo đảm thao tác bổ sung hàng, đổi role và xử lý cảnh báo được ghi nhận người thực hiện, hành động, đối tượng, thời gian và kết quả; danh tính lấy từ phiên đăng nhập. |
| Kiểm tra xác thực và dữ liệu | Kiểm tra request chưa đăng nhập, tài khoản Operator/Admin, request thiếu quyền và dữ liệu bổ sung sai/thiếu; xác nhận request không hợp lệ không làm thay đổi tồn kho. |
| API tài khoản/role | Hoàn thiện API liệt kê người dùng và cập nhật role Admin/Operator; chỉ người có quyền quản trị được sử dụng, kiểm tra role hợp lệ và ngăn người dùng tự đổi role. |
| API nhật ký và bàn giao | Cung cấp API có phân quyền để tra cứu nhật ký; thống nhất request/response, quyền và mã lỗi với KIM; ghi ma trận quyền và kết quả kiểm tra để dùng ở Sprint 4. |

**Đầu ra HUY**

- Đăng nhập, API quản trị tài khoản/role và nhật ký được bảo vệ đúng quyền; thao tác quản trị ghi đúng người thực hiện.
- Operator không thể gọi API chỉ dành cho Admin; request sai quyền hoặc dữ liệu không hợp lệ bị từ chối.
- Có ma trận quyền và kết quả kiểm tra đăng nhập/phân quyền/API để bàn giao cho KIM và nhóm.

### KIM — Giao diện Admin và tích hợp Backend/IoT

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Giao diện tổng quan Admin | Xây dựng dashboard responsive; hiển thị danh sách máy, trạng thái online/offline, trạng thái hoạt động, nhiệt độ gần nhất và cảnh báo từ API; hỗ trợ mở trang chi tiết máy. |
| Chi tiết máy và cấu hình cảnh báo | Hiển thị telemetry, lịch sử nhiệt độ/trạng thái và sự kiện theo dữ liệu Backend; xây dựng giao diện xem/cập nhật ngưỡng nhiệt độ cảnh báo (mốc tham chiếu 2–8°C). Nếu Backend chưa có chức năng cấu hình, KIM bổ sung API/service lưu và đọc cấu hình; phối hợp HUY bảo vệ endpoint để chỉ Admin được thay đổi. Thể hiện rõ lỗi, chưa có dữ liệu và thời điểm cập nhật. |
| Quản lý người dùng và nhật ký trên giao diện | Tích hợp API của HUY để xem danh sách người dùng, cập nhật role theo quyền được cấp và tra cứu nhật ký; xác nhận thao tác đổi role, hiển thị kết quả từ Backend, không giả lập thành công ở client. |
| Hợp đồng tích hợp IoT | Làm việc với HẢI để thống nhất broker/topic/payload, mã máy và mã lệnh; làm việc với NGHĨA để thống nhất API/trạng thái đơn; chia sẻ đặc tả tích hợp cho nhóm trước khi ghép. |
| Tạo và gửi lệnh DISPENSE | Chỉ phát lệnh sau khi đơn thanh toán thành công; lấy máy/khe từ dữ liệu đơn và dispense plan; gửi lệnh tới đúng simulator và lưu/cho phép tra cứu trạng thái xử lý để giao diện theo dõi. |
| Nhận kết quả và cập nhật đơn | Nhận phản hồi simulator, đối chiếu mã lệnh/đơn/máy/khe rồi gọi nghiệp vụ Backend hiện có để cập nhật kết quả nhả hàng và trạng thái đơn. Không đánh dấu đơn hoàn tất trước khi nhận kết quả thành công hợp lệ. |
| Đảm bảo nhất quán | Phối hợp NGUYÊN rà soát thời điểm cập nhật hoặc hoàn kho theo nghiệp vụ Sprint 2; xử lý phản hồi lặp theo hướng idempotent để không ghi nhận hai lần hoặc làm sai tồn kho. |
| Nối dữ liệu và bàn giao | Dùng dữ liệu máy của HẢI, tồn kho/cảnh báo của NGUYÊN và API quản trị của HUY; kiểm tra dữ liệu cấu hình được lưu bền vững. Ghi hướng dẫn chạy/cấu hình dashboard và kịch bản demo. |

**Đầu ra KIM**

- Giao diện Admin responsive dùng dữ liệu thật để xem tổng quan/chi tiết máy, cấu hình ngưỡng nhiệt độ, quản lý người dùng/role và tra cứu nhật ký theo quyền.
- Backend/Database kết nối được với IoT Simulator; trạng thái đơn và kết quả nhả hàng được theo dõi xuyên suốt.
- Có hướng dẫn chạy/cấu hình dashboard và đặc tả kết nối phục vụ demo.

## 4. Quy ước phối hợp và tích hợp

- Mỗi lệnh nhả hàng có mã lệnh duy nhất và mã đơn; phản hồi phải giữ các mã tương ứng để Backend đối chiếu và xử lý an toàn khi nhận lại bản tin.
- Backend là nguồn dữ liệu chính về giá, đơn hàng, thanh toán, tồn kho và trạng thái cuối cùng. Giao diện và simulator không tự ghi đè các dữ liệu này.
- Chỉ phát lệnh nhả sau khi thanh toán thành công; chỉ đánh dấu nhả thành công sau phản hồi hợp lệ từ simulator.
- HẢI và KIM xác nhận broker/topic/payload trước khi hai phần được tích hợp; không đưa thông tin xác thực vào repository.
- Mỗi thành viên bàn giao phần việc có thể chạy/kiểm tra trong môi trường phát triển, kèm hướng dẫn ngắn và vấn đề còn tồn tại.

## 5. Thứ tự thực hiện và phối hợp

1. Cả nhóm xác nhận Backend, Database, luồng mua hàng và dữ liệu mẫu Sprint 2; ghi nhận lỗi nền còn tồn tại.
2. KIM, HẢI và NGHĨA thống nhất dữ liệu Order/dispense plan/MQTT command/result. NGUYÊN, HUY và KIM thống nhất API/quyền cho Operator. HUY bàn giao hợp đồng API tài khoản/role/nhật ký cho KIM để tích hợp giao diện Admin.
3. HẢI hoàn thiện simulator và bản tin; KIM phát triển Admin dashboard và tích hợp Backend–IoT; NGHĨA và NGUYÊN phát triển giao diện khách hàng/Operator; HUY tập trung hoàn thiện đăng nhập, phân quyền và API quản trị.
4. Tích hợp theo từng luồng nhỏ trong quá trình phát triển: giao diện khách hàng với Order API, giao diện Operator với API máy/tồn kho, Admin dashboard với API của HUY và dữ liệu máy/tồn kho, Backend với simulator.
5. Cả nhóm chạy nghiệm thu luồng đầu cuối tối thiểu; sửa lỗi trực tiếp ngăn cản tiêu chí hoàn thành và bàn giao các vấn đề cần kiểm thử tiếp ở Sprint 4.

## 6. Các luồng cần chạy được

### Luồng khách hàng và máy bán hàng

1. Khách hàng xem sản phẩm, thêm vào giỏ và thanh toán.
2. Backend xác nhận thanh toán thành công và tạo lệnh DISPENSE theo đơn/máy/khe.
3. IoT Simulator nhận lệnh qua MQTT và mô phỏng motor.
4. Simulator gửi event `DISPENSE_SUCCESS` hoặc `DISPENSE_FAILED`.
5. Backend cập nhật trạng thái đơn và dữ liệu liên quan.
6. Giao diện khách hàng hiển thị kết quả do Backend cung cấp.

### Luồng nhân viên hiện trường

1. Operator đăng nhập và xem máy, trạng thái, khe, tồn kho.
2. Operator theo dõi cảnh báo tồn kho/trạng thái máy.
3. Operator ghi nhận bổ sung hàng hoặc xử lý cảnh báo được cấp quyền.
4. Backend cập nhật tồn kho/trạng thái và lưu nhật ký.
5. Giao diện hiển thị dữ liệu mới.

### Luồng Admin

1. Admin đăng nhập; Backend xác thực và cấp quyền phù hợp.
2. Admin xem dashboard, trạng thái máy, telemetry, tồn kho và cảnh báo do Backend cung cấp.
3. Admin quản lý tài khoản/role, cấu hình ngưỡng cảnh báo và tra cứu nhật ký.
4. Backend kiểm tra quyền, lưu thay đổi và trả dữ liệu để giao diện cập nhật.

## 7. Tiêu chí hoàn thành Sprint

- Giao diện khách hàng dùng API Sprint 2, thực hiện được luồng mua hàng và hiển thị trạng thái nhả hàng từ Backend.
- Đơn đã thanh toán thành công tạo đúng lệnh nhả cho đúng máy/khe; simulator có thể trả về kết quả thành công và thất bại.
- Backend nhận kết quả tương ứng và cập nhật trạng thái đơn; bản tin kết quả gửi lặp không làm cập nhật trạng thái hoặc tồn kho nhiều lần.
- Operator đăng nhập, xem được dữ liệu máy/tồn kho/cảnh báo và ghi nhận bổ sung hàng; thay đổi được Backend xác nhận và có nhật ký người thực hiện.
- KIM bàn giao Admin dashboard dùng API thật để xem dữ liệu vận hành, cấu hình ngưỡng nhiệt độ, quản lý tài khoản/role và tra cứu nhật ký.
- HUY bàn giao đăng nhập, phân quyền và API quản trị; Operator không truy cập được chức năng chỉ dành cho Admin, thao tác quản trị được ghi nhận đúng người thực hiện.
- API hiện trường từ chối người chưa đăng nhập/không đủ quyền; dữ liệu bổ sung không hợp lệ không làm thay đổi dữ liệu.
- Các phần được bàn giao kèm hướng dẫn chạy/cấu hình và danh sách vấn đề còn lại; các trường hợp lỗi mở rộng được ghi nhận cho Sprint 4.

## 8. Kết quả cuối Sprint

Một giao dịch đã thanh toán có thể kích hoạt quá trình nhả hàng mô phỏng và hiển thị kết quả trên giao diện khách hàng. Operator có giao diện riêng để theo dõi máy/tồn kho/cảnh báo và ghi nhận bổ sung hàng. KIM bàn giao dashboard Admin dùng dữ liệu Backend; HUY bàn giao đăng nhập, phân quyền và API quản trị để Admin quản lý tài khoản/role, cấu hình ngưỡng cảnh báo và tra cứu nhật ký an toàn.
