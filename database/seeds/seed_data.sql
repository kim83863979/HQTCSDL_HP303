-- ==============================================================================
-- SEED DATA SCRIPT FOR FRESHVEND PLATFORM
-- RDBMS: PostgreSQL 14+
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. SEED ROLES
-- ------------------------------------------------------------------------------
INSERT INTO roles (role_id, name)
VALUES 
    (gen_random_uuid(), 'ADMIN'),
    (gen_random_uuid(), 'OPERATOR')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. SEED PERMISSIONS
-- ------------------------------------------------------------------------------
INSERT INTO permissions (permission_id, name)
VALUES 
    (gen_random_uuid(), 'MANAGE_USER'),
    (gen_random_uuid(), 'MANAGE_PRODUCT'),
    (gen_random_uuid(), 'MANAGE_INVENTORY'),
    (gen_random_uuid(), 'VIEW_MACHINE'),
    (gen_random_uuid(), 'MANAGE_ALERT'),
    (gen_random_uuid(), 'VIEW_REPORT')
ON CONFLICT (name) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 3. SEED ROLE_PERMISSIONS
--    - ADMIN: Toàn bộ quyền
--    - OPERATOR: MANAGE_INVENTORY, VIEW_MACHINE, MANAGE_ALERT, VIEW_REPORT
-- ------------------------------------------------------------------------------
-- Cấp toàn quyền cho ADMIN
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Cấp quyền vận hành cho OPERATOR
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM roles r
JOIN permissions p ON p.name IN ('MANAGE_INVENTORY', 'VIEW_MACHINE', 'MANAGE_ALERT', 'VIEW_REPORT')
WHERE r.name = 'OPERATOR'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 4. SEED USERS
-- (password_hash mẫu cho mật khẩu: "Password@123")
-- ------------------------------------------------------------------------------
INSERT INTO users (user_id, role_id, email, fullname, password_hash)
VALUES 
    (
        gen_random_uuid(),
        (SELECT role_id FROM roles WHERE name = 'ADMIN'),
        'admin@freshvend.com',
        'System Administrator',
        '$2b$12$eA8bZ3y9Y9mY0mJk3pZzYeOQvR1tX2b8v.uV6r5aZ1kP5c7hD4p2m'
    ),
    (
        gen_random_uuid(),
        (SELECT role_id FROM roles WHERE name = 'OPERATOR'),
        'operator@freshvend.com',
        'Field Operator Huy',
        '$2b$12$eA8bZ3y9Y9mY0mJk3pZzYeOQvR1tX2b8v.uV6r5aZ1kP5c7hD4p2m'
    )
ON CONFLICT (email) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. SEED AUDIT LOGS
-- ------------------------------------------------------------------------------
INSERT INTO audit_logs (audit_log_id, user_id, action, created_at)
VALUES 
    (
        gen_random_uuid(),
        (SELECT user_id FROM users WHERE email = 'admin@freshvend.com'),
        'SYSTEM_INITIALIZE_SEED_DATA',
        CURRENT_TIMESTAMP - INTERVAL '2 hours'
    );

-- ------------------------------------------------------------------------------
-- 6. SEED CATEGORIES
-- ------------------------------------------------------------------------------
INSERT INTO categories (category_id, category_name, description)
VALUES 
    (gen_random_uuid(), 'Fruit', 'Trái cây tươi chọn lọc hàng ngày'),
    (gen_random_uuid(), 'Juice', 'Nước ép trái cây nguyên chất đóng chai'),
    (gen_random_uuid(), 'Fresh Food', 'Thực phẩm sạch chế biến sẵn bảo quản mát')
ON CONFLICT (category_name) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 7. SEED PRODUCTS
-- ------------------------------------------------------------------------------
INSERT INTO products (product_id, category_id, product_name, description, unit_price, status)
VALUES 
    (
        gen_random_uuid(),
        (SELECT category_id FROM categories WHERE category_name = 'Fruit'),
        'Apple',
        'Táo Envy New Zealand nhập khẩu bảo quản lạnh',
        25000.00,
        'ACTIVE'
    ),
    (
        gen_random_uuid(),
        (SELECT category_id FROM categories WHERE category_name = 'Fruit'),
        'Orange',
        'Cam sành mọng nước bổ sung Vitamin C',
        20000.00,
        'ACTIVE'
    ),
    (
        gen_random_uuid(),
        (SELECT category_id FROM categories WHERE category_name = 'Fruit'),
        'Banana',
        'Chuối ngự Laba sấy lạnh đóng gói',
        15000.00,
        'ACTIVE'
    ),
    (
        gen_random_uuid(),
        (SELECT category_id FROM categories WHERE category_name = 'Juice'),
        'Cold-pressed Orange Juice',
        'Nước cam ép tươi nguyên chất chai 330ml',
        35000.00,
        'ACTIVE'
    )
