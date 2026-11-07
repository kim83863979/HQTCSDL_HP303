# Database migrations

Apply schema changes in version order. Start with `migrations/dump-FreshVend-202611011643.sql`, then apply `migrations/20261107020000_order_payment_reservations.sql` for the Sprint 2 order and payment flow.

The Sprint 2 migration adds `inventories.reserved_quantity`, `orders.expires_at`, `order_items.slot_id`, and `inventory_reservations`, with reservation lifecycle triggers and constraints. Keep local credentials in the ignored root `.env`; never commit them.