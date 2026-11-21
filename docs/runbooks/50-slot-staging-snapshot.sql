-- Read-only snapshot for the 50-slot migration.
-- Run once before and once after on the explicitly verified STAGING database.
BEGIN READ ONLY;

SELECT current_database() AS database_name,
       current_user AS database_user,
       inet_server_addr() AS server_address,
       inet_server_port() AS server_port;

SELECT m.machine_id, m.machine_code, m.machine_name
FROM public.machines m
ORDER BY m.machine_code, m.machine_id;

SELECT m.machine_id, m.machine_code, ms.slot_id, ms.slot_code,
       ms.capacity, ms.status AS slot_status,
       i.inventory_id, i.product_id, i.quantity,
       i.reserved_quantity, i.updated_at AS inventory_updated_at
FROM public.machines m
LEFT JOIN public.machine_slots ms USING (machine_id)
LEFT JOIN public.inventories i USING (slot_id)
ORDER BY m.machine_code, ms.slot_code, ms.slot_id;

SELECT conrelid::regclass AS table_name, conname,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace
  AND conname IN ('uq_machine_slot', 'uq_order_product')
ORDER BY conname;

SELECT machine_id, slot_code, COUNT(*) AS copies
FROM public.machine_slots
GROUP BY machine_id, slot_code
HAVING COUNT(*) > 1;

SELECT version, name, checksum, applied_at
FROM public.schema_migrations
ORDER BY version;

SELECT t.tgname, pg_get_triggerdef(t.oid) AS definition
FROM pg_trigger t
WHERE t.tgrelid = 'public.machines'::regclass
  AND NOT t.tgisinternal
  AND t.tgname = 'trg_provision_default_machine_slots';

SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'provision_default_machine_slots';

COMMIT;