ON CONFLICT (product_name) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 8. SEED MACHINES
-- ------------------------------------------------------------------------------
INSERT INTO machines (
    machine_id, machine_code, machine_name, location_name, address, 
    lifecycle_status, min_temperature, max_temperature, alert_delay_minutes
)
VALUES (
    gen_random_uuid(),
    'VM001',
    'FreshVend Landmark 81',
    'Tầng 1 Sảnh B - Tòa Landmark 81',
    '720A Điện Biên Phủ, Phường 22, Bình Thạnh, TP.HCM',
    'ACTIVE',
    2.0,
    8.0,
    5
)
ON CONFLICT (machine_code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 9. SEED MACHINE STATUSES (1:1 với VM001)
-- ------------------------------------------------------------------------------
INSERT INTO machine_statuses (
    machine_status_id, machine_id, connection_status, operation_status, 
    health_status, door_status, last_temperature, last_humidity, 
    last_error_code, last_seen_at
)
VALUES (
    gen_random_uuid(),
    (SELECT machine_id FROM machines WHERE machine_code = 'VM001'),
    'ONLINE',
    'IDLE',
    'NORMAL',
    'CLOSED',
    4.5,
    65.0,
    NULL,
    CURRENT_TIMESTAMP
)
ON CONFLICT (machine_id) DO UPDATE 
SET last_seen_at = CURRENT_TIMESTAMP, connection_status = 'ONLINE';

-- ------------------------------------------------------------------------------
-- 10. SEED MACHINE SLOTS (A01, A02, A03, A04)
-- ------------------------------------------------------------------------------
INSERT INTO machine_slots (slot_id, machine_id, slot_code, capacity, status)
VALUES 
    (gen_random_uuid(), (SELECT machine_id FROM machines WHERE machine_code = 'VM001'), 'A01', 20, 'ACTIVE'),
    (gen_random_uuid(), (SELECT machine_id FROM machines WHERE machine_code = 'VM001'), 'A02', 20, 'ACTIVE'),
    (gen_random_uuid(), (SELECT machine_id FROM machines WHERE machine_code = 'VM001'), 'A03', 20, 'ACTIVE'),
    (gen_random_uuid(), (SELECT machine_id FROM machines WHERE machine_code = 'VM001'), 'A04', 15, 'ACTIVE')
ON CONFLICT (machine_id, slot_code) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 11. SEED INVENTORIES
--    - A01 → Apple → 10
--    - A02 → Orange → 8
--    - A03 → Banana → 15
--    - A04 → (Tạm thời để trống hoặc trữ 0)
-- ------------------------------------------------------------------------------
INSERT INTO inventories (inventory_id, slot_id, product_id, quantity)
VALUES 
    (
        gen_random_uuid(),
        (SELECT slot_id FROM machine_slots WHERE machine_id = (SELECT machine_id FROM machines WHERE machine_code = 'VM001') AND slot_code = 'A01'),
        (SELECT product_id FROM products WHERE product_name = 'Apple'),
        10
    ),
    (
        gen_random_uuid(),
        (SELECT slot_id FROM machine_slots WHERE machine_id = (SELECT machine_id FROM machines WHERE machine_code = 'VM001') AND slot_code = 'A02'),
        (SELECT product_id FROM products WHERE product_name = 'Orange'),
        8
    ),
    (
        gen_random_uuid(),
        (SELECT slot_id FROM machine_slots WHERE machine_id = (SELECT machine_id FROM machines WHERE machine_code = 'VM001') AND slot_code = 'A03'),
        (SELECT product_id FROM products WHERE product_name = 'Banana'),
        15
    )
ON CONFLICT (slot_id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 12. SEED RESTOCK EVENTS
-- ------------------------------------------------------------------------------
INSERT INTO restock_events (restock_event_id, machine_id, user_id, restock_date, notes)
VALUES (
    gen_random_uuid(),
    (SELECT machine_id FROM machines WHERE machine_code = 'VM001'),
    (SELECT user_id FROM users WHERE email = 'operator@freshvend.com'),
    CURRENT_TIMESTAMP - INTERVAL '1 day',
    'Nạp đầy đủ hàng ban đầu cho các khay A01, A02, A03'
);

-- ------------------------------------------------------------------------------
-- 13. SEED ORDERS, ORDER_ITEMS & PAYMENTS (Giao dịch mẫu đã thành công)
-- ------------------------------------------------------------------------------
DO $$
DECLARE
    v_order_id UUID := gen_random_uuid();
    v_machine_id UUID;
    v_prod_apple_id UUID;
    v_prod_banana_id UUID;
BEGIN
    SELECT machine_id INTO v_machine_id FROM machines WHERE machine_code = 'VM001';
    SELECT product_id INTO v_prod_apple_id FROM products WHERE product_name = 'Apple';
    SELECT product_id INTO v_prod_banana_id FROM products WHERE product_name = 'Banana';

    -- 13.1 Tạo Order
    INSERT INTO orders (order_id, machine_id, order_status, total_amount, created_at)
    VALUES (v_order_id, v_machine_id, 'COMPLETED', 40000.00, CURRENT_TIMESTAMP - INTERVAL '30 minutes');

    -- 13.2 Tạo Order Items (1 Apple = 25k, 1 Banana = 15k)
    INSERT INTO order_items (order_item_id, order_id, product_id, quantity, unit_price, subtotal)
    VALUES 
        (gen_random_uuid(), v_order_id, v_prod_apple_id, 1, 25000.00, 25000.00),
        (gen_random_uuid(), v_order_id, v_prod_banana_id, 1, 15000.00, 15000.00);

    -- 13.3 Tạo Payment qua mã QR
    INSERT INTO payments (
        payment_id, order_id, payment_method, payment_status, 
        amount, transaction_reference, paid_at, created_at
    )
    VALUES (
        gen_random_uuid(),
        v_order_id,
        'QR',
        'SUCCESS',
        40000.00,
        'VNPAY_REF_20261031_0001',
        CURRENT_TIMESTAMP - INTERVAL '29 minutes',
        CURRENT_TIMESTAMP - INTERVAL '30 minutes'
    );
END $$;

-- ------------------------------------------------------------------------------
-- 14. SEED COLD CHAIN LOGS (Chuỗi nhiệt độ mẫu)
-- ------------------------------------------------------------------------------
INSERT INTO temperature_logs (
    temperature_log_id, machine_id, temperature, humidity, 
    sensor_status, is_out_of_range, recorded_at, received_at
)
VALUES 
    (
        gen_random_uuid(),
        (SELECT machine_id FROM machines WHERE machine_code = 'VM001'),
        4.2, 64.5, 'OK', FALSE,
        CURRENT_TIMESTAMP - INTERVAL '15 minutes',
        CURRENT_TIMESTAMP - INTERVAL '15 minutes'
    ),
    (
        gen_random_uuid(),
        (SELECT machine_id FROM machines WHERE machine_code = 'VM001'),
        4.5, 65.0, 'OK', FALSE,
        CURRENT_TIMESTAMP - INTERVAL '5 minutes',
        CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    );

-- ------------------------------------------------------------------------------
-- 15. SEED MACHINE EVENTS (IoT Telemetry Event mẫu)
-- ------------------------------------------------------------------------------
INSERT INTO machine_events (
    machine_event_id, machine_id, order_id, slot_id, event_type, 
    severity, event_status, retry_quantity, error_code, error_message, 
    idempotency_key, payload, occurred_at, created_at
)
VALUES (
    gen_random_uuid(),
    (SELECT machine_id FROM machines WHERE machine_code = 'VM001'),
    NULL,
    (SELECT slot_id FROM machine_slots WHERE machine_id = (SELECT machine_id FROM machines WHERE machine_code = 'VM001') AND slot_code = 'A01'),
    'DISPENSE_SUCCESS',
    'INFO',
    'PROCESSED',
    0,
    NULL,
    NULL,
    'IDEM_EVT_VM001_A01_20261031220000',
    '{"motor_step": 360, "sensor_drop_detected": true, "duration_ms": 1420}'::jsonb,
    CURRENT_TIMESTAMP - INTERVAL '30 minutes',
    CURRENT_TIMESTAMP - INTERVAL '30 minutes'
)
ON CONFLICT (idempotency_key) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 16. SEED ALERTS
-- ------------------------------------------------------------------------------
INSERT INTO alerts (alert_id, machine_id, alert_type, message, status, created_at)
VALUES (
    gen_random_uuid(),
    (SELECT machine_id FROM machines WHERE machine_code = 'VM001'),
    'LOW_STOCK_WARNING',
    'Khay A02 (Orange) chỉ còn 8 sản phẩm. Khuyến nghị chuẩn bị restock.',
    'OPEN',
    CURRENT_TIMESTAMP - INTERVAL '10 minutes'
);

COMMIT;