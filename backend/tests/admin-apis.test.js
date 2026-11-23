const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
process.env.IOT_DEVICE_SECRET = 'admin-test-iot-secret-32-bytes-minimum';

const app = require('../app');
const { pool } = require('../src/config/db');
const jwtSecret = process.env.JWT_SECRET || 'freshvend_dev_secret_change_in_production';
const fixture = { productIds: [], categoryIds: [], slotIds: [], restockIds: [], alertIds: [] };
let adminToken;
let operatorToken;
let operatorId;
let machineId;

function tokenFor(user, role) {
  return jwt.sign(
    { email: user.email, role },
    jwtSecret,
    { subject: user.user_id, expiresIn: '1h' },
  );
}

before(async () => {
  const [admin, operator, machine] = await Promise.all([
    pool.query(
      `SELECT u.user_id, u.email FROM users u
       JOIN roles r ON r.role_id = u.role_id WHERE r.name = 'ADMIN' LIMIT 1`,
    ),
    pool.query(
      `SELECT u.user_id, u.email FROM users u
       JOIN roles r ON r.role_id = u.role_id WHERE r.name = 'OPERATOR' LIMIT 1`,
    ),
    pool.query('SELECT machine_id FROM machines ORDER BY machine_code LIMIT 1'),
  ]);
  assert.ok(admin.rows[0], 'Run the database seed before admin API tests');
  assert.ok(operator.rows[0], 'Run the database seed before admin API tests');
  assert.ok(machine.rows[0], 'Run the database seed before admin API tests');
  operatorId = operator.rows[0].user_id;
  machineId = machine.rows[0].machine_id;
  adminToken = tokenFor(admin.rows[0], 'ADMIN');
  operatorToken = tokenFor(operator.rows[0], 'OPERATOR');
});

after(async () => {
  if (fixture.alertIds.length) {
    await pool.query('DELETE FROM alerts WHERE alert_id = ANY($1::uuid[])', [fixture.alertIds]);
  }
  if (fixture.restockIds.length) {
    await pool.query('DELETE FROM restock_events WHERE restock_event_id = ANY($1::uuid[])', [fixture.restockIds]);
  }
  if (fixture.slotIds.length) {
    await pool.query('DELETE FROM machine_slots WHERE slot_id = ANY($1::uuid[])', [fixture.slotIds]);
  }
  if (fixture.productIds.length) {
    await pool.query('DELETE FROM products WHERE product_id = ANY($1::uuid[])', [fixture.productIds]);
  }
  if (fixture.categoryIds.length) {
    await pool.query('DELETE FROM categories WHERE category_id = ANY($1::uuid[])', [fixture.categoryIds]);
  }
  await pool.end();
});

