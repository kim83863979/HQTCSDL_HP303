// Integration tests for the active Product and Category API contracts.
// Requires the database migrations and seed data described in database/.

const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../src/config/db');

const MISSING_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const fixture = {};

before(async () => {
  const { rows } = await pool.query(
    `SELECT p.product_id, p.product_name, p.unit_price, c.category_id
     FROM products p
     JOIN categories c ON c.category_id = p.category_id
     WHERE p.status = 'ACTIVE'
     ORDER BY p.product_name, p.product_id
     LIMIT 1`,
  );
  assert.ok(rows[0], 'Run the database migration and seed data before this test');
  Object.assign(fixture, rows[0]);
});

after(() => pool.end());

describe('GET /api/products', () => {
  it('returns active products with pagination', async () => {
    const res = await request(app).get('/api/products').expect(200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.pagination.page, 1);
    assert.equal(res.body.pagination.limit, 20);
    assert.ok(typeof res.body.pagination.total === 'number');
    res.body.data.forEach((product) => assert.equal(product.status, 'ACTIVE'));
  });

  it('filters by category and supports page/limit', async () => {
    const res = await request(app)
      .get(`/api/products?categoryId=${fixture.category_id}&page=1&limit=1`)
      .expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.pagination.limit, 1);
    assert.ok(res.body.data.length <= 1);
    res.body.data.forEach((product) => {
      assert.equal(product.categoryId, fixture.category_id);
      assert.equal(product.status, 'ACTIVE');
    });
  });

  it('returns an empty page for a category with no products', async () => {
    const res = await request(app)
      .get(`/api/products?categoryId=${MISSING_ID}`)
      .expect(200);
    assert.deepEqual(res.body.data, []);
    assert.equal(res.body.pagination.total, 0);
  });

  it('rejects invalid category IDs and pagination', async () => {
    await request(app).get('/api/products?categoryId=abc').expect(400);
    await request(app).get('/api/products?page=0').expect(400);
    await request(app).get('/api/products?limit=101').expect(400);
  });
});

describe('GET /api/products/:productId', () => {
  it('returns an active product with category information', async () => {
    const res = await request(app)
      .get(`/api/products/${fixture.product_id}`)
      .expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.productId, fixture.product_id);
    assert.equal(res.body.data.productName, fixture.product_name);
    assert.equal(res.body.data.unitPrice, Number(fixture.unit_price));
    assert.equal(res.body.data.categoryId, fixture.category_id);
  });

  it('returns 404 for a product that is not for sale', async () => {
    const res = await request(app)
      .get(`/api/products/${MISSING_ID}`)
      .expect(404);
    assert.equal(res.body.code, 'PRODUCT_NOT_FOUND');
  });

  it('rejects malformed product IDs', async () => {
    await request(app).get('/api/products/abc').expect(400);
  });
});

describe('GET /api/categories', () => {
  it('returns categories', async () => {
    const res = await request(app).get('/api/categories').expect(200);
    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
  });

  it('returns an existing category', async () => {
    const res = await request(app)
      .get(`/api/categories/${fixture.category_id}`)
      .expect(200);
    assert.equal(res.body.data.categoryId, fixture.category_id);
    assert.ok(res.body.data.categoryName);
  });

  it('rejects unknown and malformed category IDs', async () => {
    await request(app).get(`/api/categories/${MISSING_ID}`).expect(404);
    await request(app).get('/api/categories/abc').expect(400);
  });
});
