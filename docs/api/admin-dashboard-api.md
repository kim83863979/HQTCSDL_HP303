# Admin dashboard APIs

All responses use JSON. Except for public storefront product/category reads,
the endpoints below require `Authorization: Bearer <JWT>` and check the listed
database permission on every request.

## Catalog

Permission: `MANAGE_PRODUCT` (seeded for `ADMIN`).

| Method and path | Purpose |
|---|---|
| `GET /api/admin/products?page=1&limit=20&status=ALL&categoryId=<uuid>&search=<text>` | Search and paginate all products, including inactive products. `status` is `ALL`, `ACTIVE`, or `INACTIVE`. |
| `GET /api/admin/products/:productId` | Read a product, including inactive products. |
| `POST /api/admin/products` | Create `{ "categoryId": "<uuid>", "productName": "...", "unitPrice": 25000, "description": "...", "status": "ACTIVE" }`. |
| `PATCH /api/admin/products/:productId` | Update any subset of `categoryId`, `productName`, `unitPrice`, `description`, `status`. Use `INACTIVE` to stop selling a product; products are not hard-deleted. |
| `GET /api/admin/categories` | List categories and active/all product counts. |
| `GET /api/admin/categories/:categoryId` | Read a category. |
| `POST /api/admin/categories` | Create `{ "categoryName": "...", "description": "..." }`. |
| `PATCH /api/admin/categories/:categoryId` | Update `categoryName` and/or `description`. |
| `DELETE /api/admin/categories/:categoryId` | Delete only if no products reference the category; otherwise returns `409`. |

## Inventory assignment and restock

Permission: `MANAGE_INVENTORY` (seeded for `ADMIN` and `OPERATOR`).

| Method and path | Purpose |
|---|---|
| `PUT /api/inventory/slots/:slotId/product` | Assign an active product to an empty slot. Body: `{ "productId": "<uuid>", "quantity": 0 }`; `quantity` is optional and defaults to zero. Positive initial stock is recorded in restock history. A slot with stock, reservations, or order history cannot be reassigned. |
| `POST /api/inventory/restocks` | Add stock to one or more assigned slots. Body: `{ "machineId": "<uuid>", "notes": "...", "items": [{ "slotId": "<uuid>", "quantity": 5 }] }`. The update and line-level audit history are atomic; stock cannot exceed slot capacity. |
| `GET /api/inventory/restocks?page=1&limit=20&machineId=<uuid>&from=<ISO>&to=<ISO>` | Paginated restock history, optionally filtered by machine and date. |
| `GET /api/inventory/restocks/:restockEventId` | Read the restock header and item-level before/added/after quantities. |

The `from` boundary is inclusive and `to` is exclusive. A restock quantity is
the number of units being added, not the desired final count.

## Alerts

Permission: `MANAGE_ALERT` (seeded for `ADMIN` and `OPERATOR`).

| Method and path | Purpose |
|---|---|
| `GET /api/admin/alerts?page=1&limit=20&status=OPEN&severity=CRITICAL&machineId=<uuid>&from=<ISO>&to=<ISO>` | Filter and paginate alerts, ordered by severity and newest first. |
| `POST /api/admin/alerts` | Create an alert `{ "machineId": "<uuid>", "alertType": "DEVICE_ERROR", "severity": "WARNING", "message": "...", "sourceKey": "optional-idempotency-key" }`. Repeating the same `sourceKey` and payload returns the existing alert; reusing the key with a different payload returns `409`. |
| `GET /api/admin/alerts/:alertId` | Read an alert and its acknowledgement/resolution metadata. |
| `PATCH /api/admin/alerts/:alertId/status` | Set `{ "status": "ACKNOWLEDGED" }` or `{ "status": "RESOLVED" }`. Allowed transitions are `OPEN → ACKNOWLEDGED → RESOLVED` or `OPEN → RESOLVED`; resolved alerts are terminal. |

Simulator telemetry now persists temperature, sensor, door, device-error, and
offline alerts and resolves an active alert when the reported condition clears.
The existing machine-event log remains separate from the admin alert lifecycle.

## Orders, payments, and reports

Permission: `VIEW_REPORT` (seeded for `ADMIN` and `OPERATOR`).

| Method and path | Purpose |
|---|---|
| `GET /api/admin/orders?page=1&limit=20&status=COMPLETED&machineId=<uuid>&from=<ISO>&to=<ISO>&search=<text>` | Paginated order search with machine, payment-attempt count, and latest payment status. Date filters use order creation time. |
| `GET /api/admin/orders/:orderId` | Read order, item, and payment-attempt details. |
| `GET /api/admin/payments?page=1&limit=20&status=SUCCESS&paymentMethod=QR&machineId=<uuid>&from=<ISO>&to=<ISO>` | Paginated payment-attempt history. Date filters use payment creation time. |
| `GET /api/admin/reports/summary?from=<ISO>&to=<ISO>&machineId=<uuid>` | Order counts plus gross, refunded, and net payment amounts. Defaults to the last 30 days. |
| `GET /api/admin/reports/sales?from=<ISO>&to=<ISO>&groupBy=day&machineId=<uuid>&limit=100` | Sales aggregates grouped by `day`, `product`, or `machine`; date filters use successful payment time. Defaults to the last 30 days. |

For report date ranges, `from` is inclusive and `to` is exclusive. The summary
counts orders by order creation time and payments by payment time; the returned
range makes this distinction explicit. Sales by product report ordered line
quantities and subtotals, while day/machine sales use successful payment
amounts.

## Migration and tests

The restock line-item table, alert lifecycle fields, and report indexes are in
`database/migrations/20261114090000_admin_api_support.sql`. Run
`npm --prefix backend run db:migrate` before using these endpoints.
