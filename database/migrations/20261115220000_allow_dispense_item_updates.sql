-- Permit fulfillment fields to change after payment without making order lines editable.
BEGIN;

CREATE OR REPLACE FUNCTION public.validate_order_item_source()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_order_id uuid;
    parent_machine_id uuid;
    parent_order_status character varying(20);
    slot_machine_id uuid;
    slot_state character varying(20);
    product_state character varying(20);
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_order_id := OLD.order_id;
        IF (SELECT order_status FROM public.orders WHERE order_id = target_order_id) <> 'PENDING' THEN
            RAISE EXCEPTION 'Items can only be changed while an order is PENDING'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_order_item_pending_order';
        END IF;
        IF EXISTS (
            SELECT 1 FROM public.inventory_reservations
            WHERE order_item_id = OLD.order_item_id
        ) THEN
            RAISE EXCEPTION 'An order item with reservation history cannot be deleted'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_order_item_reservation_history';
        END IF;
        RETURN OLD;
    END IF;

    SELECT machine_id, order_status
    INTO parent_machine_id, parent_order_status
    FROM public.orders
    WHERE order_id = NEW.order_id
    FOR UPDATE;

    IF parent_machine_id IS NULL THEN
        RAISE EXCEPTION 'Order does not exist'
            USING ERRCODE = '23503', CONSTRAINT = 'fk_order_items_order';
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.order_id IS DISTINCT FROM OLD.order_id
           OR EXISTS (
               SELECT 1 FROM public.inventory_reservations
               WHERE order_item_id = OLD.order_item_id
           ) AND parent_order_status = 'PENDING' THEN
            RAISE EXCEPTION 'Order item cannot be moved or changed after reservation'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_order_item_immutable_order';
        END IF;

        IF parent_order_status IN ('PAID', 'DISPENSING')
           AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id
           AND NEW.slot_id IS NOT DISTINCT FROM OLD.slot_id
           AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
           AND NEW.unit_price IS NOT DISTINCT FROM OLD.unit_price
           AND NEW.subtotal IS NOT DISTINCT FROM OLD.subtotal
           AND NEW.dispensed_quantity IS DISTINCT FROM OLD.dispensed_quantity
           AND NEW.dispense_status IS DISTINCT FROM OLD.dispense_status THEN
            RETURN NEW;
        END IF;
    END IF;

    IF parent_order_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Items can only be changed while an order is PENDING'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_order_item_pending_order';
    END IF;

    SELECT machine_id, status INTO slot_machine_id, slot_state
    FROM public.machine_slots
    WHERE slot_id = NEW.slot_id
    FOR UPDATE;

    SELECT status INTO product_state
    FROM public.products
    WHERE product_id = NEW.product_id
    FOR UPDATE;

    IF slot_machine_id IS DISTINCT FROM parent_machine_id THEN
        RAISE EXCEPTION 'Order item slot must belong to the order machine'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_order_item_machine_slot';
    END IF;
    IF slot_state IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'Cannot order from an inactive slot'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_order_item_active_slot';
    END IF;
    IF product_state IS DISTINCT FROM 'ACTIVE' THEN
        RAISE EXCEPTION 'Cannot order an inactive product'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_order_item_active_product';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_order_total ON public.order_items;
CREATE TRIGGER trg_refresh_order_total
AFTER INSERT OR UPDATE OF order_id, product_id, slot_id, quantity, unit_price, subtotal OR DELETE
ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.refresh_order_total();

COMMIT;
