const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
process.env.PAYMENT_WEBHOOK_SECRET = 'order-test-webhook-secret';
process.env.ORDER_MAINTENANCE_SECRET = 'order-test-maintenance-secret';
process.env.IOT_DEVICE_SECRET = 'order-test-iot-secret-32-bytes-minimum';
const app = require('../app');
const { pool } = require('../src/config/db');

const fixture = { orderIds: [], productIds: [], slotIds: [] };
const guestTokens = new Map();
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
  if (response.status === 201) {
    fixture.orderIds.push(response.body.data.id);
    guestTokens.set(response.body.data.id, response.body.data.guestAccessToken);
  }
  return response;
}

function guestHeader(orderId) {
  return { 'x-guest-order-token': guestTokens.get(orderId) };
}

async function createPayment(orderId) {
  return request(app)
    .post(`/api/orders/${orderId}/payments`)
    .set(guestHeader(orderId))
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
    assert.equal(settled.status, 200, JSON.stringify(settled.body));
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
    assert.equal((await sendCallback(payment.body.data.id, 'REFUNDED')).status, 409);
    const secondPayment = await createPayment(created.body.data.id);
    assert.equal(secondPayment.status, 409);
  });

  it('automatically selects a deterministic active slot when Guest checkout omits slotId', async () => {
    const created = await createOrder([{ productId: productA, quantity: 1 }]);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.items[0].slotId, slotA);
    const item = await pool.query(
      `SELECT oi.product_id, oi.slot_id, ir.status AS reservation_status
       FROM order_items oi JOIN inventory_reservations ir USING (order_item_id)
       WHERE oi.order_id = $1`,
      [created.body.data.id],
    );
    assert.equal(item.rows[0].product_id, productA);
    assert.equal(item.rows[0].slot_id, slotA);
    assert.equal(item.rows[0].reservation_status, 'RESERVED');
    await pool.query(
      "UPDATE orders SET order_status = 'CANCELLED' WHERE order_id = $1",
      [created.body.data.id],
    );
  });

  it('allocates each product line independently to a slot that contains that product', async () => {
    const created = await createOrder([
      { productId: productA, quantity: 2 },
      { productId: productB, quantity: 1 },
    ]);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.deepEqual(
      created.body.data.items.map((item) => [item.productId, item.slotId]).sort(),
      [[productA, slotA], [productB, slotB]].sort(),
    );
    const persisted = await pool.query(
      'SELECT product_id, slot_id FROM order_items WHERE order_id = $1 ORDER BY product_id',
      [created.body.data.id],
    );
    assert.deepEqual(
      persisted.rows.map((item) => [item.product_id, item.slot_id]).sort(),
      [[productA, slotA], [productB, slotB]].sort(),
    );
    await pool.query(
      "UPDATE orders SET order_status = 'CANCELLED' WHERE order_id = $1",
      [created.body.data.id],
    );
  });

  it('rejects a quantity that cannot fit in one slot without leaving order or reservation rows', async () => {
    const beforeStock = await Promise.all([inventoryFor(slotA), inventoryFor(slotA2)]);
    const result = await createOrder([{ productId: productA, quantity: 12 }]);
    assert.equal(result.status, 409);
    assert.match(result.body.message, /tối đa mua một lần hiện là 10/i);
    const orphanOrders = await pool.query(
      `SELECT COUNT(*)::int AS count FROM orders o
       JOIN order_items oi ON oi.order_id = o.order_id
       WHERE o.machine_id = $1 AND oi.product_id = $2 AND oi.quantity = 12`,
      [machineId, productA],
    );
    assert.equal(orphanOrders.rows[0].count, 0);
    assert.deepEqual(await Promise.all([inventoryFor(slotA), inventoryFor(slotA2)]), beforeStock);
  });

  it('creates separate orders for repeated purchases of the same product', async () => {
    const first = await createOrder([{ productId: productA, quantity: 1 }]);
    const second = await createOrder([{ productId: productA, quantity: 1 }]);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.notEqual(first.body.data.id, second.body.data.id);
    for (const created of [first, second]) {
      assert.equal(created.body.data.items.length, 1);
      assert.equal(created.body.data.items[0].productId, productA);
      await pool.query("UPDATE orders SET order_status = 'CANCELLED' WHERE order_id = $1", [created.body.data.id]);
    }
  });

  it('rejects automatic allocation when no active slot has enough available stock', async () => {
    const result = await createOrder([{ productId: productB, quantity: 2 }]);
    assert.equal(result.status, 409);
    assert.match(result.body.message, /tối đa mua một lần hiện là 1/i);
  });

  it('serializes concurrent automatic allocation of the last unit', async () => {
    const results = await Promise.all([
      createOrder([{ productId: productB, quantity: 1 }]),
      createOrder([{ productId: productB, quantity: 1 }]),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    const created = results.find((result) => result.status === 201);
    assert.equal(created.body.data.items[0].slotId, slotB);
    assert.equal((await inventoryFor(slotB)).reserved_quantity, 1);
    await pool.query(
      "UPDATE orders SET order_status = 'CANCELLED' WHERE order_id = $1",
      [created.body.data.id],
    );
    assert.equal((await inventoryFor(slotB)).reserved_quantity, 0);
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

    const retryResponses = await Promise.all([
      createPayment(created.body.data.id),
      createPayment(created.body.data.id),
    ]);
    assert.deepEqual(retryResponses.map((response) => response.status).sort(), [201, 409]);
    const retry = retryResponses.find((response) => response.status === 201);
    assert.notEqual(retry.body.data.id, first.body.data.id);
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 1);
    assert.equal((await sendCallback(retry.body.data.id, 'SUCCESS', `retry-${randomUUID()}`)).status, 200);

    const order = await request(app).get(`/api/orders/${created.body.data.id}`)
      .set(guestHeader(created.body.data.id)).expect(200);
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
    const response = await request(app).get(`/api/orders/${created.body.data.id}`)
      .set(guestHeader(created.body.data.id)).expect(200);
    assert.equal(response.body.data.status, 'CANCELLED');
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 0);
  });

  it('restores stock when a successfully paid order cannot be dispensed', async () => {
    const beforeStock = await inventoryFor(slotA);
    const slot = await pool.query('SELECT slot_code FROM machine_slots WHERE slot_id = $1', [slotA]);
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    const payment = await createPayment(created.body.data.id);
    assert.equal((await sendCallback(payment.body.data.id, 'SUCCESS', `dispense-${randomUUID()}`)).status, 200);

    const command = await pool.query(
      'SELECT command_id FROM dispense_commands WHERE order_id = $1',
      [created.body.data.id],
    );
    assert.equal(command.rowCount, 1);
    const unauthenticated = await request(app)
      .post(`/api/orders/${created.body.data.id}/dispense-result`)
      .send({});
    assert.equal(unauthenticated.status, 401);

    const failedDispense = await request(app)
      .post(`/api/orders/${created.body.data.id}/dispense-result`)
      .set('x-iot-key', process.env.IOT_DEVICE_SECRET)
      .send({
        commandId: command.rows[0].command_id,
        orderId: created.body.data.id,
        machineCode: 'VM001',
        machineId,
        eventCode: 'DISPENSE_FAILED',
        status: 'FAILED',
        items: [{
          columnId: slot.rows[0].slot_code,
          slotId: slotA,
          productId: productA,
          quantity: 1,
          dispensedQuantity: 0,
          status: 'REJECTED',
          retryCount: 0,
          errorCode: 'OUT_OF_STOCK',
        }],
      });
    assert.equal(failedDispense.status, 200, JSON.stringify(failedDispense.body));
    assert.equal(failedDispense.body.data.status, 'FAILED');
    assert.equal(failedDispense.body.data.refundDueAmount, 3.25);
    assert.equal((await inventoryFor(slotA)).quantity, beforeStock.quantity);
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 0);
    const [orderStatus, paymentStatus] = await Promise.all([
      pool.query('SELECT order_status FROM orders WHERE order_id = $1', [created.body.data.id]),
      pool.query(
        'SELECT payment_status FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
        [created.body.data.id],
      ),
    ]);
    assert.equal(orderStatus.rows[0].order_status, 'FAILED');
    assert.equal(paymentStatus.rows[0].payment_status, 'SUCCESS');
    assert.equal((await request(app)
      .post(`/api/orders/${created.body.data.id}/dispense-result`)
      .set('x-iot-key', process.env.IOT_DEVICE_SECRET)
      .send({
        commandId: command.rows[0].command_id,
        orderId: created.body.data.id,
        machineCode: 'VM001',
        machineId,
        eventCode: 'DISPENSE_FAILED',
        status: 'FAILED',
        items: [{
          columnId: slot.rows[0].slot_code,
          slotId: slotA,
          productId: productA,
          quantity: 1,
          dispensedQuantity: 0,
          status: 'REJECTED',
          retryCount: 0,
          errorCode: 'OUT_OF_STOCK',
        }],
      })).body.data.status, 'FAILED');
  });

  it('reconciles partial dispense exactly once and only restocks undispensed units', async () => {
    const beforeStock = await inventoryFor(slotA);
    const slot = await pool.query('SELECT slot_code FROM machine_slots WHERE slot_id = $1', [slotA]);
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 2 },
    ]);
    const payment = await createPayment(created.body.data.id);
    await sendCallback(payment.body.data.id, 'SUCCESS', `partial-${randomUUID()}`);
    const command = await pool.query(
      'SELECT command_id FROM dispense_commands WHERE order_id = $1',
      [created.body.data.id],
    );
    const result = {
      commandId: command.rows[0].command_id,
      orderId: created.body.data.id,
      machineCode: 'VM001',
      machineId,
      eventCode: 'DISPENSE_FAILED',
      status: 'FAILED',
      items: [{
        columnId: slot.rows[0].slot_code,
        slotId: slotA,
        productId: productA,
        quantity: 2,
        dispensedQuantity: 1,
        status: 'FAILED',
        retryCount: 2,
        errorCode: 'DISPENSE_JAM',
      }],
    };
    const endpoint = `/api/orders/${created.body.data.id}/dispense-result`;
    const first = await request(app).post(endpoint)
      .set('x-iot-key', process.env.IOT_DEVICE_SECRET).send(result);
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.data.items[0].dispensedQuantity, 1);
    assert.equal(first.body.data.refundDueAmount, 3.25);
    assert.equal((await inventoryFor(slotA)).quantity, beforeStock.quantity - 1);
    const duplicate = await request(app).post(endpoint)
      .set('x-iot-key', process.env.IOT_DEVICE_SECRET).send(result);
    assert.equal(duplicate.status, 200, JSON.stringify(duplicate.body));
    assert.equal((await inventoryFor(slotA)).quantity, beforeStock.quantity - 1);
  });

  it('rejects duplicate item results and results without the matching machine ID', async () => {
    const additionalSlot = await pool.query(
      `INSERT INTO machine_slots (machine_id, slot_code, capacity)
       VALUES ($1, $2, 4) RETURNING slot_id`,
      [machineId, `V${randomUUID().slice(0, 6).toUpperCase()}`],
    );
    const additionalSlotId = additionalSlot.rows[0].slot_id;
    fixture.slotIds.push(additionalSlotId);
    await pool.query(
      'INSERT INTO inventories (slot_id, product_id, quantity) VALUES ($1, $2, 3)',
      [additionalSlotId, productB],
    );
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
      { productId: productB, slotId: additionalSlotId, quantity: 1 },
    ]);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const payment = await createPayment(created.body.data.id);
    await sendCallback(payment.body.data.id, 'SUCCESS', `result-validation-${randomUUID()}`);
    const command = await pool.query(
      'SELECT command_id FROM dispense_commands WHERE order_id = $1',
      [created.body.data.id],
    );
    const slot = await pool.query('SELECT slot_code FROM machine_slots WHERE slot_id = $1', [slotA]);
    const duplicateItem = {
      columnId: slot.rows[0].slot_code,
      slotId: slotA,
      productId: productA,
      quantity: 1,
      dispensedQuantity: 1,
      status: 'SUCCESS',
      retryCount: 0,
      errorCode: null,
    };
    const endpoint = `/api/orders/${created.body.data.id}/dispense-result`;
    const duplicate = await request(app)
      .post(endpoint)
      .set('x-iot-key', process.env.IOT_DEVICE_SECRET)
      .send({
        commandId: command.rows[0].command_id,
        orderId: created.body.data.id,
        machineCode: 'VM001',
        machineId,
        eventCode: 'DISPENSE_SUCCESS',
        status: 'SUCCESS',
        items: [duplicateItem, duplicateItem],
      });
    assert.equal(duplicate.status, 400);

    const missingMachine = await request(app)
      .post(endpoint)
      .set('x-iot-key', process.env.IOT_DEVICE_SECRET)
      .send({
        commandId: command.rows[0].command_id,
        orderId: created.body.data.id,
        machineCode: 'VM001',
        eventCode: 'DISPENSE_SUCCESS',
        status: 'SUCCESS',
        items: [duplicateItem, {
          ...duplicateItem,
          columnId: (await pool.query(
            'SELECT slot_code FROM machine_slots WHERE slot_id = $1', [additionalSlotId],
          )).rows[0].slot_code,
          slotId: additionalSlotId,
          productId: productB,
        }],
      });
    assert.equal(missingMachine.status, 409);

    const itemStates = await pool.query(
      'SELECT dispense_status FROM order_items WHERE order_id = $1 ORDER BY slot_id',
      [created.body.data.id],
    );
    assert.ok(itemStates.rows.every((item) => item.dispense_status === 'PENDING'));
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
    assert.equal((await request(app).post('/api/orders')
      .send({ machineId, items: [] })).status, 400);
    assert.equal((await request(app).post('/api/orders')
      .send(null)).status, 400);
  });

  it('rejects stock quantities above slot capacity', async () => {
    await assert.rejects(
      pool.query('UPDATE inventories SET quantity = 21 WHERE slot_id = $1', [slotB]),
      (error) => error.constraint === 'chk_inventory_slot_capacity',
    );
  });

  it('requires the payment webhook secret and makes invalid status transitions fail', async () => {
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    const payment = await createPayment(created.body.data.id);
    const unauthorized = await request(app)
      .post(`/api/orders/payments/${payment.body.data.id}/callback`)
      .send({ status: 'SUCCESS' });
    assert.equal(unauthorized.status, 401);
    const demoWithoutGuestToken = await request(app)
      .post(`/api/payments/${payment.body.data.id}/demo-result`)
      .send({ paymentStatus: 'SUCCESS' });
    assert.equal(demoWithoutGuestToken.status, 401);
    assert.equal((await sendCallback(payment.body.data.id, 'FAILED')).status, 200);
    assert.equal((await sendCallback(payment.body.data.id, 'SUCCESS')).status, 409);
  });

  it('keeps the guest payment alias on the same reserved-stock lifecycle', async () => {
    const beforeStock = await inventoryFor(slotA);
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    assert.equal(created.status, 201);

    const payment = await request(app)
      .post('/api/payments')
      .set(guestHeader(created.body.data.id))
      .send({ orderId: created.body.data.id, paymentMethod: 'QR' })
      .expect(201);
    const paymentId = payment.body.data.paymentId;
    const slot = await pool.query('SELECT slot_code FROM machine_slots WHERE slot_id = $1', [slotA]);

    await request(app)
      .post(`/api/payments/${paymentId}/result`)
      .send({ paymentStatus: 'SUCCESS' })
      .expect(401);

    const settled = await request(app)
      .post(`/api/payments/${paymentId}/result`)
      .set('x-payment-key', process.env.PAYMENT_WEBHOOK_SECRET)
      .send({ paymentStatus: 'SUCCESS', transactionReference: `alias-${randomUUID()}` })
      .expect(200);
    assert.equal(settled.body.data.orderStatus, 'PAID');
    assert.equal((await inventoryFor(slotA)).quantity, beforeStock.quantity - 1);
    const command = await pool.query(
      'SELECT command_id FROM dispense_commands WHERE order_id = $1',
      [created.body.data.id],
    );
    const result = await request(app)
      .post(`/api/orders/${created.body.data.id}/dispense-result`)
      .set('x-iot-key', process.env.IOT_DEVICE_SECRET)
      .send({
        commandId: command.rows[0].command_id,
        orderId: created.body.data.id,
        machineCode: 'VM001',
        machineId,
        eventCode: 'DISPENSE_SUCCESS',
        status: 'SUCCESS',
        items: [{
          columnId: slot.rows[0].slot_code,
          slotId: slotA,
          productId: productA,
          quantity: 1,
          dispensedQuantity: 1,
          status: 'SUCCESS',
          retryCount: 0,
          errorCode: null,
        }],
      })
      .expect(200);
    assert.equal(result.body.data.status, 'COMPLETED');
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 0);
  });

  it('supports guest checkout with an order-scoped token and denies access without or with another guest token', async () => {
    const beforeStock = await inventoryFor(slotA);
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(typeof created.body.data.guestAccessToken, 'string');
    assert.equal(created.body.data.guestAccessToken.length, 43);

    await request(app)
      .get(`/api/orders/${created.body.data.id}`)
      .expect(401);
    await request(app)
      .post(`/api/orders/${created.body.data.id}/payments`)
      .send({ paymentMethod: 'QR' })
      .expect(401);

    const payment = await createPayment(created.body.data.id);
    assert.equal(payment.status, 201, JSON.stringify(payment.body));
    assert.equal(payment.body.data.orderId, created.body.data.id);
    assert.equal(payment.body.data.status, 'PENDING');
    const demoResult = await request(app)
      .post(`/api/payments/${payment.body.data.id}/demo-result`)
      .set(guestHeader(created.body.data.id))
      .send({ paymentStatus: 'SUCCESS', transactionReference: `guest-${randomUUID()}` })
      .expect(200);
    assert.equal(demoResult.body.data.orderStatus, 'PAID');
    assert.equal(demoResult.body.data.payment.paymentStatus, 'SUCCESS');
    assert.ok(demoResult.body.data.payment.transactionReference);
    assert.ok(demoResult.body.data.payment.paidAt);
    assert.equal(demoResult.body.data.changed, true);
    const persistedPayment = await pool.query(
      `SELECT p.payment_status, p.transaction_reference, p.paid_at, o.order_status
       FROM payments p JOIN orders o ON o.order_id = p.order_id WHERE p.payment_id = $1`,
      [payment.body.data.id],
    );
    assert.equal(persistedPayment.rows[0].payment_status, 'SUCCESS');
    assert.equal(persistedPayment.rows[0].order_status, 'PAID');
    assert.ok(persistedPayment.rows[0].paid_at);
    assert.equal((await inventoryFor(slotA)).quantity, beforeStock.quantity - 1);
    assert.equal((await pool.query(
      'SELECT count(*)::int AS count FROM dispense_commands WHERE order_id = $1',
      [created.body.data.id],
    )).rows[0].count, 1);

    const repeatedSuccess = await request(app)
      .post(`/api/payments/${payment.body.data.id}/demo-result`)
      .set(guestHeader(created.body.data.id))
      .send({ paymentStatus: 'SUCCESS', transactionReference: demoResult.body.data.payment.transactionReference })
      .expect(200);
    assert.equal(repeatedSuccess.body.data.changed, false);
    await request(app)
      .post(`/api/payments/${payment.body.data.id}/demo-result`)
      .set(guestHeader(created.body.data.id))
      .send({ paymentStatus: 'SUCCESS', transactionReference: 'different-reference' })
      .expect(409);
    await request(app)
      .post(`/api/payments/${payment.body.data.id}/demo-result`)
      .set(guestHeader(created.body.data.id))
      .send({ paymentStatus: 'FAILED' })
      .expect(409);

    const command = await pool.query(
      'SELECT command_id FROM dispense_commands WHERE order_id = $1',
      [created.body.data.id],
    );
    const slot = await pool.query('SELECT slot_code FROM machine_slots WHERE slot_id = $1', [slotA]);
    await request(app)
      .post(`/api/orders/${created.body.data.id}/dispense-result`)
      .set('x-iot-key', process.env.IOT_DEVICE_SECRET)
      .send({
        commandId: command.rows[0].command_id,
        orderId: created.body.data.id,
        machineCode: 'VM001',
        machineId,
        eventCode: 'DISPENSE_SUCCESS',
        status: 'SUCCESS',
        items: [{
          columnId: slot.rows[0].slot_code,
          slotId: slotA,
          productId: productA,
          quantity: 1,
          dispensedQuantity: 1,
          status: 'SUCCESS',
        }],
      })
      .expect(200);
    const completedOrder = await request(app)
      .get(`/api/orders/${created.body.data.id}`)
      .set(guestHeader(created.body.data.id))
      .expect(200);
    assert.equal(completedOrder.body.data.status, 'COMPLETED');

    await request(app)
      .get(`/api/payments/${payment.body.data.id}`)
      .set(guestHeader(created.body.data.id))
      .expect(200);
    const anotherOrder = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    assert.equal(anotherOrder.status, 201);

    await request(app)
      .get(`/api/orders/${created.body.data.id}`)
      .set(guestHeader(anotherOrder.body.data.id))
      .expect(404);
    await request(app)
      .get(`/api/payments/${payment.body.data.id}`)
      .set(guestHeader(anotherOrder.body.data.id))
      .expect(404);
  });

  it('settles a guest demo failure once, releases its reservation, and permits a fresh attempt', async () => {
    const beforeStock = await inventoryFor(slotA);
    const created = await createOrder([
      { productId: productA, slotId: slotA, quantity: 1 },
    ]);
    const payment = await createPayment(created.body.data.id);
    const paymentId = payment.body.data.id;

    await request(app)
      .post(`/api/payments/${paymentId}/demo-result`)
      .set('x-guest-order-token', 'wrong-guest-token')
      .send({ paymentStatus: 'FAILED' })
      .expect(404);

    const failed = await request(app)
      .post(`/api/payments/${paymentId}/demo-result`)
      .set(guestHeader(created.body.data.id))
      .send({ paymentStatus: 'FAILED' })
      .expect(200);
    assert.equal(failed.body.data.payment.paymentStatus, 'FAILED');
    assert.equal(failed.body.data.orderStatus, 'PENDING');
    assert.equal(failed.body.data.payment.transactionReference, `DEMO-${paymentId}`);
    assert.equal(failed.body.data.payment.paidAt, null);
    const persistedFailure = await pool.query(
      `SELECT p.payment_status, o.order_status
       FROM payments p JOIN orders o ON o.order_id = p.order_id WHERE p.payment_id = $1`,
      [paymentId],
    );
    assert.equal(persistedFailure.rows[0].payment_status, 'FAILED');
    assert.equal(persistedFailure.rows[0].order_status, 'PENDING');
    assert.equal((await inventoryFor(slotA)).quantity, beforeStock.quantity);
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 1);

    const repeatedFailure = await request(app)
      .post(`/api/payments/${paymentId}/demo-result`)
      .set(guestHeader(created.body.data.id))
      .send({ paymentStatus: 'FAILED', transactionReference: `DEMO-${paymentId}` })
      .expect(200);
    assert.equal(repeatedFailure.body.data.changed, false);
    await request(app)
      .post(`/api/payments/${paymentId}/demo-result`)
      .set(guestHeader(created.body.data.id))
      .send({ paymentStatus: 'SUCCESS' })
      .expect(409);

    const retry = await createPayment(created.body.data.id);
    assert.equal(retry.status, 201, JSON.stringify(retry.body));
    assert.equal((await inventoryFor(slotA)).reserved_quantity, 2);
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
