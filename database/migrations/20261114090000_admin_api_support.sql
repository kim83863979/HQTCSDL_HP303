-- Supporting data and indexes for authenticated admin APIs.
BEGIN;

CREATE TABLE public.restock_event_items (
    restock_event_item_id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    restock_event_id uuid NOT NULL
        REFERENCES public.restock_events (restock_event_id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    inventory_id uuid NOT NULL
        REFERENCES public.inventories (inventory_id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    previous_quantity integer NOT NULL CHECK (previous_quantity >= 0),
    added_quantity integer NOT NULL CHECK (added_quantity > 0),
    new_quantity integer NOT NULL,
    CONSTRAINT chk_restock_event_item_balance
        CHECK (new_quantity = previous_quantity + added_quantity),
    CONSTRAINT uq_restock_event_inventory UNIQUE (restock_event_id, inventory_id)
);

ALTER TABLE public.alerts
    ADD COLUMN severity character varying(20) NOT NULL DEFAULT 'WARNING'
        CHECK (severity IN ('INFO', 'WARNING', 'CRITICAL')),
    ADD COLUMN updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ADD COLUMN acknowledged_at timestamp with time zone,
    ADD COLUMN acknowledged_by uuid
        REFERENCES public.users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
    ADD COLUMN resolved_at timestamp with time zone,
    ADD COLUMN resolved_by uuid
        REFERENCES public.users (user_id) ON UPDATE CASCADE ON DELETE SET NULL,
    ADD COLUMN source_key character varying(100);

CREATE UNIQUE INDEX uq_alerts_source_key
    ON public.alerts (source_key)
    WHERE source_key IS NOT NULL;
CREATE INDEX idx_alerts_status_severity_created
    ON public.alerts (status, severity, created_at DESC);
CREATE INDEX idx_alerts_machine_created
    ON public.alerts (machine_id, created_at DESC);
CREATE INDEX idx_restock_events_machine_date
    ON public.restock_events (machine_id, restock_date DESC);
CREATE INDEX idx_restock_event_items_event
    ON public.restock_event_items (restock_event_id);
CREATE INDEX idx_orders_created_status
    ON public.orders (created_at DESC, order_status);
CREATE INDEX idx_orders_machine_created
    ON public.orders (machine_id, created_at DESC);
CREATE INDEX idx_payments_status_created
    ON public.payments (payment_status, created_at DESC);

COMMIT;
