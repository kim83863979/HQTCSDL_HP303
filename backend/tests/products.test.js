// Integration tests for the active Product and Category API contracts.
// Requires the database migrations and seed data described in database/.

const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../src/config/db');

const MISSING_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const fixture = { productId: null, categoryId: null, productName: null, unitPrice: 7.25 };

before(async () => {
  const suffix = randomUUID();
  const category = await pool.query(
    `INSERT INTO categories (category_name, description)
     VALUES ($1, 'Isolated product API test fixture') RETURNING category_id`,
    [`Products API Test ${suffix}`],
  );
  fixture.categoryId = category.rows[0].category_id;
  const product = await pool.query(
    `INSERT INTO products (category_id, product_name, unit_price, status)
     VALUES ($1, $2, $3, 'ACTIVE') RETURNING product_id, product_name`,
    [fixture.categoryId, `Products API Test Item ${suffix}`, fixture.unitPrice],
  );
  fixture.productId = product.rows[0].product_id;
  fixture.productName = product.rows[0].product_name;
});

after(async () => {
  if (fixture.productId) await pool.query('DELETE FROM products WHERE product_id = $1', [fixture.productId]);
  if (fixture.categoryId) await pool.query('DELETE FROM categories WHERE category_id = $1', [fixture.categoryId]);
  await pool.end();
});

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
      .get(`/api/products?categoryId=${fixture.categoryId}&page=1&limit=1`)
      .expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.pagination.limit, 1);
    assert.ok(res.body.data.length <= 1);
    res.body.data.forEach((product) => {
      assert.equal(product.categoryId, fixture.categoryId);
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
      .get(`/api/products/${fixture.productId}`)
      .expect(200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.productId, fixture.productId);
    assert.equal(res.body.data.productName, fixture.productName);
    assert.equal(res.body.data.unitPrice, fixture.unitPrice);
    assert.equal(res.body.data.categoryId, fixture.categoryId);
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
      .get(`/api/categories/${fixture.categoryId}`)
      .expect(200);
    assert.equal(res.body.data.categoryId, fixture.categoryId);
    assert.ok(res.body.data.categoryName);
  });

  it('rejects unknown and malformed category IDs', async () => {
    await request(app).get(`/api/categories/${MISSING_ID}`).expect(404);
    await request(app).get('/api/categories/abc').expect(400);
  });
});
