# Dữ liệu mẫu

Đặt dữ liệu mẫu không nhạy cảm phục vụ chạy và kiểm thử tại đây. Dữ liệu nên đủ
để thử sản phẩm, danh mục, máy, khe, tồn kho và tài khoản/role.

Không đưa mật khẩu thật, token hoặc thông tin cá nhân vào seed. Tài khoản kiểm
thử phải dùng mật khẩu mẫu an toàn và được ghi rõ là chỉ dành cho môi trường
local.

## VM001 demo catalog (Nghia)

After applying schema migrations and provisioning 50 VM001 slots, run `nghia-vm001-products.sql` with PostgreSQL (for example, `psql -U postgres -d freshvend_demo -v ON_ERROR_STOP=1 -f database/seeds/nghia-vm001-products.sql` from the repository root). This seeds four categories and 14 active products in slots A01-A14. Existing stock quantities are preserved when rerun; a slot containing another product causes a clear error instead of replacing its stock. Product photos live in `vending-client/public/products`.
