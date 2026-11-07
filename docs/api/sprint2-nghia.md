# FreshVend Order and Payment API (Sprint 2)

Base URL: `http://localhost:3000`

Apply `database/migrations/dump-FreshVend-202611011643.sql` first, then `database/migrations/20261107020000_order_payment_reservations.sql`.

## Orders

### `POST /api/orders`

Creates a PENDING order and reserves stock in one database transaction. The server reads current product prices; clients must provide a machine, product, slot, and quantity for each item.

```json
{
  "machineId": "<machine UUID>",
  "items": [
    { "productId": "<product UUID>", "slotId": "<slot UUID>", "quantity": 2 }
  ]
}
```

The slot must be ACTIVE, contain that product, and belong to the selected machine. Available quantity is `inventories.quantity - inventories.reserved_quantity`. Orders expire 15 minutes after creation.

### `GET /api/orders/:orderId`

Returns the order, its items, reservation history, and payment attempts. Reading an expired PENDING order marks it CANCELLED and releases active reservations.

### `POST /api/orders/:orderId/cancel`

Cancels a PENDING order, releases RESERVED inventory, and marks any PENDING payment attempts FAILED. Other order statuses return 409.

### `POST /api/orders/expire`

Cancels all expired PENDING orders. No scheduler is included; an external job may call this endpoint with header `x-order-maintenance-key` set to the local `ORDER_MAINTENANCE_SECRET`.

### `POST /api/orders/:orderId/dispense-result`

Body: `{ "success": true }` or `{ "success": false, "errorMessage": "..." }`. A PAID order becomes DISPENSING, then COMPLETED on success or FAILED on failure. The database changes consumed reservations to RESTOCKED and restores the stock counter on dispense failure. A configured `IOT_DEVICE_SECRET` may also require `x-iot-key`.

## Payments

### `POST /api/payments`

Body: `{ "orderId": "<order UUID>", "paymentMethod": "QR" }`. The amount comes from the order. Only one PENDING payment attempt is allowed per order. Retrying after FAILED creates a new reservation if stock remains and then creates a new payment attempt. A matching request while a payment remains PENDING returns that attempt.

### `GET /api/payments/:paymentId`

Returns one payment attempt.

### `POST /api/payments/:paymentId/callback`

The mock callback requires `x-payment-key` set to the local `PAYMENT_WEBHOOK_SECRET`. Body:

```json
{
  "paymentStatus": "SUCCESS",
  "transactionReference": "DEMO-TRANSACTION-001"
}
```

Accepted statuses: `SUCCESS`, `FAILED`, `REFUNDED`. SUCCESS consumes reserved stock and marks the order PAID. FAILED releases the reservation and leaves the order PENDING for retry until it expires. REFUNDED is allowed only after SUCCESS and records the gateway result; this API does not issue a real refund. Repeating the same callback is idempotent; a conflicting transaction reference or invalid/late transition returns 409.

`POST /api/payments/:paymentId/result` remains as a backwards-compatible alias and uses the same authentication and rules.

## Local configuration and sample data

Keep `PAYMENT_WEBHOOK_SECRET` and `ORDER_MAINTENANCE_SECRET` in the ignored root `.env`; do not commit secret values. The current dump includes machine `8fd61456-cef0-497a-8a4a-b88aa3aee00c` (VM001). Example product/slot pairs: product `f88b5118-a85a-4488-b7ec-8d8b20d78b96` in slot `b120647d-32f6-4f5f-809c-695564b25a6b`; product `3575e93f-8458-4bb2-923b-1de5cfc8a8cf` in slot `2935c1a4-de18-4c31-bf7c-4f1d2051ee8b`; product `f9f599ea-be8e-45bd-b341-6addd5930ff8` in slot `fbf0da53-6435-4f12-b948-4ce0ce85613b`. These pairs match the current SQL dump; use a slot that contains the selected product.