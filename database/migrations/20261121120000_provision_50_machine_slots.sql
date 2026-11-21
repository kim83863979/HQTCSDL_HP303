BEGIN;

-- Provision missing logical simulator columns without changing existing slot IDs,
-- capacity, status, inventory, or reservations.
CREATE OR REPLACE FUNCTION public.provision_default_machine_slots()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO public.machine_slots (machine_id, slot_code, capacity, status)
    SELECT NEW.machine_id, 'A' || LPAD(slot_number::text, 2, '0'), 20, 'ACTIVE'
    FROM generate_series(1, 50) AS slot_number
    ON CONFLICT (machine_id, slot_code) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_provision_default_machine_slots ON public.machines;
CREATE TRIGGER trg_provision_default_machine_slots
AFTER INSERT ON public.machines
FOR EACH ROW EXECUTE FUNCTION public.provision_default_machine_slots();

INSERT INTO public.machine_slots (machine_id, slot_code, capacity, status)
SELECT m.machine_id, 'A' || LPAD(slot_number::text, 2, '0'), 20, 'ACTIVE'
FROM public.machines m
CROSS JOIN generate_series(1, 50) AS slot_number
ON CONFLICT (machine_id, slot_code) DO NOTHING;

COMMIT;