describe('Admin catalog APIs', () => {
  it('protects catalog mutations and supports product/category CRUD', async () => {
    await request(app).get('/api/admin/products').expect(401);
    await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({})
      .expect(403);

    const category = await request(app)
      .post('/api/admin/categories')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ categoryName: `Admin API ${randomUUID()}`, description: 'test category' })
      .expect(201);
    const categoryId = category.body.data.categoryId;
    fixture.categoryIds.push(categoryId);

    const product = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        productName: `Admin API ${randomUUID()}`,
        description: 'test product',
        unitPrice: 12.5,
      })
      .expect(201);
    const productId = product.body.data.productId;
    fixture.productIds.push(productId);
    assert.equal(product.body.data.unitPrice, 12.5);

    await request(app)
      .get('/api/admin/products?status=ALL&limit=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .then((response) => {
        assert.equal(response.body.pagination.limit, 1);
        assert.ok(response.body.pagination.total >= 1);
      });

    const updated = await request(app)
      .patch(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ unitPrice: 15, status: 'INACTIVE' })
      .expect(200);
    assert.equal(updated.body.data.unitPrice, 15);
    assert.equal(updated.body.data.status, 'INACTIVE');

    const renamed = await request(app)
      .patch(`/api/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'updated description' })
      .expect(200);
    assert.equal(renamed.body.data.description, 'updated description');

    await request(app)
      .delete(`/api/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);

    await pool.query('DELETE FROM products WHERE product_id = $1', [productId]);
    fixture.productIds = fixture.productIds.filter((id) => id !== productId);
    await request(app)
      .delete(`/api/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    fixture.categoryIds = fixture.categoryIds.filter((id) => id !== categoryId);
  });
});

describe('Inventory restock APIs', () => {
  it('assigns a product to an empty slot and records its initial stock', async () => {
    const category = await pool.query(
      'SELECT category_id FROM categories ORDER BY category_name LIMIT 1',
    );
    const product = await pool.query(
      `INSERT INTO products (category_id, product_name, unit_price)
       VALUES ($1, $2, 20) RETURNING product_id`,
      [category.rows[0].category_id, `Assignment API ${randomUUID()}`],
    );
    const productId = product.rows[0].product_id;
    fixture.productIds.push(productId);
    const slot = await pool.query(
      `INSERT INTO machine_slots (machine_id, slot_code, capacity)
       VALUES ($1, $2, 8) RETURNING slot_id`,
      [machineId, `A${randomUUID().slice(0, 6).toUpperCase()}`],
    );
    const slotId = slot.rows[0].slot_id;
    fixture.slotIds.push(slotId);

    const assigned = await request(app)
      .put(`/api/inventory/slots/${slotId}/product`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ productId, quantity: 2 })
      .expect(201);
    fixture.restockIds.push(assigned.body.data.restockEventId);
    assert.equal(assigned.body.data.productId, productId);
    assert.equal(assigned.body.data.quantity, 2);

    await request(app)
      .put(`/api/inventory/slots/${slotId}/product`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ productId })
      .expect(409);
  });

  it('records stock additions atomically and exposes paginated history', async () => {
    const category = await pool.query(
      'SELECT category_id FROM categories ORDER BY category_name LIMIT 1',
    );
    const product = await pool.query(
      `INSERT INTO products (category_id, product_name, unit_price)
       VALUES ($1, $2, 20) RETURNING product_id`,
      [category.rows[0].category_id, `Restock API ${randomUUID()}`],
    );
    const productId = product.rows[0].product_id;
    fixture.productIds.push(productId);
    const slot = await pool.query(
      `INSERT INTO machine_slots (machine_id, slot_code, capacity)
       VALUES ($1, $2, 10) RETURNING slot_id`,
      [machineId, `R${randomUUID().slice(0, 6).toUpperCase()}`],
    );
    const slotId = slot.rows[0].slot_id;
    fixture.slotIds.push(slotId);
    await pool.query(
      'INSERT INTO inventories (slot_id, product_id, quantity) VALUES ($1, $2, 2)',
      [slotId, productId],
    );

    await request(app)
      .post('/api/inventory/restocks')
      .send({ machineId, items: [{ slotId, quantity: 3 }] })
      .expect(401);

    const created = await request(app)
      .post('/api/inventory/restocks')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ machineId, notes: 'API test restock', items: [{ slotId, quantity: 3 }] })
      .expect(201);
    const restockId = created.body.data.restockEventId;
    fixture.restockIds.push(restockId);
    assert.equal(created.body.data.items[0].previousQuantity, 2);
    assert.equal(created.body.data.items[0].newQuantity, 5);
    assert.ok(created.body.data.items[0].slotCode);
    const inventory = await pool.query(
      'SELECT quantity FROM inventories WHERE slot_id = $1',
      [slotId],
    );
    assert.equal(inventory.rows[0].quantity, 5);

    await request(app)
      .post('/api/inventory/restocks')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ machineId, items: [{ slotId, quantity: 6 }] })
      .expect(409);
    assert.equal((await pool.query('SELECT quantity FROM inventories WHERE slot_id = $1', [slotId])).rows[0].quantity, 5);

    const detail = await request(app)
      .get(`/api/inventory/restocks/${restockId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    assert.equal(detail.body.data.items[0].addedQuantity, 3);

    const history = await request(app)
      .get(`/api/inventory/restocks?machineId=${machineId}&limit=1`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);
    assert.equal(history.body.pagination.limit, 1);
  });
});

