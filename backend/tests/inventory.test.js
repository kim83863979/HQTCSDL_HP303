const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const jwt = require('jsonwebtoken');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../src/config/db');

const MACHINE_ID = '8fd61456-cef0-497a-8a4a-b88aa3aee00c';
const SLOT_ID = 'b120647d-32f6-4f5f-809c-695564b25a6b';
const UNKNOWN_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const hasDatabase = Boolean(process.env.DATABASE_URL);
const jwtSecret = process.env.JWT_SECRET || 'freshvend_dev_secret_change_in_production';
let operatorToken;

before(async () => {
  if (!hasDatabase) return;
  const result = await pool.query(
    `SELECT u.user_id, u.email
     FROM users u JOIN roles r USING(role_id)
     WHERE u.email = 'operator@freshvend.com' AND r.name = 'OPERATOR'`,
  );
  assert.equal(result.rowCount, 1, 'seeded OPERATOR account is required for API tests');
  operatorToken = jwt.sign(
    { email: result.rows[0].email, role: 'OPERATOR' },
    jwtSecret,
    { subject: result.rows[0].user_id, expiresIn: '1h' },
  );
});

after(() => pool.end());

describe('Inventory API', () => {
  it('rejects inventory queries without authentication', async () => {
    await request(app).get(`/api/inventory/machines/${MACHINE_ID}`).expect(401);
  });

  it('returns inventory for a machine', { skip: !hasDatabase }, async () => {
    const res = await request(app)
      .get(`/api/inventory/machines/${MACHINE_ID}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.some((row) => row.machine_id === MACHINE_ID));
  });

  it('returns inventory for a slot', { skip: !hasDatabase }, async () => {
    const res = await request(app)
      .get(`/api/inventory/slots/${SLOT_ID}`)
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.some((row) => row.slot_id === SLOT_ID));
  });

  it('rejects malformed machine and slot UUIDs', { skip: !hasDatabase }, async () => {
    await request(app).get('/api/inventory/machines/not-a-uuid')
      .set('Authorization', `Bearer ${operatorToken}`).expect(400);
    await request(app).get('/api/inventory/slots/not-a-uuid')
      .set('Authorization', `Bearer ${operatorToken}`).expect(400);
  });

  it('returns 404 for an unknown machine or slot UUID', { skip: !hasDatabase }, async () => {
    await request(app).get(`/api/inventory/machines/${UNKNOWN_ID}`)
      .set('Authorization', `Bearer ${operatorToken}`).expect(404);
    await request(app).get(`/api/inventory/slots/${UNKNOWN_ID}`)
      .set('Authorization', `Bearer ${operatorToken}`).expect(404);
  });
});
