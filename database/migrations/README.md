# Database migrations

`dump-FreshVend-202611011643.sql` là schema nền hiện có. Không chỉnh sửa dump
hoặc migration đã được áp dụng; thay đổi tiếp theo phải là migration mới.

## Order / payment / inventory

Apply `20261107010000_order_payment_inventory.sql`, then
`20261107020000_fix_order_source_triggers.sql`, after restoring the base dump.
The first migration backfills historical order-item slots using inventory on
each order's machine and aborts without changing the database if a line cannot
be mapped. It adds inventory reservations, payment-attempt history, lifecycle
triggers, and data-integrity constraints. The second fixes a row-type-specific
trigger issue found during integration testing.

With PostgreSQL client tools installed:

```powershell
psql -v ON_ERROR_STOP=1 -d FreshVend -f database/migrations/20261107010000_order_payment_inventory.sql
psql -v ON_ERROR_STOP=1 -d FreshVend -f database/migrations/20261107020000_fix_order_source_triggers.sql
```

The migration runs in a transaction. The matching
`20261107010000_order_payment_inventory.rollback.sql` is intentionally
conservative: it refuses to run after reservation history or multiple payment
attempts have been recorded, because removing those records would lose data.
Back up the database before applying either script.

After applying the migration, use `database/seeds/seed_data.sql` for the
order/payment sample flow and `database/seeds/sample-products.sql` for product
fixtures. The seed includes slot-level order items and completes its sample
payment through the same status transitions enforced by the database.
