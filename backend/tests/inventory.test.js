const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../src/config/db');

const MACHINE_ID = '8fd61456-cef0-497a-8a4a-b88aa3aee00c';
const SLOT_ID = 'b120647d-32f6-4f5f-809c-695564b25a6b';
const UNKNOWN_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const hasDatabase = Boolean(process.env.DATABASE_URL);

after(() => pool.end());

describe('Inventory API', () => {
  it('returns inventory for a machine', { skip: !hasDatabase }, async () => {
    const res = await request(app)
      .get(`/api/inventory/machines/${MACHINE_ID}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.some((row) => row.machine_id === MACHINE_ID));
  });

  it('returns inventory for a slot', { skip: !hasDatabase }, async () => {
    const res = await request(app)
      .get(`/api/inventory/slots/${SLOT_ID}`)
      .expect(200);

    assert.equal(res.body.success, true);
    assert.ok(Array.isArray(res.body.data));
    assert.ok(res.body.data.some((row) => row.slot_id === SLOT_ID));
  });

  it('rejects malformed machine and slot UUIDs', async () => {
    await request(app).get('/api/inventory/machines/not-a-uuid').expect(400);
    await request(app).get('/api/inventory/slots/not-a-uuid').expect(400);
  });

  it('returns 404 for an unknown machine or slot UUID', { skip: !hasDatabase }, async () => {
    await request(app).get(`/api/inventory/machines/${UNKNOWN_ID}`).expect(404);
    await request(app).get(`/api/inventory/slots/${UNKNOWN_ID}`).expect(404);
  });
});
