# Database migrations

`dump-FreshVend-202611011643.sql` là baseline cũ của PostgreSQL 17. Chỉ import
file này một lần vào database mới/trống trước khi chạy migration; không import
đè lên database đang dùng vì dump tạo lại bảng và dữ liệu mẫu.

Chạy từ thư mục gốc repository:

```powershell
npm --prefix backend run db:migrate:status
npm --prefix backend run db:migrate
npm --prefix backend run db:migrate:status
```

Runner áp dụng các file `YYYYMMDDHHMMSS_mo_ta.sql` theo thứ tự tên file. Runner
tạo `public.schema_migrations`, ghi checksum SHA-256, lưu DDL và phiên bản trong
cùng transaction, đồng thời dùng PostgreSQL advisory lock để tránh hai tiến
trình triển khai cùng chạy migration.

Hai migration hiện có:

1. `20261107010000_order_payment_inventory.sql` — backfill slot cho order item
   cũ, thêm thời hạn đơn hàng và lượng tồn kho đang giữ, cùng các ràng buộc và
   trigger cho vòng đời order/payment/reservation. Migration dừng nếu không thể
   ánh xạ order item cũ tới tồn kho trên đúng máy thay vì tự đoán.
2. `20261107020000_fix_order_source_triggers.sql` — sửa trigger khi đổi trạng
   thái slot/sản phẩm và xử lý payment đang chờ khi order bị hủy hoặc thất bại.

Các migration bổ sung sau đó hỗ trợ API quản trị, dispense MQTT và Guest checkout.
`20261120100000_add_guest_order_access.sql` thêm hash capability token cho đơn
Guest; token rõ chỉ trả về cho Client lúc tạo đơn, không lưu trực tiếp trong DB.

Với database đã chạy thủ công migration đầu, runner kiểm tra đầy đủ schema rồi
ghi nhận migration đó trước khi áp dụng migration thứ hai. Nếu schema chỉ được
áp dụng một phần, runner dừng để tránh tự ý làm sai dữ liệu. Không sửa migration
đã áp dụng; thay đổi tiếp theo phải tạo file version mới.

File
`20261107010000_order_payment_inventory.rollback.sql` chỉ dùng rollback thủ
công; nó từ chối xóa lịch sử reservation hoặc nhiều lần thanh toán. Hãy sao lưu
database trước khi thay đổi schema hoặc rollback.
