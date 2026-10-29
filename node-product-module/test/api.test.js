// Test tich hop: can PostgreSQL da co bang va du lieu mau (db/sample-data.sql).
// Chay: DATABASE_URL=postgres://... npm test
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { pool } from '../src/config/db.js';

const app = createApp();
const CATEGORY_FRESH = '11111111-1111-1111-1111-111111111111';
const PRODUCT_APPLE = 'aaaaaaaa-0000-0000-0000-000000000001';
const MISSING_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

after(() => pool.end());

describe('GET /api/products', () => {
  it('tra danh sach co phan trang', async () => {
    const res = await request(app).get('/api/products').expect(200);
    assert.ok(Array.isArray(res.body.items));
    assert.equal(res.body.totalElements, 6);
    assert.equal(res.body.page, 0);
    assert.equal(res.body.size, 20);
  });

  it('loc theo danh muc', async () => {
    const res = await request(app).get(`/api/products?categoryId=${CATEGORY_FRESH}`).expect(200);
    assert.equal(res.body.items.length, 3);
    res.body.items.forEach((p) => assert.equal(p.category.id, CATEGORY_FRESH));
  });

  it('loc theo trang thai', async () => {
    const res = await request(app).get('/api/products?status=INACTIVE').expect(200);
    assert.equal(res.body.items.length, 1);
  });

  it('loc ra danh sach rong van tra 200', async () => {
    const res = await request(app).get('/api/products?status=KHONG_CO').expect(200);
    assert.deepEqual(res.body.items, []);
    assert.equal(res.body.totalElements, 0);
  });

  it('danh muc khong ton tai tra 404', async () => {
    await request(app).get(`/api/products?categoryId=${MISSING_ID}`).expect(404);
  });

  it('categoryId sai dinh dang tra 400', async () => {
    await request(app).get('/api/products?categoryId=abc').expect(400);
  });

  it('size qua lon tra 400', async () => {
    await request(app).get('/api/products?size=1000').expect(400);
  });
});

describe('GET /api/products/:id', () => {
  it('tra chi tiet san pham kem danh muc', async () => {
    const res = await request(app).get(`/api/products/${PRODUCT_APPLE}`).expect(200);
    assert.equal(res.body.name, 'Tao do');
    assert.equal(res.body.unitPrice, 15000);
    assert.equal(res.body.category.id, CATEGORY_FRESH);
  });

  it('id khong ton tai tra 404', async () => {
    const res = await request(app).get(`/api/products/${MISSING_ID}`).expect(404);
    assert.equal(res.body.status, 404);
  });

  it('id sai dinh dang tra 400', async () => {
    await request(app).get('/api/products/abc').expect(400);
  });
});

describe('GET /api/categories', () => {
  it('tra danh sach danh muc', async () => {
    const res = await request(app).get('/api/categories').expect(200);
    assert.equal(res.body.length, 3);
  });

  it('danh muc khong ton tai tra 404', async () => {
    await request(app).get(`/api/categories/${MISSING_ID}`).expect(404);
  });
});
