// tests/products.test.js
// Kiểm thử tích hợp cho API Products & Categories.
// Yêu cầu: PostgreSQL đang chạy, database FreshVend đã có bảng và dữ liệu mẫu.
// Chạy dữ liệu mẫu trước: database/seeds/sample-products.sql
// Chạy test: DATABASE_URL=postgres://... npm test

const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const request = require('supertest');

// Load .env trước khi import app
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../src/config/db');

const MISSING_ID     = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const fixture = {};

before(async () => {
  const { rows } = await pool.query(
    `SELECT p.product_id, p.product_name, p.unit_price, c.category_id
     FROM products p
     JOIN categories c ON c.category_id = p.category_id
     ORDER BY p.product_name, p.product_id
     LIMIT 1`,
  );
  assert.ok(rows[0], 'Run the database migration and seed data before this test');
  Object.assign(fixture, rows[0]);
});

after(() => pool.end());

// ─── GET /api/products ────────────────────────────────────────────────────────
describe('GET /api/products', () => {
  it('trả danh sách có phân trang', async () => {
    const res = await request(app).get('/api/products').expect(200);
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.page, 0);
    assert.equal(res.body.size, 20);
    assert.ok(typeof res.body.totalElements === 'number');
  });

  it('lọc theo danh mục', async () => {
    const res = await request(app).get(`/api/products?categoryId=${fixture.category_id}`).expect(200);
    assert.ok(res.body.items.length > 0);
    res.body.items.forEach((p) => assert.equal(p.category.id, fixture.category_id));
  });

  it('lọc theo trạng thái INACTIVE', async () => {
    const res = await request(app).get('/api/products?status=INACTIVE').expect(200);
    res.body.items.forEach((p) => assert.equal(p.status, 'INACTIVE'));
  });

  it('lọc ra danh sách rỗng vẫn trả 200', async () => {
    const res = await request(app).get('/api/products?status=KHONG_CO').expect(200);
    assert.deepEqual(res.body.items, []);
    assert.equal(res.body.totalElements, 0);
  });

  it('danh mục không tồn tại trả 404', async () => {
    await request(app).get(`/api/products?categoryId=${MISSING_ID}`).expect(404);
  });

  it('categoryId sai định dạng trả 400', async () => {
    await request(app).get('/api/products?categoryId=abc').expect(400);
  });

  it('size quá lớn trả 400', async () => {
    await request(app).get('/api/products?size=1000').expect(400);
  });
});

// ─── GET /api/products/:id ────────────────────────────────────────────────────
describe('GET /api/products/:id', () => {
  it('trả chi tiết sản phẩm kèm danh mục', async () => {
    const res = await request(app).get(`/api/products/${fixture.product_id}`).expect(200);
    assert.equal(res.body.name, fixture.product_name);
    assert.equal(res.body.unitPrice, Number(fixture.unit_price));
    assert.equal(res.body.category.id, fixture.category_id);
  });

  it('id không tồn tại trả 404', async () => {
    const res = await request(app).get(`/api/products/${MISSING_ID}`).expect(404);
    assert.ok(res.body.message);
  });

  it('id sai định dạng trả 400', async () => {
    await request(app).get('/api/products/abc').expect(400);
  });
});

// ─── GET /api/categories ──────────────────────────────────────────────────────
describe('GET /api/categories', () => {
  it('trả danh sách danh mục', async () => {
    const res = await request(app).get('/api/categories').expect(200);
    assert.ok(Array.isArray(res.body));
  });

  it('chi tiết danh mục tồn tại trả 200', async () => {
    const res = await request(app).get(`/api/categories/${fixture.category_id}`).expect(200);
    assert.equal(res.body.id, fixture.category_id);
    assert.ok(res.body.name);
  });

  it('danh mục không tồn tại trả 404', async () => {
    await request(app).get(`/api/categories/${MISSING_ID}`).expect(404);
  });

  it('id danh mục sai định dạng trả 400', async () => {
    await request(app).get('/api/categories/abc').expect(400);
  });
});
