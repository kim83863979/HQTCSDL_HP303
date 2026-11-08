const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
process.env.PAYMENT_WEBHOOK_SECRET = 'order-test-webhook-secret';
process.env.ORDER_MAINTENANCE_SECRET = 'order-test-maintenance-secret';

const app = require('../app');
const { pool } = require('../src/config/db');

const fixture = { orderIds: [], productIds: [], slotIds: [] };
let machineId;
let productA;
let productB;
let inactiveProduct;
let slotA;
let slotA2;
let slotB;
let inactiveSlot;
let slotForInactiveProduct;

async function createOrder(items) {
  const response = await request(app)
    .post('/api/orders')
    .send({ machineId, items });
  if (response.status === 201) fixture.orderIds.push(response.body.data.id);
  return response;
}

async function createPayment(orderId) {
  return request(app)
    .post(`/api/orders/${orderId}/payments`)
    .send({ paymentMethod: 'QR' });
}

async function sendCallback(paymentId, status, transactionReference) {
  return request(app)
    .post(`/api/orders/payments/${paymentId}/callback`)
    .set('x-payment-key', process.env.PAYMENT_WEBHOOK_SECRET)
    .send({ status, transactionReference });
}

async function inventoryFor(slotId) {
  const { rows } = await pool.query(
    'SELECT quantity, reserved_quantity FROM inventories WHERE slot_id = $1',
    [slotId],
  );
  return rows[0];
}

