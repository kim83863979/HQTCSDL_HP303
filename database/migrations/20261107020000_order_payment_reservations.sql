-- Sprint 2 order, payment, and inventory reservation schema.
-- Apply after database/migrations/dump-FreshVend-202611011643.sql.
BEGIN;

ALTER TABLE public.inventories
  ADD COLUMN IF NOT EXISTS reserved_quantity integer NOT NULL DEFAULT 0;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventories_reserved_quantity') THEN
    ALTER TABLE public.inventories
      ADD CONSTRAINT chk_inventories_reserved_quantity
      CHECK (reserved_quantity >= 0 AND reserved_quantity <= quantity);
  END IF;
END $$;

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE public.orders
   SET expires_at = created_at + INTERVAL '15 minutes'
 WHERE expires_at IS NULL;
ALTER TABLE public.orders
  ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
  ALTER COLUMN expires_at SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_orders_expiration') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT chk_orders_expiration CHECK (expires_at > created_at);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_orders_pending_expiration
  ON public.orders (expires_at) WHERE order_status = 'PENDING';

ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS slot_id uuid;
UPDATE public.order_items oi
   SET slot_id = (
     SELECT i.slot_id
       FROM public.inventories i
       JOIN public.machine_slots s ON s.slot_id = i.slot_id
       JOIN public.orders o ON o.order_id = oi.order_id
      WHERE i.product_id = oi.product_id
        AND s.machine_id = o.machine_id
      ORDER BY i.slot_id
      LIMIT 1
   )
 WHERE oi.slot_id IS NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.order_items WHERE slot_id IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill order_items.slot_id: some historical order item has no matching product slot on its order machine';
  END IF;
