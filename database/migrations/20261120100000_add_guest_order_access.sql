-- Give guest customers a secret capability for their own order and payments.
-- Existing orders stay accessible through their existing authenticated flows.
BEGIN;

ALTER TABLE public.orders
    ADD COLUMN guest_access_token_hash character varying(64);

CREATE INDEX idx_orders_guest_access_token_hash
    ON public.orders (guest_access_token_hash)
    WHERE guest_access_token_hash IS NOT NULL;

COMMIT;
