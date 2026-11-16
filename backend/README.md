# FreshVend Backend

Express API backed by PostgreSQL. Database schema changes are managed from
`database/migrations/`; do not edit the database manually to reproduce a change.

## Setup

1. Copy the repository-root `.env.example` to `.env` and set `DATABASE_URL`,
   `JWT_SECRET`, webhook secrets, and a random `IOT_DEVICE_SECRET` of at least
   32 bytes. Replace every placeholder before deployment.
2. Install dependencies with `npm ci`.
3. Run migrations with `npm run db:migrate`; inspect them with
   `npm run db:migrate:status`.
4. Start the API with `npm start`; use `npm run dev` for development.

## MQTT order fulfillment

Set `MQTT_ENABLED=true` and configure `MQTT_HOST`, `MQTT_PORT`,
`MQTT_TOPIC_PREFIX`, and credentials/TLS as required. In production, the
Backend refuses to start MQTT without TLS, broker credentials, and a strong
`IOT_DEVICE_SECRET`. The secret is shared with the Simulator and signs MQTT
payloads with HMAC-SHA256.

Only a successful payment callback creates the durable row in
`dispense_commands`. The outbox publishes at QoS 1, retries if the broker or
device is unavailable, and reconciles each returned item once. A failed or
partial dispense records `refundDueAmount`; refund execution is not automated
because this repository has no payment-provider refund integration.

See `iot-simulator/README.md` for MQTT topics, payload examples, local
development startup, and integration-test limitations.

## Tests

Run API and database-backed integration tests with `npm test`. These tests use
the configured PostgreSQL database and should not run against production data.
