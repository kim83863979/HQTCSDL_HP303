-- FreshVend demo catalog for VM001, exported from the local demo database.
-- Run after schema migrations and the 50-slot provisioning migration.
-- Safe to run again: existing inventory quantities are preserved.
-- If a target slot is occupied by another product, the transaction stops.
BEGIN;

INSERT INTO public.categories (category_name, description) VALUES
  ('Trái cây ăn liền', 'Trái cây rửa sạch, cắt sẵn và đóng hộp, dùng ngay.'),
  ('Trái cây nguyên quả', 'Trái cây tươi nguyên quả như chuối, cam và quýt.'),
  ('Trái cây mix', 'Hộp trái cây phối hợp 3 hoặc 5 loại, sơ chế và dùng ngay.'),
  ('Nước ép', 'Nước ép trái cây đóng hộp, chai và lon dùng lạnh.')
ON CONFLICT (category_name) DO UPDATE SET description = EXCLUDED.description;

-- Reuse products from the original English demo catalog where present.
UPDATE public.products p SET product_name='Táo' WHERE p.product_name='Apple' AND NOT EXISTS (SELECT 1 FROM public.products WHERE product_name='Táo') AND EXISTS (SELECT 1 FROM public.inventories i JOIN public.machine_slots s ON s.slot_id=i.slot_id JOIN public.machines m ON m.machine_id=s.machine_id WHERE i.product_id=p.product_id AND m.machine_code='VM001' AND s.slot_code='A01');
UPDATE public.products p SET product_name='Cam' WHERE p.product_name='Orange' AND NOT EXISTS (SELECT 1 FROM public.products WHERE product_name='Cam') AND EXISTS (SELECT 1 FROM public.inventories i JOIN public.machine_slots s ON s.slot_id=i.slot_id JOIN public.machines m ON m.machine_id=s.machine_id WHERE i.product_id=p.product_id AND m.machine_code='VM001' AND s.slot_code='A02');
UPDATE public.products p SET product_name='Chuối' WHERE p.product_name='Banana' AND NOT EXISTS (SELECT 1 FROM public.products WHERE product_name='Chuối') AND EXISTS (SELECT 1 FROM public.inventories i JOIN public.machine_slots s ON s.slot_id=i.slot_id JOIN public.machines m ON m.machine_id=s.machine_id WHERE i.product_id=p.product_id AND m.machine_code='VM001' AND s.slot_code='A03');

INSERT INTO public.products (category_id,product_name,description,unit_price,status) VALUES
  ((SELECT category_id FROM public.categories WHERE category_name='Trái cây ăn liền'), 'Táo', 'Táo tươi rửa sạch, cắt miếng và đóng hộp ăn liền.', 25000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Trái cây nguyên quả'), 'Cam', 'Cam tươi nguyên quả, mọng nước.', 20000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Trái cây nguyên quả'), 'Chuối', 'Chuối tươi nguyên quả, chọn lọc mỗi ngày.', 15000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Trái cây ăn liền'), 'Lê', 'Lê tươi rửa sạch, cắt miếng và đóng hộp ăn liền.', 25000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Trái cây ăn liền'), 'Ổi', 'Ổi tươi rửa sạch, cắt miếng và đóng hộp ăn liền.', 20000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Trái cây mix'), 'Mix 3 loại trái cây', 'Hộp mix táo, lê và ổi đã sơ chế, dùng ngay.', 35000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Trái cây mix'), 'Mix 5 loại trái cây', 'Hộp mix táo, lê, ổi, cam và quýt đã sơ chế, dùng ngay.', 45000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Trái cây nguyên quả'), 'Quýt', 'Quýt tươi nguyên quả, dễ bóc vỏ.', 20000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Nước ép'), 'Nước ép táo', 'Nước ép táo thơm dịu, đóng hộp 330ml, dùng lạnh ngon hơn.', 30000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Nước ép'), 'Nước ép chanh dây', 'Nước ép chanh dây chua ngọt thanh mát, chai 330ml tiện mang theo.', 32000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Nước ép'), 'Nước ép cam', 'Nước cam ép tươi nguyên chất, đóng hộp 330ml, vị cam tự nhiên.', 35000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Nước ép'), 'Nước ép xoài', 'Nước ép xoài chín vàng thơm ngọt, chai 330ml dùng lạnh.', 35000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Nước ép'), 'Nước ép dưa hấu', 'Nước ép dưa hấu đỏ thanh mát, lon 330ml, dùng lạnh ngon hơn.', 30000.00, 'ACTIVE'),
  ((SELECT category_id FROM public.categories WHERE category_name='Trái cây ăn liền'), 'Dưa hấu', 'Dưa hấu đỏ mọng nước cắt miếng, đóng hộp ăn liền.', 25000.00, 'ACTIVE')
ON CONFLICT (product_name) DO UPDATE SET category_id=EXCLUDED.category_id,description=EXCLUDED.description,unit_price=EXCLUDED.unit_price,status=EXCLUDED.status;

DO $$
DECLARE v_slot uuid; v_product uuid; v_existing uuid; v_capacity integer; v_code text; v_name text; v_quantity integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.machines WHERE machine_code='VM001') THEN RAISE EXCEPTION 'Seed requires machine VM001'; END IF;
  FOR v_code,v_name,v_quantity IN SELECT * FROM (VALUES
    ('A01', 'Táo', 10),
    ('A02', 'Cam', 8),
    ('A03', 'Chuối', 14),
    ('A04', 'Lê', 5),
    ('A05', 'Ổi', 5),
    ('A06', 'Mix 3 loại trái cây', 5),
    ('A07', 'Mix 5 loại trái cây', 5),
    ('A08', 'Quýt', 5),
    ('A09', 'Nước ép táo', 5),
    ('A10', 'Nước ép chanh dây', 5),
    ('A11', 'Nước ép cam', 5),
    ('A12', 'Nước ép xoài', 5),
    ('A13', 'Nước ép dưa hấu', 5),
    ('A14', 'Dưa hấu', 5)
  ) AS items(slot_code,product_name,initial_quantity) LOOP
    SELECT s.slot_id,s.capacity INTO v_slot,v_capacity FROM public.machine_slots s JOIN public.machines m ON m.machine_id=s.machine_id WHERE m.machine_code='VM001' AND s.slot_code=v_code;
    IF v_slot IS NULL THEN RAISE EXCEPTION 'Missing VM001 slot %; run slot provisioning migration first',v_code; END IF;
    IF v_quantity>v_capacity THEN RAISE EXCEPTION 'Initial quantity exceeds capacity in %',v_code; END IF;
    SELECT product_id INTO v_product FROM public.products WHERE product_name=v_name;
    SELECT product_id INTO v_existing FROM public.inventories WHERE slot_id=v_slot;
    IF v_existing IS NOT NULL AND v_existing<>v_product THEN RAISE EXCEPTION 'VM001 slot % already holds another product',v_code; END IF;
    IF v_existing IS NULL THEN INSERT INTO public.inventories(slot_id,product_id,quantity) VALUES(v_slot,v_product,v_quantity); END IF;
  END LOOP;
END $$;

COMMIT;
