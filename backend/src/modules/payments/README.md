# Payments module

Payment attempts are created from PENDING orders. Each retry after FAILED creates a new attempt and re-reserves stock if available. The mock callback accepts SUCCESS, FAILED, and REFUNDED, and requires the configured `x-payment-key` secret. It does not connect to a real payment gateway or issue refunds.

See `docs/api/sprint2-nghia.md` for endpoint details and state transitions.