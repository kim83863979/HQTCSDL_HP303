# Orders module

The order API creates PENDING orders and inventory reservations atomically. Request items require `productId`, `slotId`, and positive `quantity`; `machineId` is required at order level. See `docs/api/sprint2-nghia.md` for payloads and lifecycle rules.

The order migration must be applied after the base FreshVend dump. Expiration has no built-in scheduler; call `POST /api/orders/expire` from a trusted job with the configured maintenance key.