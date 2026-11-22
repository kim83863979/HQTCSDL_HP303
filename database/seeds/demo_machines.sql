-- ==============================================================================
-- FreshVend - Demo: thêm 4 máy bán hàng mô phỏng (VM002 .. VM005)
-- ------------------------------------------------------------------------------
-- * Mỗi máy có 50 khe (A01..A50), sức chứa mỗi khe = 20.
-- * VM004 và VM005 là 2 máy dùng để demo tình huống QUÁ NHIỆT (lỗi); phần quá
--   nhiệt do IoT Simulator tạo ra (lệnh `temp`), không nằm trong database.
-- * Chạy lại nhiều lần an toàn (idempotent): không tạo trùng máy/khe/tồn kho.
-- * Chạy SAU khi đã `npm run db:migrate` và TRƯỚC khi bật simulator của các máy mới.
-- ==============================================================================
SET client_encoding = 'UTF8';

BEGIN;

-- 1. Máy bán hàng --------------------------------------------------------------
-- Trigger trg_provision_default_machine_slots (migration 20261121120000) tự tạo
-- 50 khe, capacity 20, ACTIVE ngay khi INSERT máy mới.
INSERT INTO public.machines
    (machine_code, machine_name, location_name, address,
     lifecycle_status, min_temperature, max_temperature, alert_delay_minutes)
VALUES
    ('VM002', 'FreshVend Bitexco',
     'Tầng trệt Sảnh A - Bitexco Financial Tower',
     '2 Hải Triều, Phường Bến Nghé, Quận 1, TP.HCM',
     'ACTIVE', 2.0, 8.0, 5),
    ('VM003', 'FreshVend Vincom Đồng Khởi',
     'Tầng B1 - Vincom Center Đồng Khởi',
     '72 Lê Thánh Tôn, Phường Bến Nghé, Quận 1, TP.HCM',
     'ACTIVE', 2.0, 8.0, 5),
    ('VM004', 'FreshVend Đại học Bách Khoa',
     'Sảnh nhà A4 - Đại học Bách Khoa',
     '268 Lý Thường Kiệt, Phường 14, Quận 10, TP.HCM',
     'ACTIVE', 2.0, 8.0, 5),
    ('VM005', 'FreshVend Sân bay Tân Sơn Nhất',
     'Sảnh chờ ga nội địa - Sân bay Tân Sơn Nhất',
     'Đường Trường Sơn, Phường 2, Quận Tân Bình, TP.HCM',
     'ACTIVE', 2.0, 8.0, 5)
ON CONFLICT (machine_code) DO NOTHING;

-- 2. Bảo đảm đủ 50 khe / sức chứa 20 (phòng khi trigger chưa có) -----------------
INSERT INTO public.machine_slots (machine_id, slot_code, capacity, status)
SELECT m.machine_id, 'A' || LPAD(n::text, 2, '0'), 20, 'ACTIVE'
FROM public.machines m
CROSS JOIN generate_series(1, 50) AS n
WHERE m.machine_code IN ('VM002', 'VM003', 'VM004', 'VM005')
ON CONFLICT (machine_id, slot_code) DO NOTHING;

-- 3. Nạp hàng vào khe ------------------------------------------------------------
-- Mỗi khe 1 sản phẩm ACTIVE (xoay vòng theo tên), số lượng 5..20 (không vượt sức
-- chứa 20 - trigger validate_inventory_capacity sẽ chặn nếu vượt).
WITH prod AS (
    SELECT product_id,
           row_number() OVER (ORDER BY product_name) AS rn,
           count(*)     OVER ()                      AS total
    FROM public.products
    WHERE status = 'ACTIVE'
),
target AS (
    SELECT s.slot_id,
           row_number() OVER (PARTITION BY s.machine_id ORDER BY s.slot_code) AS n
    FROM public.machine_slots s
    JOIN public.machines m ON m.machine_id = s.machine_id
    WHERE m.machine_code IN ('VM002', 'VM003', 'VM004', 'VM005')
)
INSERT INTO public.inventories (slot_id, product_id, quantity)
SELECT t.slot_id, p.product_id, 5 + (t.n * 7) % 16
FROM target t
JOIN prod p ON p.rn = ((t.n - 1) % p.total) + 1
ON CONFLICT DO NOTHING;

COMMIT;

-- 4. Kiểm tra nhanh ----------------------------------------------------------------
SELECT m.machine_code,
       count(DISTINCT s.slot_id)                  AS so_khe,
       min(s.capacity) || '-' || max(s.capacity)  AS suc_chua,
       count(i.inventory_id)                      AS khe_co_hang,
       coalesce(sum(i.quantity), 0)               AS tong_ton_kho
FROM public.machines m
LEFT JOIN public.machine_slots s ON s.machine_id = m.machine_id
LEFT JOIN public.inventories  i ON i.slot_id = s.slot_id
GROUP BY m.machine_code
ORDER BY m.machine_code;