before(async () => {
  const machine = await pool.query(
    'SELECT machine_id FROM machines ORDER BY machine_code LIMIT 1',
  );
  const category = await pool.query(
    'SELECT category_id FROM categories ORDER BY category_name LIMIT 1',
  );
  assert.ok(machine.rows[0], 'Run the database seed before order tests');
  assert.ok(category.rows[0], 'Run the database seed before order tests');
  machineId = machine.rows[0].machine_id;

  const testTag = randomUUID().slice(0, 8);
  for (const [label, target] of [
    ['A', 'productA'],
    ['B', 'productB'],
    ['INACTIVE', 'inactiveProduct'],
  ]) {
    const result = await pool.query(
      `INSERT INTO products (category_id, product_name, unit_price, status)
       VALUES ($1, $2, 3.25, $3)
       RETURNING product_id`,
      [category.rows[0].category_id, `Order Test ${label} ${testTag}`, label === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'],
    );
    fixture.productIds.push(result.rows[0].product_id);
    if (target === 'productA') productA = result.rows[0].product_id;
    if (target === 'productB') productB = result.rows[0].product_id;
    if (target === 'inactiveProduct') inactiveProduct = result.rows[0].product_id;
  }

  for (const [code, productId, quantity, active] of [
    [`T${testTag}-A1`, productA, 10, true],
    [`T${testTag}-A2`, productA, 5, true],
    [`T${testTag}-B`, productB, 1, true],
    [`T${testTag}-I`, inactiveProduct, 5, true],
    [`T${testTag}-INACTIVE`, productA, 5, false],
  ]) {
    const slot = await pool.query(
      `INSERT INTO machine_slots (machine_id, slot_code, capacity, status)
       VALUES ($1, $2, 20, $3)
       RETURNING slot_id`,
      [machineId, code, active ? 'ACTIVE' : 'INACTIVE'],
    );
    const slotId = slot.rows[0].slot_id;
    fixture.slotIds.push(slotId);
    await pool.query(
      `INSERT INTO inventories (slot_id, product_id, quantity)
       VALUES ($1, $2, $3)`,
      [slotId, productId, quantity],
    );
    if (code.endsWith('-A1')) slotA = slotId;
    if (code.endsWith('-A2')) slotA2 = slotId;
    if (code.endsWith('-B')) slotB = slotId;
    if (code.endsWith('-I')) slotForInactiveProduct = slotId;
    if (code.endsWith('-INACTIVE')) inactiveSlot = slotId;
  }
  await pool.query(
    "UPDATE machine_slots SET status = 'INACTIVE' WHERE slot_id = $1",
    [inactiveSlot],
  );
});

after(async () => {
  if (fixture.orderIds.length) {
    await pool.query(
      `UPDATE orders SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = ANY($1::uuid[]) AND order_status = 'PENDING'`,
      [fixture.orderIds],
    );
    await pool.query(
      `UPDATE orders SET order_status = 'FAILED', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = ANY($1::uuid[]) AND order_status = 'PAID'`,
      [fixture.orderIds],
    );
    await pool.query(
      `DELETE FROM inventory_reservations
       WHERE order_item_id IN (
         SELECT order_item_id FROM order_items WHERE order_id = ANY($1::uuid[])
       )`,
      [fixture.orderIds],
    );
    await pool.query('DELETE FROM orders WHERE order_id = ANY($1::uuid[])', [fixture.orderIds]);
  }
  if (fixture.slotIds.length) {
    await pool.query('DELETE FROM machine_slots WHERE slot_id = ANY($1::uuid[])', [fixture.slotIds]);
  }
  if (fixture.productIds.length) {
    await pool.query('DELETE FROM products WHERE product_id = ANY($1::uuid[])', [fixture.productIds]);
  }
  await pool.end();
});

describe('Orders and payment lifecycle', () => {
  it('creates an order, reserves the selected slot, and consumes stock once on payment success', async () => {
    const beforeStock = await inventoryFor(slotA2);
    const created = await createOrder([
      { productId: productA, slotId: slotA2, quantity: 2 },
    ]);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.items[0].slotId, slotA2);
    assert.equal(created.body.data.totalAmount, 6.5);
    assert.equal((await inventoryFor(slotA2)).reserved_quantity, 2);

    const payment = await createPayment(created.body.data.id);
    assert.equal(payment.status, 201);
    const reference = `order-test-${randomUUID()}`;
    const settled = await sendCallback(payment.body.data.id, 'SUCCESS', reference);
    assert.equal(settled.status, 200);
    assert.equal((await inventoryFor(slotA2)).quantity, beforeStock.quantity - 2);
    assert.equal((await inventoryFor(slotA2)).reserved_quantity, 0);

    const duplicateCallbacks = await Promise.all([
      sendCallback(payment.body.data.id, 'SUCCESS', reference),
      sendCallback(payment.body.data.id, 'SUCCESS', reference),
    ]);
    assert.deepEqual(duplicateCallbacks.map((response) => response.status), [200, 200]);
    assert.ok(duplicateCallbacks.some((response) => response.body.data.idempotent));
    assert.equal((await inventoryFor(slotA2)).quantity, beforeStock.quantity - 2);
    assert.equal((await sendCallback(payment.body.data.id, 'FAILED')).status, 409);
    assert.equal((await sendCallback(payment.body.data.id, 'REFUNDED')).status, 200);
    assert.equal((await sendCallback(payment.body.data.id, 'REFUNDED')).body.data.idempotent, true);
    const secondPayment = await createPayment(created.body.data.id);
    assert.equal(secondPayment.status, 409);
  });

  it('rejects insufficient stock and lets only one concurrent order reserve the last unit', async () => {
    const insufficient = await createOrder([
      { productId: productB, slotId: slotB, quantity: 2 },
    ]);
    assert.equal(insufficient.status, 409);

    const results = await Promise.all([
      createOrder([{ productId: productB, slotId: slotB, quantity: 1 }]),
      createOrder([{ productId: productB, slotId: slotB, quantity: 1 }]),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.equal((await inventoryFor(slotB)).reserved_quantity, 1);
  });

  it('releases stock after a failed payment and permits a fresh payment attempt', async () => {
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    assert.equal(created.status, 201);
    const first = await createPayment(created.body.data.id);
    assert.equal(first.status, 201);
    assert.equal((await sendCallback(first.body.data.id, 'FAILED')).status, 200);
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 0);

    const retry = await createPayment(created.body.data.id);
    assert.equal(retry.status, 201);
    assert.notEqual(retry.body.data.id, first.body.data.id);
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 1);
    assert.equal((await sendCallback(retry.body.data.id, 'SUCCESS', `retry-${randomUUID()}`)).status, 200);

    const order = await request(app).get(`/api/orders/${created.body.data.id}`).expect(200);
    assert.deepEqual(order.body.data.payments.map((entry) => entry.status), ['FAILED', 'SUCCESS']);
  });

  it('expires pending orders and releases their reservations', async () => {
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    assert.equal(created.status, 201);
    await pool.query(
      `UPDATE orders
       SET created_at = CURRENT_TIMESTAMP - INTERVAL '20 minutes',
           expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
       WHERE order_id = $1`,
      [created.body.data.id],
    );
    const response = await request(app).get(`/api/orders/${created.body.data.id}`).expect(200);
    assert.equal(response.body.data.status, 'CANCELLED');
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 0);
  });

  it('restores stock when a successfully paid order cannot be dispensed', async () => {
    const beforeStock = await inventoryFor(slotA);
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    const payment = await createPayment(created.body.data.id);
    assert.equal((await sendCallback(payment.body.data.id, 'SUCCESS', `dispense-${randomUUID()}`)).status, 200);

    const failedDispense = await request(app)
      .post(`/api/orders/${created.body.data.id}/dispense-result`)
      .send({ success: false })
      .expect(200);
    assert.equal(failedDispense.body.data.status, 'FAILED');
    assert.equal((await inventoryFor(slotA)).quantity, beforeStock.quantity);
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 0);
  });

  it('rejects inactive products, inactive slots, and empty order requests', async () => {
    assert.equal((await createOrder([
      { productId: inactiveProduct, slotId: slotForInactiveProduct, quantity: 1 },
    ])).status, 409);
    assert.equal((await createOrder([
      { productId: productA, slotId: inactiveSlot, quantity: 1 },
    ])).status, 409);
    assert.equal((await createOrder([
      { productId: productB, slotId: slotA, quantity: 1 },
    ])).status, 400);
    assert.equal((await request(app).post('/api/orders').send({ machineId, items: [] })).status, 400);
  });

  it('rejects stock quantities above slot capacity', async () => {
    await assert.rejects(
      pool.query('UPDATE inventories SET quantity = 21 WHERE slot_id = $1', [slotB]),
      (error) => error.constraint === 'chk_inventory_slot_capacity',
    );
  });

  it('requires an authenticated payment callback and makes invalid status transitions fail', async () => {
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    const payment = await createPayment(created.body.data.id);
    const unauthorized = await request(app)
      .post(`/api/orders/payments/${payment.body.data.id}/callback`)
      .send({ status: 'SUCCESS' });
    assert.equal(unauthorized.status, 401);
    assert.equal((await sendCallback(payment.body.data.id, 'FAILED')).status, 200);
    assert.equal((await sendCallback(payment.body.data.id, 'SUCCESS')).status, 409);
  });

  it('database rejects empty orders and incorrect line subtotals', async () => {
    await assert.rejects(
      pool.query(
        `INSERT INTO orders (machine_id, order_status, total_amount)
         VALUES ($1, 'PENDING', 0)`,
        [machineId],
      ),
      (error) => error.constraint === 'chk_order_nonempty',
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const order = await client.query(
        `INSERT INTO orders (machine_id, order_status, total_amount)
         VALUES ($1, 'PENDING', 0) RETURNING order_id`,
        [machineId],
      );
      await assert.rejects(
        client.query(
          `INSERT INTO order_items (order_id, product_id, slot_id, quantity, unit_price, subtotal)
           VALUES ($1, $2, $3, 1, 3.25, 4.25)`,
          [order.rows[0].order_id, productA, slotA],
        ),
        (error) => error.constraint === 'chk_order_items_subtotal_matches',
      );
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('migration backfilled existing order lines and totals', async () => {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS invalid_count
       FROM orders o
       WHERE o.total_amount <> COALESCE(
         (SELECT SUM(oi.subtotal) FROM order_items oi WHERE oi.order_id = o.order_id), 0
       )
       OR EXISTS (
         SELECT 1 FROM order_items oi
         WHERE oi.order_id = o.order_id AND oi.slot_id IS NULL
       )`,
    );
    assert.equal(result.rows[0].invalid_count, 0);
  });
});
