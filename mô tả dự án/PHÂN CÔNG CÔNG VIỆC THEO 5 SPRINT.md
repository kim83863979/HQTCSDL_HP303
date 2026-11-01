**Sprint 1 — Xây dựng nền tảng hệ thống**

Thời gian: Tuần 1

Mục tiêu

Xây dựng nền tảng ban đầu của FreshVend: cơ sở dữ liệu, Backend, đăng nhập và khung các chức năng chính.

Phân công

| Thành viên | Công việc |
| ----- | ----- |
| KIM | Thiết kế và hoàn thiện Database; tạo PostgreSQL; tạo bảng và quan hệ; thiết lập Backend ban đầu |
| NGHĨA | Xây dựng bảng sản phẩm, danh mục; tạo Product API cơ bản |
| NGUYÊN | Xây dựng bảng tồn kho, khe máy; tạo Inventory API cơ bản |
| HẢI | Xây dựng bảng máy, khe máy; thiết kế cấu trúc IoT Simulator |
| HUY | Xây dựng User, Role; chức năng đăng nhập và phân quyền cơ bản |

 

Kết quả cuối Sprint

Database

   ↓

Backend

   ↓

API cơ bản

   ↓

Đăng nhập

   ↓

Các module chính đã có khung

Sau Sprint 1 phải chạy được

* Backend chạy được.  
* PostgreSQL kết nối được.  
* Các bảng chính đã tạo.  
* Đăng nhập cơ bản hoạt động.  
* Các module chính có cấu trúc ban đầu.

---

**Sprint 2 — Xây dựng chức năng mua hàng**

Thời gian: Tuần 2

Mục tiêu

Cho phép khách hàng xem sản phẩm, chọn sản phẩm, tạo đơn hàng và thanh toán.

Phân công

| Thành viên | Công việc |
| :---- | :---- |
| NGHĨA | Product API, Order API, Order Item, Payment API |
| NGUYÊN | Quản lý tồn kho; trừ tồn kho khi tạo đơn |
| HẢI | Quản lý máy và khe máy; chuẩn bị dữ liệu máy cho việc nhả hàng |
| HUY | Kiểm tra đăng nhập, phân quyền và kiểm tra dữ liệu đầu vào |
| KIM | Kiểm tra quan hệ Database; kết nối các API; xử lý các vấn đề tích hợp |

 

Luồng cần chạy được

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

Kết quả cuối Sprint

Khách hàng có thể thực hiện một giao dịch cơ bản từ đầu đến cuối.

---

**Sprint 3 — Xây dựng IoT\_Simulator và chức năng nhân viên hiện trường**

Thời gian: Tuần 3

Đây là Sprint rất quan trọng vì bắt đầu thể hiện đúng bản chất Smart Vending Machine.

Mục tiêu

Kết nối đơn hàng với máy bán hàng mô phỏng và xây dựng giao diện cho nhân viên hiện trường theo dõi, bổ sung hàng và xử lý cảnh báo.

Phân công

| Thành viên | Công việc |
| ----- | ----- |
| NGHĨA | Hoàn thiện giao diện máy bán hàng; hiển thị sản phẩm, giỏ hàng và thanh toán |
| NGUYÊN | Giao diện nhân viên hiện trường: tồn kho, bổ sung hàng, cảnh báo, trạng thái máy |
| HẢI | Xây dựng IoT Simulator; MQTT; mô phỏng motor; mô phỏng quá trình nhả hàng |
| HUY | Đăng nhập cho Admin/Operator; phân quyền; nhật ký thao tác |
| KIM | Kết nối Backend ↔ Database ↔ IoT Simulator; kiểm tra luồng dữ liệu |

 

 

 

Luồng quan trọng nhất

Khách hàng mua hàng

    	↓

	Tạo đơn hàng

    	↓

  	Backend

    	↓

  Gửi lệnh DISPENSE

    	↓

   IoT Simulator

    	↓

   Motor mô phỏng

    	↓

	Nhả sản phẩm

    	↓

DISPENSE\_SUCCESS

    	↓

  	Backend

    	↓

Hoàn thành đơn hàng

Đồng thời nhân viên hiện trường có thể:

Đăng nhập

   ↓

Xem máy

   ↓

Xem tồn kho

   ↓

Xem cảnh báo

   ↓

Bổ sung hàng

   ↓

