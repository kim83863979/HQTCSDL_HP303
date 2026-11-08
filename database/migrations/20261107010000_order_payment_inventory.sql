-- Order/payment lifecycle, slot-level order items, and inventory reservations.
-- Apply once after dump-FreshVend-202611011643.sql.
BEGIN;

-- Preserve historical order lines by assigning a slot on the same machine that
-- currently carries the ordered product. Abort rather than invent a mapping.
ALTER TABLE public.order_items ADD COLUMN slot_id uuid;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.order_items oi
        JOIN public.orders o ON o.order_id = oi.order_id
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.inventories i
            JOIN public.machine_slots ms ON ms.slot_id = i.slot_id
            WHERE ms.machine_id = o.machine_id
              AND i.product_id = oi.product_id
        )
    ) THEN
        RAISE EXCEPTION
            'Cannot backfill order_items.slot_id: at least one historical item has no matching product inventory on its order machine';
    END IF;
END;
$$;

UPDATE public.order_items oi
SET slot_id = (
    SELECT i.slot_id
    FROM public.orders o
    JOIN public.machine_slots ms ON ms.machine_id = o.machine_id
    JOIN public.inventories i ON i.slot_id = ms.slot_id
    WHERE o.order_id = oi.order_id
      AND i.product_id = oi.product_id
    ORDER BY ms.slot_code, ms.slot_id
    LIMIT 1
);

ALTER TABLE public.order_items ALTER COLUMN slot_id SET NOT NULL;
ALTER TABLE public.inventories
    ADD COLUMN reserved_quantity integer NOT NULL DEFAULT 0;
ALTER TABLE public.orders
    ADD COLUMN expires_at timestamp with time zone;

UPDATE public.orders
SET expires_at = created_at + INTERVAL '15 minutes';
UPDATE public.orders o
SET total_amount = COALESCE((
    SELECT SUM(oi.subtotal)
    FROM public.order_items oi
    WHERE oi.order_id = o.order_id
), 0);

ALTER TABLE public.orders
    ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
    ALTER COLUMN expires_at SET NOT NULL;

ALTER TABLE public.inventories
    ADD CONSTRAINT chk_inventories_reserved_quantity
        CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity),
    ADD CONSTRAINT uq_inventories_slot_product UNIQUE (slot_id, product_id);