describe('Admin alert APIs', () => {
  it('creates idempotent alerts and enforces the acknowledgement lifecycle', async () => {
    const payload = {
      machineId,
      alertType: 'ADMIN_API_TEST',
      severity: 'WARNING',
      message: `test alert ${randomUUID()}`,
      sourceKey: `admin-api-${randomUUID()}`,
    };
    const created = await request(app)
      .post('/api/admin/alerts')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(payload)
      .expect(201);
    const alertId = created.body.data.alertId;
    fixture.alertIds.push(alertId);

    const duplicate = await request(app)
      .post('/api/admin/alerts')
      .set('Authorization', `Bearer ${operatorToken}`)
      .send(payload)
      .expect(200);
    assert.equal(duplicate.body.idempotent, true);
    assert.equal(duplicate.body.data.alertId, alertId);

    const acknowledged = await request(app)
      .patch(`/api/admin/alerts/${alertId}/status`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .send({ status: 'ACKNOWLEDGED' })
      .expect(200);
    assert.equal(acknowledged.body.data.acknowledgedBy, operatorId);
  });

  it('creates and resolves persisted temperature alerts from machine telemetry', async () => {
    const machine = await pool.query(
      'SELECT machine_code FROM machines WHERE machine_id = $1',
      [machineId],
    );
    const telemetry = (temperature) => {
      const requestBuilder = request(app)
        .post('/api/machines/simulator/status')
        .send({
          machineCode: machine.rows[0].machine_code,
          machineState: 'IDLE',
          temperature,
          humidity: 60,
          doorStatus: 'CLOSED',
          sensorStatus: 'OK',
        });
      if (process.env.IOT_DEVICE_SECRET) {
        requestBuilder.set('x-iot-key', process.env.IOT_DEVICE_SECRET);
      }
      return requestBuilder;
    };

    await telemetry(9).expect(200);
    const active = await pool.query(
      `SELECT alert_id FROM alerts
       WHERE machine_id = $1 AND alert_type = 'TEMPERATURE_OUT_OF_RANGE'
         AND status IN ('OPEN', 'ACKNOWLEDGED')
       ORDER BY created_at DESC LIMIT 1`,
      [machineId],
    );
    assert.ok(active.rows[0], 'out-of-range telemetry should create a persisted alert');
    fixture.alertIds.push(active.rows[0].alert_id);

    await telemetry(4.5).expect(200);
    const resolved = await pool.query(
      'SELECT status FROM alerts WHERE alert_id = $1',
      [active.rows[0].alert_id],
    );
    assert.equal(resolved.rows[0].status, 'RESOLVED');
  });
});

describe('Admin report APIs', () => {
  it('lists orders/payments and returns date-filtered summary and sales groups', async () => {
    const orders = await request(app)
      .get('/api/admin/orders?from=2026-01-01&to=2027-01-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(orders.body.pagination.total >= 1);
    const orderId = orders.body.data[0].orderId;
    const order = await request(app)
      .get(`/api/admin/orders/${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(Array.isArray(order.body.data.items));
    assert.ok(Array.isArray(order.body.data.payments));

    const payments = await request(app)
      .get('/api/admin/payments?status=SUCCESS')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(payments.body.pagination.total >= 1);

    const summary = await request(app)
      .get('/api/admin/reports/summary?from=2026-01-01&to=2027-01-01')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(Number.isFinite(summary.body.data.grossRevenue));

    for (const groupBy of ['day', 'product', 'machine']) {
      const sales = await request(app)
        .get(`/api/admin/reports/sales?from=2026-01-01&to=2027-01-01&groupBy=${groupBy}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      assert.equal(sales.body.meta.groupBy, groupBy);
      assert.ok(Array.isArray(sales.body.data));
    }
  });
});
