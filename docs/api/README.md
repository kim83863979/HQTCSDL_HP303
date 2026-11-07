# API documentation

Backend runs at `http://localhost:3000` by default. APIs currently mounted:

| Group | Endpoints |
|---|---|
| Auth | `POST /api/auth/register`, `POST /api/auth/login` |
| Products | `GET /api/products`, `GET /api/products/:id` |
| Categories | `GET /api/categories`, `GET /api/categories/:id` |
| Machines | `GET /api/machines`, `GET /api/machines/:id`, `GET /api/machines/:id/slots`, `POST /api/machines/simulator/status` |
| Inventory | `GET /api/inventory/machines/:machineId`, `GET /api/inventory/slots/:slotId` |
| Orders | `POST /api/orders`, `GET /api/orders/:orderId`, `POST /api/orders/:orderId/cancel`, `POST /api/orders/:orderId/dispense-result`, `POST /api/orders/expire` |
| Payments | `POST /api/payments`, `GET /api/payments/:paymentId`, `POST /api/payments/:paymentId/callback` |

Sprint 2 Order/Payment details: [sprint2-nghia.md](sprint2-nghia.md).

Register accepts `email`, `fullname`, and `password`; the default role is `OPERATOR`. Login accepts `email` and `password` and returns a JWT. IoT telemetry accepts machine state, temperature, humidity, door, and sensor data; use `x-iot-key` when `IOT_DEVICE_SECRET` is configured.

The order-expiration endpoint requires `x-order-maintenance-key` matching `ORDER_MAINTENANCE_SECRET`. Payment callbacks require `x-payment-key` matching `PAYMENT_WEBHOOK_SECRET`. These secrets belong in the local root `.env`, which must not be committed. Copy root `.env.example` to `.env` and replace the placeholders.

Postman collections:

- [Sprint 1 API](./sprint1-api.postman_collection.json)
- [Products & Categories](./product-api.postman_collection.json)

Use the current database seed/dump for machine, slot, product, and category IDs. Run `npm test` from `backend` after configuring the database and installing dependencies.