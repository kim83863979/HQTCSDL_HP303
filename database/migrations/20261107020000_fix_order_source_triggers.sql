-- Fix row-type-specific field access in the source-activity trigger.
BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_invalid_reserved_source_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'machine_slots' THEN
        IF OLD.status = 'ACTIVE' AND NEW.status <> 'ACTIVE'
           AND EXISTS (
               SELECT 1 FROM public.inventories i
               WHERE i.slot_id = OLD.slot_id AND i.reserved_quantity > 0
           ) THEN
            RAISE EXCEPTION 'Cannot deactivate a slot with reserved inventory'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_slot_has_no_reservations';
        END IF;

        IF NEW.capacity < OLD.capacity
           AND EXISTS (
               SELECT 1 FROM public.inventories i
               WHERE i.slot_id = OLD.slot_id AND i.quantity > NEW.capacity
           ) THEN
            RAISE EXCEPTION 'Slot capacity cannot be reduced below its inventory quantity'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_slot_capacity_inventory';
        END IF;
    ELSIF TG_TABLE_NAME = 'products' THEN
        IF OLD.status = 'ACTIVE' AND NEW.status <> 'ACTIVE'
           AND EXISTS (
               SELECT 1 FROM public.inventories i
               WHERE i.product_id = OLD.product_id AND i.reserved_quantity > 0
           ) THEN
            RAISE EXCEPTION 'Cannot deactivate a product with reserved inventory'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_product_has_no_reservations';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unexpected trigger table: %', TG_TABLE_NAME;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_order_reservations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.order_status IN ('FAILED', 'CANCELLED')
       AND OLD.order_status <> NEW.order_status THEN
        UPDATE public.inventory_reservations ir
        SET status = 'RELEASED', resolved_at = CURRENT_TIMESTAMP
        FROM public.order_items oi
        WHERE oi.order_item_id = ir.order_item_id
          AND oi.order_id = NEW.order_id
          AND ir.status = 'RESERVED';

        IF NEW.order_status = 'FAILED' THEN
            UPDATE public.inventory_reservations ir
            SET status = 'RESTOCKED', resolved_at = CURRENT_TIMESTAMP
            FROM public.order_items oi
            WHERE oi.order_item_id = ir.order_item_id
              AND oi.order_id = NEW.order_id
              AND ir.status = 'CONSUMED';
        END IF;

        UPDATE public.payments
        SET payment_status = 'FAILED'
        WHERE order_id = NEW.order_id AND payment_status = 'PENDING';
    END IF;
    RETURN NULL;
END;
$$;

COMMIT;