END $$;
ALTER TABLE public.order_items ALTER COLUMN slot_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventories_slot_product
  ON public.inventories (slot_id, product_id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_order_items_slot_product') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT fk_order_items_slot_product
      FOREIGN KEY (slot_id, product_id)
      REFERENCES public.inventories (slot_id, product_id)
      ON UPDATE CASCADE ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.inventory_reservations (
  reservation_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id uuid NOT NULL
    REFERENCES public.order_items(order_item_id) ON UPDATE CASCADE ON DELETE CASCADE,
  inventory_id uuid NOT NULL
    REFERENCES public.inventories(inventory_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  status varchar(20) NOT NULL DEFAULT 'RESERVED'
    CHECK (status IN ('RESERVED', 'CONSUMED', 'RELEASED', 'RESTOCKED')),
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at timestamptz,
  CONSTRAINT chk_inventory_reservations_resolved_at
    CHECK ((status = 'RESERVED' AND resolved_at IS NULL)
        OR (status <> 'RESERVED' AND resolved_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_inventory_status
  ON public.inventory_reservations (inventory_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_reservations_active_order_item
  ON public.inventory_reservations (order_item_id) WHERE status = 'RESERVED';

CREATE OR REPLACE FUNCTION public.validate_inventory_reservation()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_item_slot uuid;
  v_item_product uuid;
  v_order_machine uuid;
  v_order_status varchar(20);
  v_expires_at timestamptz;
  v_inventory_slot uuid;
  v_inventory_product uuid;
  v_inventory_quantity integer;
  v_reserved_quantity integer;
  v_slot_machine uuid;
  v_slot_status varchar(20);
  v_product_status varchar(20);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'RESERVED' OR NEW.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'New inventory reservation must start as RESERVED';
    END IF;

    SELECT oi.slot_id, oi.product_id, o.machine_id, o.order_status, o.expires_at,
           i.slot_id, i.product_id, i.quantity, i.reserved_quantity,
           s.machine_id, s.status, p.status
      INTO v_item_slot, v_item_product, v_order_machine, v_order_status, v_expires_at,
           v_inventory_slot, v_inventory_product, v_inventory_quantity, v_reserved_quantity,
           v_slot_machine, v_slot_status, v_product_status
      FROM public.order_items oi
      JOIN public.orders o ON o.order_id = oi.order_id
      JOIN public.inventories i ON i.inventory_id = NEW.inventory_id
      JOIN public.machine_slots s ON s.slot_id = i.slot_id
      JOIN public.products p ON p.product_id = i.product_id
     WHERE oi.order_item_id = NEW.order_item_id
     FOR UPDATE OF i;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reservation order item or inventory was not found';
    END IF;
    IF v_item_slot <> v_inventory_slot OR v_item_product <> v_inventory_product
       OR v_slot_machine <> v_order_machine THEN
      RAISE EXCEPTION 'Reservation inventory must match the order item slot/product and order machine';
    END IF;
    IF v_order_status <> 'PENDING' OR v_expires_at <= CURRENT_TIMESTAMP THEN
      RAISE EXCEPTION 'Only an unexpired PENDING order can reserve inventory';
    END IF;
    IF v_slot_status <> 'ACTIVE' OR v_product_status <> 'ACTIVE' THEN
      RAISE EXCEPTION 'Only ACTIVE slots and products can be reserved';
    END IF;
    IF v_inventory_quantity - v_reserved_quantity < NEW.quantity THEN
      RAISE EXCEPTION 'Insufficient available inventory'
        USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_reservation_available';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.reservation_id <> OLD.reservation_id
     OR NEW.order_item_id <> OLD.order_item_id
     OR NEW.inventory_id <> OLD.inventory_id
     OR NEW.quantity <> OLD.quantity
     OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'Reservation identity and quantity are immutable';
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;
  IF NOT ((OLD.status = 'RESERVED' AND NEW.status IN ('CONSUMED', 'RELEASED'))
       OR (OLD.status = 'CONSUMED' AND NEW.status = 'RESTOCKED')) THEN
    RAISE EXCEPTION 'Invalid reservation transition: % -> %', OLD.status, NEW.status;
  END IF;
  NEW.resolved_at := COALESCE(NEW.resolved_at, CURRENT_TIMESTAMP);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_inventory_reservation_stock()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.inventories
       SET reserved_quantity = reserved_quantity + NEW.quantity
     WHERE inventory_id = NEW.inventory_id
       AND quantity - reserved_quantity >= NEW.quantity;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient available inventory'
        USING ERRCODE = '23514', CONSTRAINT = 'chk_inventory_reservation_available';
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status = 'RESERVED' THEN
      UPDATE public.inventories
         SET reserved_quantity = reserved_quantity - OLD.quantity
       WHERE inventory_id = OLD.inventory_id AND reserved_quantity >= OLD.quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Reserved inventory counter is inconsistent for reservation %', OLD.reservation_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'RESERVED' AND NEW.status = 'CONSUMED' THEN
    UPDATE public.inventories
       SET quantity = quantity - OLD.quantity,
           reserved_quantity = reserved_quantity - OLD.quantity
     WHERE inventory_id = OLD.inventory_id
       AND quantity >= OLD.quantity
       AND reserved_quantity >= OLD.quantity;
  ELSIF OLD.status = 'RESERVED' AND NEW.status = 'RELEASED' THEN
    UPDATE public.inventories
       SET reserved_quantity = reserved_quantity - OLD.quantity
     WHERE inventory_id = OLD.inventory_id AND reserved_quantity >= OLD.quantity;
  ELSIF OLD.status = 'CONSUMED' AND NEW.status = 'RESTOCKED' THEN
    UPDATE public.inventories
       SET quantity = quantity + OLD.quantity
     WHERE inventory_id = OLD.inventory_id;
  ELSE
    RETURN NEW;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory counters are inconsistent for reservation %', OLD.reservation_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_inventory_reservation ON public.inventory_reservations;
CREATE TRIGGER trg_validate_inventory_reservation
  BEFORE INSERT OR UPDATE ON public.inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION public.validate_inventory_reservation();
DROP TRIGGER IF EXISTS trg_apply_inventory_reservation_stock ON public.inventory_reservations;
CREATE TRIGGER trg_apply_inventory_reservation_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.inventory_reservations
  FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_reservation_stock();

CREATE OR REPLACE FUNCTION public.validate_order_item_slot()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_order_machine uuid;
  v_slot_machine uuid;
  v_slot_status varchar(20);
BEGIN
  SELECT machine_id INTO v_order_machine FROM public.orders WHERE order_id = NEW.order_id;
  SELECT machine_id, status INTO v_slot_machine, v_slot_status
    FROM public.machine_slots WHERE slot_id = NEW.slot_id;
  IF v_order_machine IS NULL OR v_slot_machine IS NULL THEN
    RAISE EXCEPTION 'Order machine or item slot was not found';
  END IF;
  IF v_order_machine <> v_slot_machine THEN
    RAISE EXCEPTION 'Order item slot must belong to the order machine';
  END IF;
  IF v_slot_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'Order item slot must be ACTIVE';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_order_item_slot ON public.order_items;
CREATE TRIGGER trg_validate_order_item_slot
  BEFORE INSERT OR UPDATE OF order_id, slot_id, product_id ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_order_item_slot();

CREATE OR REPLACE FUNCTION public.handle_order_inventory_lifecycle()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_status = 'CANCELLED' AND OLD.order_status <> 'CANCELLED' THEN
    UPDATE public.inventory_reservations r
       SET status = 'RELEASED', resolved_at = CURRENT_TIMESTAMP
      FROM public.order_items oi
     WHERE oi.order_id = NEW.order_id
       AND r.order_item_id = oi.order_item_id
       AND r.status = 'RESERVED';
    UPDATE public.payments
       SET payment_status = 'FAILED'
     WHERE order_id = NEW.order_id AND payment_status = 'PENDING';
  ELSIF NEW.order_status = 'FAILED' AND OLD.order_status = 'DISPENSING' THEN
    UPDATE public.inventory_reservations r
       SET status = 'RESTOCKED', resolved_at = CURRENT_TIMESTAMP
      FROM public.order_items oi
     WHERE oi.order_id = NEW.order_id
       AND r.order_item_id = oi.order_item_id
       AND r.status = 'CONSUMED';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_orders_inventory_lifecycle ON public.orders;
CREATE TRIGGER trg_orders_inventory_lifecycle
  AFTER UPDATE OF order_status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_inventory_lifecycle();

CREATE OR REPLACE FUNCTION public.assert_order_items_and_total()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_order_id uuid;
  v_total numeric(10,2);
  v_item_total numeric(10,2);
  v_item_count bigint;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  ELSIF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  SELECT total_amount INTO v_total FROM public.orders WHERE order_id = v_order_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  SELECT COUNT(*), COALESCE(SUM(subtotal), 0)
    INTO v_item_count, v_item_total
    FROM public.order_items WHERE order_id = v_order_id;
  IF v_item_count < 1 THEN
    RAISE EXCEPTION 'An order must contain at least one item';
  END IF;
  IF v_total <> v_item_total THEN
    RAISE EXCEPTION 'Order total % does not match order item total %', v_total, v_item_total;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_orders_require_items_total ON public.orders;
CREATE CONSTRAINT TRIGGER trg_orders_require_items_total
  AFTER INSERT OR UPDATE ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_order_items_and_total();
DROP TRIGGER IF EXISTS trg_order_items_require_total ON public.order_items;
CREATE CONSTRAINT TRIGGER trg_order_items_require_total
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.assert_order_items_and_total();


DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_order_items_subtotal_matches_quantity') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT chk_order_items_subtotal_matches_quantity
      CHECK (subtotal = quantity * unit_price);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_pending_per_order
  ON public.payments (order_id) WHERE payment_status = 'PENDING';
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_one_success_per_order
  ON public.payments (order_id) WHERE payment_status = 'SUCCESS';

COMMIT;