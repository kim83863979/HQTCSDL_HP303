# SPRINT 2 — XÂY DỰNG CHỨC NĂNG MUA HÀNG

**Thời gian:** Tuần 2

## 1. Mục tiêu

Hoàn thiện luồng mua hàng cơ bản: khách hàng xem sản phẩm, chọn sản phẩm, tạo đơn hàng, thanh toán và nhận được trạng thái đơn hàng chính xác.

## 2. Đầu vào Sprint

- HUY hoàn tất nhiệm vụ kiểm thử các API đã có của Sprint 1 và bàn giao các lỗi cần xử lý trước khi nhóm tích hợp luồng mua hàng.
- Database, Backend và chức năng đăng nhập cơ bản chạy được.
- Các thành viên thống nhất cấu trúc dữ liệu sản phẩm, đơn hàng, chi tiết đơn hàng, thanh toán, tồn kho và khe máy trước khi tích hợp.

## 3. Phân công chi tiết

### NGHĨA

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Product API | Hoàn thiện API lấy danh sách và chi tiết sản phẩm có thể bán; kiểm tra dữ liệu trả về phù hợp để khách hàng chọn mua. |
| Order API và Order Item | Xây dựng API tạo và tra cứu đơn hàng; lưu các sản phẩm, số lượng và giá tại thời điểm đặt hàng; tính tổng tiền chính xác. |
| Payment API | Xây dựng API thanh toán theo cơ chế thanh toán của dự án; cập nhật trạng thái thanh toán và đơn hàng theo kết quả thanh toán. |
| Phối hợp nghiệp vụ mua hàng | Thống nhất với NGUYÊN việc kiểm tra/giữ hàng và thời điểm trừ tồn kho; thống nhất với HẢI thông tin máy/khe gắn với sản phẩm để phục vụ Sprint 3. |

### NGUYÊN

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Kiểm tra tồn kho | Cung cấp số lượng khả dụng theo sản phẩm/khe; kiểm tra đủ hàng trước khi đơn được xác nhận. |
| Giữ hàng và tránh bán vượt tồn | Phối hợp với NGHĨA thống nhất thời điểm giữ hàng; bảo đảm nhiều đơn không làm số lượng bán vượt tồn kho thực tế. |
| Cập nhật tồn kho | Cập nhật tồn kho khi thanh toán thành công theo luồng đã thống nhất; bảo đảm không trừ lặp và tồn kho không âm. |
| Xử lý thanh toán thất bại hoặc hủy đơn | Giải phóng số lượng đã giữ nếu thanh toán thất bại hoặc đơn bị hủy trước khi xác nhận; bảo đảm tồn kho được khôi phục chính xác. |

### HẢI

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Kiểm tra dữ liệu máy và khe | Kiểm tra quan hệ máy–khe–sản phẩm, tình trạng khe và tính nhất quán với dữ liệu tồn kho. |
| Chuẩn bị dữ liệu máy/khe cho đơn hàng | Bảo đảm có thể xác định máy và khe liên quan đến từng sản phẩm trong đơn hàng; phối hợp với NGHĨA và KIM thống nhất dữ liệu Order API cần lưu hoặc truy xuất. |
| Chuẩn bị cho Sprint 3 | Đảm bảo thông tin máy/khe sẵn sàng để Sprint 3 sử dụng khi gửi lệnh nhả hàng. Sprint này chưa bao gồm hoàn thiện IoT Simulator hay mô phỏng motor. |

### HUY

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Kiểm thử API Sprint 1 | Thực hiện và hoàn tất kiểm thử các API đã có của Sprint 1; ghi nhận kết quả và bàn giao danh sách lỗi cho nhóm. |
| Kiểm tra đăng nhập và phân quyền | Kiểm tra yêu cầu đăng nhập và quyền truy cập trên các API mua hàng; xác nhận người dùng không có quyền bị từ chối phù hợp. |
| Kiểm tra dữ liệu đầu vào | Rà soát và kiểm thử các trường hợp dữ liệu hợp lệ/không hợp lệ như mã sản phẩm, số lượng và thông tin thanh toán; phối hợp bổ sung hoặc sửa validation. |
| Ghi nhận và kiểm thử lại lỗi | Mô tả rõ bước tái hiện và kết quả mong đợi; kiểm thử lại sau khi nhóm sửa lỗi. |

### KIM

| Công việc chính | Chi tiết công việc |
| :--- | :--- |
| Rà soát Database | Kiểm tra khóa, quan hệ và ràng buộc giữa sản phẩm, đơn hàng, Order Item, thanh toán, tồn kho, máy và khe. |
| Cập nhật schema/migration | Hỗ trợ cập nhật cấu trúc Database hoặc migration nếu phát hiện thiếu bảng, cột, khóa hay ràng buộc cần thiết cho luồng mua hàng. |
| Tích hợp API và module | Kết nối các API sản phẩm, đơn hàng, thanh toán và tồn kho; xử lý lỗi phát sinh khi các module làm việc cùng nhau. |
| Kiểm thử luồng đầu cuối | Xác nhận Backend và Database sẵn sàng; điều phối kiểm thử luồng mua hàng từ đầu đến cuối, theo dõi lỗi tích hợp và phối hợp xử lý. |

## 4. Thứ tự thực hiện và phối hợp

1. HUY hoàn tất kiểm thử API Sprint 1; KIM xác nhận Backend và Database sẵn sàng cho tích hợp.
2. KIM, NGHĨA, NGUYÊN và HẢI thống nhất dữ liệu đầu vào/đầu ra giữa đơn hàng, thanh toán, tồn kho và máy/khe.
3. NGHĨA xây dựng luồng sản phẩm → đơn hàng/Order Item → thanh toán; NGUYÊN cung cấp nghiệp vụ kiểm tra và cập nhật tồn kho; HẢI chuẩn bị dữ liệu máy/khe liên quan.
4. HUY kiểm thử xác thực, phân quyền và dữ liệu đầu vào; KIM tích hợp các module và phối hợp cả nhóm kiểm thử từ đầu đến cuối.
5. Cả nhóm sửa lỗi, chạy lại các trường hợp lỗi và xác nhận tiêu chí hoàn thành Sprint.

## 5. Luồng mua hàng cần chạy được

Khách hàng  
↓  
Xem sản phẩm  
↓  
Chọn sản phẩm  
↓  
Giỏ hàng  
↓  
Tạo đơn hàng  
↓  
Thanh toán  
↓  
Trừ tồn kho  
↓  
Đơn hàng được xác nhận

## 6. Kết quả cuối Sprint

Khách hàng có thể thực hiện một giao dịch cơ bản từ đầu đến cuối; đơn hàng chỉ được xác nhận khi thanh toán thành công và tồn kho được cập nhật đúng theo luồng đã thống nhất.

## 7. Tiêu chí hoàn thành

- Lấy được danh sách/chi tiết sản phẩm và không cho đặt sản phẩm không hợp lệ hoặc không đủ hàng.
- Tạo được đơn hàng có Order Item, số lượng, giá và tổng tiền chính xác.
- Thanh toán thành công cập nhật trạng thái đơn hàng và tồn kho đúng một lần.
- Thanh toán thất bại không tạo đơn đã xác nhận; số lượng hàng giữ (nếu có) được giải phóng và tồn kho không bị trừ sai.
- API yêu cầu đăng nhập/quyền phù hợp; dữ liệu sai hoặc thiếu được từ chối với lỗi rõ ràng.
- Các module đã tích hợp và luồng mua hàng đầu cuối được kiểm thử lại sau khi sửa lỗi.
