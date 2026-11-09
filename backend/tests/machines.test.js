const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const jwt = require('jsonwebtoken');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../src/config/db');

const MACHINE_ID = '8fd61456-cef0-497a-8a4a-b88aa3aee00c';
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

describe('Machines API', () => {
  it('rejects machine queries without authentication', async () => {
    await request(app).get('/api/machines').expect(401);
  });

  it('lists machines', { skip: !hasDatabase }, async () => {
    const res = await request(app).get('/api/machines')
      .set('Authorization', `Bearer ${operatorToken}`).expect(200);
    assert.ok(Array.isArray(res.body.data));
  });

  it('returns a machine and its slots by UUID', { skip: !hasDatabase }, async () => {
    const res = await request(app).get(`/api/machines/${MACHINE_ID}`)
      .set('Authorization', `Bearer ${operatorToken}`).expect(200);
    assert.equal(res.body.data.id, MACHINE_ID);
    assert.ok(Array.isArray(res.body.data.slots));
  });

  it('lists slots for a machine', { skip: !hasDatabase }, async () => {
    const res = await request(app).get(`/api/machines/${MACHINE_ID}/slots`)
      .set('Authorization', `Bearer ${operatorToken}`).expect(200);
    assert.ok(Array.isArray(res.body.data));
  });

  it('rejects a malformed machine UUID', { skip: !hasDatabase }, async () => {
    const res = await request(app).get('/api/machines/not-a-uuid')
      .set('Authorization', `Bearer ${operatorToken}`).expect(400);
    assert.equal(res.body.errorCode, 'INVALID_MACHINE_ID');
  });

  it('returns 404 for an unknown machine UUID', { skip: !hasDatabase }, async () => {
    const res = await request(app).get(`/api/machines/${UNKNOWN_ID}`)
      .set('Authorization', `Bearer ${operatorToken}`).expect(404);
    assert.equal(res.body.errorCode, 'MACHINE_NOT_FOUND');
  });

  it('accepts simulator telemetry for the seeded machine', { skip: !hasDatabase }, async () => {
    const req = request(app)
      .post('/api/machines/simulator/status')
      .send({
        machineCode: 'VM001',
        machineState: 'IDLE',
        temperature: 4.6,
        humidity: 65,
        doorStatus: 'CLOSED',
        sensorStatus: 'OK',
      });

    if (process.env.IOT_DEVICE_SECRET) {
      req.set('x-iot-key', process.env.IOT_DEVICE_SECRET);
    }

    const res = await req.expect(200);
    assert.equal(res.body.data.machineCode, 'VM001');
    assert.equal(res.body.data.operationStatus, 'IDLE');
  });
});