Theo dõi trạng thái máy

Kết quả cuối Sprint

Một đơn hàng có thể kích hoạt quá trình nhả hàng trên IoT Simulator và nhân viên hiện trường có thể theo dõi máy.

---

**Sprint 4 — Tích hợp toàn hệ thống và xử lý lỗi**

Thời gian: Tuần 4

Mục tiêu

Ghép toàn bộ các phần lại thành một hệ thống FreshVend thống nhất và xử lý các tình huống lỗi.

Sprint này không nên tiếp tục chỉ làm từng module riêng.

Cả nhóm tập trung vào tích hợp và kiểm thử luồng thực tế.

Phân công

| Thành viên | Trọng tâm |
| ----- | ----- |
| NGHĨA | Kiểm tra toàn bộ luồng khách hàng và máy bán hàng |
| NGUYÊN | Kiểm tra chức năng nhân viên hiện trường, tồn kho, bổ sung hàng |
| HẢI | Kiểm tra IoT, MQTT, trạng thái máy và các lỗi thiết bị |
| HUY | Kiểm thử đăng nhập, phân quyền, nhật ký và các trường hợp lỗi |
| KIM | Tích hợp toàn hệ thống, kiểm tra Database/API và xử lý lỗi kết nối |

 

Các tình huống phải kiểm thử

1\. Mua hàng thành công

    	↓

   Nhả hàng thành công

 

2\. Motor bị lỗi

    	↓

   Nhả hàng thất bại

    	↓

   Hiển thị cảnh báo

 

3\. Máy mất kết nối

    	↓

   Machine Offline

 

4\. Nhiệt độ quá cao

    	↓

   Cảnh báo nhiệt độ

 

5\. Sản phẩm sắp hết

    	↓

   Cảnh báo tồn kho thấp

 

6\. Nhân viên bổ sung hàng

    	↓

   Tồn kho được cập nhật

Các chức năng về lỗi nhả hàng, trạng thái máy, nhiệt độ, tồn kho và cảnh báo đều phù hợp với phạm vi yêu cầu của đề tài. MÔ TẢ ĐỀ TÀI

Kết quả cuối Sprint

Toàn bộ các thành phần chính của FreshVend có thể hoạt động cùng nhau.

---

**Sprint 5 — Kiểm thử, đóng gói và hoàn thiện**

Thời gian: Tuần 5

Mục tiêu

Hoàn thiện sản phẩm, sửa lỗi, đóng gói hệ thống và chuẩn bị Demo cuối.

Phân công

Ở Sprint này không nên giữ cứng "mỗi người chỉ làm module của mình".

Cả nhóm cùng tham gia.

| Thành viên | Trách nhiệm chính |
| ----- | ----- |
| KIM | Kiểm tra toàn bộ hệ thống, Database, Docker, triển khai |
| NGHĨA | Kiểm thử giao diện và luồng mua hàng |
| NGUYÊN | Kiểm thử giao diện nhân viên hiện trường và tồn kho |
| HẢI | Kiểm thử IoT Simulator và các tình huống lỗi máy |
| HUY | Kiểm thử hệ thống, phân quyền, nhật ký và tổng hợp lỗi |

Công việc

Kiểm thử

   ↓

Phát hiện lỗi

   ↓

Sửa lỗi

   ↓

Kiểm thử lại

   ↓

Docker

   ↓

Triển khai

   ↓

Hoàn thiện tài liệu

   ↓

Chuẩn bị Demo

Đề tài yêu cầu cả báo cáo kiểm thử, hướng dẫn cài đặt/sử dụng và Docker packages, nên Sprint 5 nên dành riêng thời gian cho các phần này. 

---

 

**Tổng hợp 5 Sprint**

| Sprint | Mục tiêu chính | Sản phẩm đạt được |
| :---- | :---- | :---- |
| Sprint 1 | Nền tảng hệ thống | Database \+ Backend \+ Login |
| Sprint 2 | Mua hàng | Product → Cart → Order → Payment |
| Sprint 3 | IoT \+ Nhân viên hiện trường | Dispense \+ IoT Simulator \+ Operator |
| Sprint 4 | Tích hợp \+ xử lý lỗi | Toàn hệ thống hoạt động cùng nhau |
| Sprint 5 | Hoàn thiện \+ triển khai | Testing \+ Docker \+ Demo |

 

