-- Durable MQTT dispense commands and item-level fulfillment reconciliation.
BEGIN;

ALTER TABLE public.order_items
    ADD COLUMN dispensed_quantity integer NOT NULL DEFAULT 0,
    ADD COLUMN dispense_status character varying(20) NOT NULL DEFAULT 'PENDING',
    ADD CONSTRAINT chk_order_items_dispensed_quantity
        CHECK (dispensed_quantity >= 0 AND dispensed_quantity <= quantity),
    ADD CONSTRAINT chk_order_items_dispense_status
        CHECK (dispense_status IN ('PENDING', 'SUCCESS', 'FAILED', 'REJECTED', 'SKIPPED'));

ALTER TABLE public.orders
    ADD COLUMN refund_due_amount numeric(12, 2) NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_orders_refund_due_amount
        CHECK (refund_due_amount >= 0 AND refund_due_amount <= total_amount);

CREATE TABLE public.dispense_commands (
    command_id uuid PRIMARY KEY,
    order_id uuid NOT NULL UNIQUE
        REFERENCES public.orders (order_id) ON UPDATE CASCADE ON DELETE CASCADE,
    machine_id uuid NOT NULL
        REFERENCES public.machines (machine_id) ON UPDATE CASCADE ON DELETE RESTRICT,
    machine_code character varying(32) NOT NULL,
    topic text NOT NULL,
    payload jsonb NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'QUEUED'
        CHECK (status IN ('QUEUED', 'PUBLISHING', 'AWAITING_RESULT',
                          'COMPLETED', 'FAILED', 'DEAD_LETTER')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_attempt_at timestamp with time zone,
    last_error text,
    result jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    CONSTRAINT chk_dispense_command_terminal_state
        CHECK ((status IN ('COMPLETED', 'FAILED') AND completed_at IS NOT NULL AND result IS NOT NULL)
            OR (status NOT IN ('COMPLETED', 'FAILED') AND completed_at IS NULL))
);

CREATE INDEX idx_dispense_commands_dispatch
    ON public.dispense_commands (next_attempt_at, created_at)
    WHERE status IN ('QUEUED', 'AWAITING_RESULT');
CREATE INDEX idx_dispense_commands_order_status
    ON public.dispense_commands (order_id, status);

COMMIT;
