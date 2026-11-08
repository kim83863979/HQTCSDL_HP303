-- Roll back 20261107010000_order_payment_inventory.sql only before using the
-- reservation/payment-attempt features. This intentionally refuses to discard
-- reservation history or multi-attempt payment data.
BEGIN;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.inventory_reservations) THEN
        RAISE EXCEPTION
            'Rollback refused: inventory_reservations contains lifecycle history; archive and reconcile it before rollback';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.payments
        GROUP BY order_id HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Rollback refused: multiple payment attempts exist for an order';
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_inventory_capacity ON public.inventories;
DROP TRIGGER IF EXISTS trg_validate_order_item_source ON public.order_items;
DROP TRIGGER IF EXISTS trg_refresh_order_total ON public.order_items;
DROP TRIGGER IF EXISTS trg_require_nonempty_order ON public.orders;
DROP TRIGGER IF EXISTS trg_require_nonempty_order_items ON public.order_items;
DROP TRIGGER IF EXISTS trg_enforce_order_status_transition ON public.orders;
DROP TRIGGER IF EXISTS trg_resolve_order_reservations ON public.orders;
DROP TRIGGER IF EXISTS trg_validate_payment_attempt ON public.payments;
DROP TRIGGER IF EXISTS trg_apply_payment_result ON public.payments;
DROP TRIGGER IF EXISTS trg_validate_order_total_before_paid ON public.orders;
DROP TRIGGER IF EXISTS trg_prevent_invalid_slot_change ON public.machine_slots;
DROP TRIGGER IF EXISTS trg_prevent_invalid_product_change ON public.products;

DROP FUNCTION IF EXISTS public.validate_inventory_capacity();
DROP FUNCTION IF EXISTS public.validate_order_item_source();
DROP FUNCTION IF EXISTS public.refresh_order_total();
DROP FUNCTION IF EXISTS public.require_nonempty_order();
DROP FUNCTION IF EXISTS public.enforce_order_status_transition();
DROP FUNCTION IF EXISTS public.resolve_order_reservations();
DROP FUNCTION IF EXISTS public.validate_inventory_reservation();
DROP FUNCTION IF EXISTS public.apply_inventory_reservation();
DROP FUNCTION IF EXISTS public.validate_payment_attempt();
DROP FUNCTION IF EXISTS public.apply_payment_result();
DROP FUNCTION IF EXISTS public.prevent_invalid_reserved_source_change();
DROP FUNCTION IF EXISTS public.validate_order_items_for_payment();

DROP TABLE public.inventory_reservations;

DROP INDEX IF EXISTS public.uq_payments_one_pending_per_order;
DROP INDEX IF EXISTS public.uq_payments_one_success_per_order;
DROP INDEX IF EXISTS public.idx_orders_pending_expiration;

ALTER TABLE public.order_items
    DROP CONSTRAINT IF EXISTS fk_order_items_slot_product,
    DROP CONSTRAINT IF EXISTS chk_order_items_subtotal_matches,
    DROP COLUMN slot_id;
ALTER TABLE public.inventories
    DROP CONSTRAINT IF EXISTS chk_inventories_reserved_quantity,
    DROP CONSTRAINT IF EXISTS uq_inventories_slot_product,
    DROP COLUMN reserved_quantity;
ALTER TABLE public.orders
    DROP CONSTRAINT IF EXISTS chk_orders_expiration,
    DROP COLUMN expires_at;
ALTER TABLE public.payments
    ADD CONSTRAINT uq_payment_order UNIQUE (order_id);

COMMIT;
