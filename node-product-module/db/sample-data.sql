-- Du lieu mau cho Sprint 1 (chay sau khi migration tao bang xong).
INSERT INTO categories (category_id, category_name, description) VALUES
 ('11111111-1111-1111-1111-111111111111', 'Trai cay tuoi',      'Trai cay nguyen qua, giu lanh'),
 ('22222222-2222-2222-2222-222222222222', 'Trai cay cat san',   'Trai cay da got va cat san trong hop'),
 ('33333333-3333-3333-3333-333333333333', 'Nuoc ep',            'Nuoc ep trai cay dong chai');

INSERT INTO products (product_id, category_id, product_name, description, unit_price, status) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Tao do',          'Tao do nhap khau, 1 qua',      15000.00, 'ACTIVE'),
 ('aaaaaaaa-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Cam sanh',        'Cam sanh, 1 qua',              12000.00, 'ACTIVE'),
 ('aaaaaaaa-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Chuoi',           'Chuoi tieu, 1 nai nho',        10000.00, 'ACTIVE'),
 ('aaaaaaaa-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 'Dua hau cat san', 'Hop 250g',                     25000.00, 'ACTIVE'),
 ('aaaaaaaa-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Xoai cat san',    'Hop 250g',                     30000.00, 'INACTIVE'),
 ('aaaaaaaa-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'Nuoc ep cam',     'Chai 300ml',                   20000.00, 'ACTIVE');
