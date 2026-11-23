const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../src/config/db');
const jwtSecret = process.env.JWT_SECRET || 'freshvend_dev_secret_change_in_production';
const productIds = [];
let adminToken;
let operatorToken;
let categoryId;
let emptySlotId;

function tokenFor(user, role) {
  return jwt.sign({ email: user.email, role }, jwtSecret, {
    subject: user.user_id,
    expiresIn: '1h',
  });
}

before(async () => {
  const [admin, operator, category, slot] = await Promise.all([
    pool.query(
      `SELECT u.user_id, u.email FROM users u JOIN roles r USING (role_id)
       WHERE r.name = 'ADMIN' ORDER BY u.email LIMIT 1`,
    ),
    pool.query(
      `SELECT u.user_id, u.email FROM users u JOIN roles r USING (role_id)
       WHERE r.name = 'OPERATOR' ORDER BY u.email LIMIT 1`,
    ),
    pool.query('SELECT category_id FROM categories ORDER BY category_name LIMIT 1'),
    pool.query(
      `SELECT ms.slot_id FROM machine_slots ms
       WHERE ms.status = 'ACTIVE'
         AND NOT EXISTS (SELECT 1 FROM inventories i WHERE i.slot_id = ms.slot_id)
       ORDER BY ms.slot_code LIMIT 1`,
    ),
  ]);
  assert.ok(admin.rows[0] && operator.rows[0] && category.rows[0] && slot.rows[0]);
  adminToken = tokenFor(admin.rows[0], 'ADMIN');
  operatorToken = tokenFor(operator.rows[0], 'OPERATOR');
  categoryId = category.rows[0].category_id;
  emptySlotId = slot.rows[0].slot_id;
});

after(async () => {
  if (productIds.length) {
    await pool.query('DELETE FROM inventories WHERE product_id = ANY($1::uuid[])', [productIds]);
    await pool.query('DELETE FROM products WHERE product_id = ANY($1::uuid[])', [productIds]);
  }
  await pool.end();
});

describe('Admin product delete lifecycle', () => {
  async function createProduct() {
    const response = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        categoryId,
        productName: `Product delete test ${randomUUID()}`,
        unitPrice: 12,
      })
      .expect(201);
    productIds.push(response.body.data.productId);
    return response.body.data.productId;
  }

  it('requires Admin permission, deletes unused products, and reports image schema pending safely', async () => {
    const productId = await createProduct();
    await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(403);

    const upload = await request(app)
      .post(`/api/admin/products/${productId}/image`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('Content-Type', 'application/octet-stream')
      .set('X-Image-Content-Type', 'image/jpeg')
      .send(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0xff, 0xd9]))
      .expect(503);
    assert.equal(upload.body.code, 'PRODUCT_IMAGE_SCHEMA_PENDING');

    const deleted = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(deleted.body.data.deleted, true);
    const remaining = await pool.query('SELECT 1 FROM products WHERE product_id = $1', [productId]);
    assert.equal(remaining.rowCount, 0);
  });

  it('keeps inventory-linked products and moves them to INACTIVE', async () => {
    const productId = await createProduct();
    await pool.query(
      'INSERT INTO inventories (slot_id, product_id, quantity) VALUES ($1, $2, 1)',
      [emptySlotId, productId],
    );

    const response = await request(app)
      .delete(`/api/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.equal(response.body.data.deleted, false);
    assert.equal(response.body.data.status, 'INACTIVE');

    const retained = await pool.query(
      `SELECT p.status, i.quantity FROM products p
       JOIN inventories i USING (product_id) WHERE p.product_id = $1`,
      [productId],
    );
    assert.deepEqual(retained.rows[0], { status: 'INACTIVE', quantity: 1 });
  });
});