ALTER TABLE public.order_items
    ADD CONSTRAINT fk_order_items_slot_product
        FOREIGN KEY (slot_id, product_id)
        REFERENCES public.inventories (slot_id, product_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD CONSTRAINT chk_order_items_subtotal_matches
        CHECK (subtotal = quantity * unit_price);

ALTER TABLE public.orders
    ADD CONSTRAINT chk_orders_expiration
        CHECK (expires_at > created_at);

ALTER TABLE public.payments DROP CONSTRAINT uq_payment_order;

CREATE UNIQUE INDEX uq_payments_one_pending_per_order
    ON public.payments (order_id)
    WHERE payment_status = 'PENDING';
CREATE UNIQUE INDEX uq_payments_one_success_per_order
    ON public.payments (order_id)
    WHERE payment_status = 'SUCCESS';
CREATE INDEX idx_orders_pending_expiration
    ON public.orders (expires_at)
    WHERE order_status = 'PENDING';

CREATE TABLE public.inventory_reservations (
    reservation_id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    order_item_id uuid NOT NULL
        REFERENCES public.order_items (order_item_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    inventory_id uuid NOT NULL
        REFERENCES public.inventories (inventory_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    quantity integer NOT NULL CHECK (quantity > 0),
    status character varying(20) NOT NULL DEFAULT 'RESERVED'
        CHECK (status IN ('RESERVED', 'CONSUMED', 'RELEASED', 'RESTOCKED')),
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at timestamp with time zone,
    CONSTRAINT chk_inventory_reservation_resolution
        CHECK ((status = 'RESERVED' AND resolved_at IS NULL)
            OR (status <> 'RESERVED' AND resolved_at IS NOT NULL))
);

CREATE UNIQUE INDEX uq_inventory_reservations_active_order_item
    ON public.inventory_reservations (order_item_id)
    WHERE status = 'RESERVED';
CREATE INDEX idx_inventory_reservations_inventory
    ON public.inventory_reservations (inventory_id, status);

-- All inventory quantity updates, including restocks and reservation settlement,
-- must respect the capacity of their slot.
CREATE FUNCTION public.validate_inventory_capacity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    slot_capacity integer;
BEGIN
    SELECT capacity INTO slot_capacity
    FROM public.machine_slots
    WHERE slot_id = NEW.slot_id
    FOR UPDATE;

    IF slot_capacity IS NULL THEN
        RAISE EXCEPTION 'Inventory slot does not exist'
            USING ERRCODE = '23503', CONSTRAINT = 'fk_inventories_slot';
    END IF;

    IF NEW.quantity > slot_capacity THEN
        RAISE EXCEPTION 'Inventory quantity cannot exceed slot capacity'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_slot_capacity';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_inventory_capacity
BEFORE INSERT OR UPDATE OF slot_id, quantity ON public.inventories
FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_capacity();

CREATE FUNCTION public.validate_order_item_source()
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

    IF TG_OP = 'UPDATE' AND (
        NEW.order_id <> OLD.order_id
        OR EXISTS (
            SELECT 1 FROM public.inventory_reservations
            WHERE order_item_id = OLD.order_item_id
        )
    ) THEN
        RAISE EXCEPTION 'Order item cannot be moved to another order'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_order_item_immutable_order';
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

CREATE TRIGGER trg_validate_order_item_source
BEFORE INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_source();

CREATE FUNCTION public.refresh_order_total()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_order_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_order_id := OLD.order_id;
    ELSE
        target_order_id := NEW.order_id;
    END IF;

    UPDATE public.orders o
    SET total_amount = COALESCE((
        SELECT SUM(oi.subtotal)
        FROM public.order_items oi
        WHERE oi.order_id = target_order_id
    ), 0)
    WHERE o.order_id = target_order_id;

    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_refresh_order_total
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.refresh_order_total();

CREATE FUNCTION public.require_nonempty_order()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    target_order_id uuid;
    current_status character varying(20);
BEGIN
    IF TG_TABLE_NAME = 'orders' THEN
        target_order_id := NEW.order_id;
    ELSIF TG_OP = 'DELETE' THEN
        target_order_id := OLD.order_id;
    ELSE
        target_order_id := NEW.order_id;
    END IF;

    SELECT order_status INTO current_status
    FROM public.orders
    WHERE order_id = target_order_id;

    IF current_status IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.order_items WHERE order_id = target_order_id
    ) THEN
        RAISE EXCEPTION 'An order must contain at least one order item'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_order_nonempty';
    END IF;

    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_require_nonempty_order
AFTER INSERT OR UPDATE ON public.orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.require_nonempty_order();
CREATE CONSTRAINT TRIGGER trg_require_nonempty_order_items
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.require_nonempty_order();

CREATE FUNCTION public.enforce_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.order_status = OLD.order_status THEN
        RETURN NEW;
    END IF;

    IF NOT (
        (OLD.order_status = 'PENDING' AND NEW.order_status IN ('PAID', 'FAILED', 'CANCELLED'))
        OR (OLD.order_status = 'PAID' AND NEW.order_status IN ('DISPENSING', 'FAILED'))
        OR (OLD.order_status = 'DISPENSING' AND NEW.order_status IN ('COMPLETED', 'FAILED'))
    ) THEN
        RAISE EXCEPTION 'Invalid order status transition: % -> %',
            OLD.order_status, NEW.order_status
            USING ERRCODE = '23514', CONSTRAINT = 'chk_order_status_transition';
    END IF;

    IF NEW.order_status = 'PAID' AND (
        NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = NEW.order_id)
        OR NEW.total_amount <= 0
        OR NOT EXISTS (
            SELECT 1 FROM public.payments
            WHERE order_id = NEW.order_id AND payment_status = 'SUCCESS'
        )
        OR EXISTS (
            SELECT 1
            FROM public.order_items oi
            WHERE oi.order_id = NEW.order_id
              AND NOT EXISTS (
                  SELECT 1 FROM public.inventory_reservations ir
                  WHERE ir.order_item_id = oi.order_item_id
                    AND ir.status = 'CONSUMED'
              )
        )
    ) THEN
        RAISE EXCEPTION 'Order requires items, a successful payment, and active reservations before becoming PAID'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_order_paid_requirements';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_order_status_transition
BEFORE UPDATE OF order_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_status_transition();

CREATE FUNCTION public.resolve_order_reservations()
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
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_resolve_order_reservations
AFTER UPDATE OF order_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.resolve_order_reservations();

CREATE FUNCTION public.validate_inventory_reservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    item_record record;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.status <> 'RESERVED' THEN
            RAISE EXCEPTION 'Reservations must be created in RESERVED state'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_reservation_initial_state';
        END IF;

        SELECT oi.order_id, oi.slot_id, oi.product_id, oi.quantity AS item_quantity,
               o.order_status, o.expires_at, i.slot_id AS inventory_slot, i.product_id AS inventory_product
        INTO item_record
        FROM public.order_items oi
        JOIN public.orders o ON o.order_id = oi.order_id
        JOIN public.inventories i ON i.inventory_id = NEW.inventory_id
        WHERE oi.order_item_id = NEW.order_item_id
        FOR UPDATE OF oi, o, i;

        IF NOT FOUND
           OR item_record.order_status <> 'PENDING'
           OR item_record.expires_at <= CURRENT_TIMESTAMP
           OR item_record.slot_id <> item_record.inventory_slot
           OR item_record.product_id <> item_record.inventory_product
           OR item_record.item_quantity <> NEW.quantity THEN
            RAISE EXCEPTION 'Reservation does not match an active pending order item'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_reservation_matches_item';
        END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'DELETE' THEN
        IF OLD.status = 'RESERVED' THEN
            RAISE EXCEPTION 'Active reservations must be released or consumed, not deleted'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_reservation_immutable';
        END IF;
        RETURN OLD;
    END IF;

    IF NEW.reservation_id <> OLD.reservation_id
       OR NEW.order_item_id <> OLD.order_item_id
       OR NEW.inventory_id <> OLD.inventory_id
       OR NEW.quantity <> OLD.quantity
       OR NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'Reservation identity and quantity are immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_reservation_immutable';
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    IF NOT (
        (OLD.status = 'RESERVED' AND NEW.status IN ('CONSUMED', 'RELEASED'))
        OR (OLD.status = 'CONSUMED' AND NEW.status = 'RESTOCKED')
    ) THEN
        RAISE EXCEPTION 'Invalid reservation status transition: % -> %',
            OLD.status, NEW.status
            USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_reservation_transition';
    END IF;
    IF NEW.resolved_at IS NULL THEN
        NEW.resolved_at := CURRENT_TIMESTAMP;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_inventory_reservation
BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_reservation();

CREATE FUNCTION public.apply_inventory_reservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.inventories
        SET reserved_quantity = reserved_quantity + NEW.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = NEW.inventory_id
          AND quantity - reserved_quantity >= NEW.quantity;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient available inventory'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_available_quantity';
        END IF;
        RETURN NULL;
    END IF;

    IF OLD.status = NEW.status THEN
        RETURN NULL;
    END IF;

    IF OLD.status = 'RESERVED' AND NEW.status = 'RELEASED' THEN
        UPDATE public.inventories
        SET reserved_quantity = reserved_quantity - OLD.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = OLD.inventory_id
          AND reserved_quantity >= OLD.quantity;
    ELSIF OLD.status = 'RESERVED' AND NEW.status = 'CONSUMED' THEN
        UPDATE public.inventories
        SET quantity = quantity - OLD.quantity,
            reserved_quantity = reserved_quantity - OLD.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = OLD.inventory_id
          AND quantity >= OLD.quantity
          AND reserved_quantity >= OLD.quantity;
    ELSIF OLD.status = 'CONSUMED' AND NEW.status = 'RESTOCKED' THEN
        UPDATE public.inventories
        SET quantity = quantity + OLD.quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE inventory_id = OLD.inventory_id;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inventory reservation could not be resolved consistently'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_reservation_balance';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_apply_inventory_reservation
AFTER INSERT OR UPDATE OF status ON public.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_reservation();

CREATE FUNCTION public.validate_payment_attempt()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    order_record record;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.payment_status <> 'PENDING' THEN
            RAISE EXCEPTION 'Payment attempts must be created in PENDING state'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_payment_initial_state';
        END IF;
        SELECT order_status, total_amount, expires_at INTO order_record
        FROM public.orders WHERE order_id = NEW.order_id FOR UPDATE;
        IF NOT FOUND
           OR order_record.order_status <> 'PENDING'
           OR order_record.expires_at <= CURRENT_TIMESTAMP
           OR order_record.total_amount <= 0
           OR NEW.amount <> order_record.total_amount
           OR NOT EXISTS (SELECT 1 FROM public.order_items WHERE order_id = NEW.order_id) THEN
            RAISE EXCEPTION 'Payment requires a non-expired pending order with items and matching total'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_payment_order_requirements';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.order_id <> OLD.order_id
       OR NEW.amount <> OLD.amount
       OR NEW.payment_method <> OLD.payment_method THEN
        RAISE EXCEPTION 'Payment attempt identity, amount, and method are immutable'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_payment_immutable_fields';
    END IF;

    IF NEW.payment_status = OLD.payment_status THEN
        RETURN NEW;
    END IF;
    IF NOT ((OLD.payment_status = 'PENDING' AND NEW.payment_status IN ('SUCCESS', 'FAILED'))
        OR (OLD.payment_status = 'SUCCESS' AND NEW.payment_status = 'REFUNDED')) THEN
        RAISE EXCEPTION 'Invalid payment status transition: % -> %',
            OLD.payment_status, NEW.payment_status
            USING ERRCODE = '23514', CONSTRAINT = 'chk_payment_status_transition';
    END IF;

    IF NEW.payment_status = 'SUCCESS' THEN
        SELECT order_status, total_amount INTO order_record
        FROM public.orders WHERE order_id = NEW.order_id FOR UPDATE;
        IF order_record.order_status <> 'PENDING'
           OR order_record.total_amount <> NEW.amount
           OR EXISTS (
               SELECT 1
               FROM public.order_items oi
               WHERE oi.order_id = NEW.order_id
                 AND NOT EXISTS (
                     SELECT 1 FROM public.inventory_reservations ir
                     WHERE ir.order_item_id = oi.order_item_id
                       AND ir.status = 'RESERVED'
                       AND ir.quantity = oi.quantity
                 )
           ) THEN
            RAISE EXCEPTION 'Payment cannot succeed without matching active order reservations'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_payment_success_requirements';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_payment_attempt
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.validate_payment_attempt();

CREATE FUNCTION public.apply_payment_result()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.payment_status = 'PENDING'
       AND NEW.payment_status = 'SUCCESS' THEN
        UPDATE public.inventory_reservations ir
        SET status = 'CONSUMED', resolved_at = CURRENT_TIMESTAMP
        FROM public.order_items oi
        WHERE oi.order_item_id = ir.order_item_id
          AND oi.order_id = NEW.order_id
          AND ir.status = 'RESERVED';

        UPDATE public.orders
        SET order_status = 'PAID', updated_at = CURRENT_TIMESTAMP
        WHERE order_id = NEW.order_id;

        UPDATE public.payments
        SET paid_at = COALESCE(NEW.paid_at, CURRENT_TIMESTAMP)
        WHERE payment_id = NEW.payment_id AND paid_at IS NULL;
    ELSIF TG_OP = 'UPDATE' AND OLD.payment_status = 'PENDING'
       AND NEW.payment_status = 'FAILED' THEN
        UPDATE public.inventory_reservations ir
        SET status = 'RELEASED', resolved_at = CURRENT_TIMESTAMP
        FROM public.order_items oi
        WHERE oi.order_item_id = ir.order_item_id
          AND oi.order_id = NEW.order_id
          AND ir.status = 'RESERVED';
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_apply_payment_result
AFTER UPDATE OF payment_status ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.apply_payment_result();

-- A line's slot/product identity is protected by the composite FK, and source
-- activity is checked when the order line is created. Block deactivation or
-- capacity reductions that would invalidate outstanding reservations.
CREATE FUNCTION public.prevent_invalid_reserved_source_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'machine_slots' AND OLD.status = 'ACTIVE'
       AND NEW.status <> 'ACTIVE'
       AND EXISTS (
           SELECT 1 FROM public.inventories i
           WHERE i.slot_id = OLD.slot_id AND i.reserved_quantity > 0
       ) THEN
        RAISE EXCEPTION 'Cannot deactivate a slot with reserved inventory'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_slot_has_no_reservations';
    ELSIF TG_TABLE_NAME = 'products' AND OLD.status = 'ACTIVE'
       AND NEW.status <> 'ACTIVE'
       AND EXISTS (
           SELECT 1 FROM public.inventories i
           WHERE i.product_id = OLD.product_id AND i.reserved_quantity > 0
       ) THEN
        RAISE EXCEPTION 'Cannot deactivate a product with reserved inventory'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_product_has_no_reservations';
    ELSIF TG_TABLE_NAME = 'machine_slots' AND NEW.capacity < OLD.capacity
       AND EXISTS (
           SELECT 1 FROM public.inventories i
           WHERE i.slot_id = OLD.slot_id AND i.quantity > NEW.capacity
       ) THEN
        RAISE EXCEPTION 'Slot capacity cannot be reduced below its inventory quantity'
            USING ERRCODE = '23514', CONSTRAINT = 'chk_slot_capacity_inventory';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_invalid_slot_change
BEFORE UPDATE OF status, capacity ON public.machine_slots
FOR EACH ROW EXECUTE FUNCTION public.prevent_invalid_reserved_source_change();
CREATE TRIGGER trg_prevent_invalid_product_change
BEFORE UPDATE OF status ON public.products
FOR EACH ROW EXECUTE FUNCTION public.prevent_invalid_reserved_source_change();

CREATE FUNCTION public.validate_order_items_for_payment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.order_status = 'PAID' AND OLD.order_status <> 'PAID' THEN
        IF NEW.total_amount <> COALESCE((
            SELECT SUM(subtotal) FROM public.order_items WHERE order_id = NEW.order_id
        ), 0)
        OR NEW.total_amount <= 0 THEN
            RAISE EXCEPTION 'Order total must equal the sum of its items before payment'
                USING ERRCODE = '23514', CONSTRAINT = 'chk_order_total_matches_items';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_order_total_before_paid
BEFORE UPDATE OF order_status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.validate_order_items_for_payment();

COMMIT;
