const assert = require('node:assert/strict');
const { after, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../src/config/db');

const hasDatabase = Boolean(process.env.DATABASE_URL);
const email = `sprint1-${randomUUID()}@example.test`;
const password = 'TestPass123';
const jwtSecret = process.env.JWT_SECRET || 'freshvend_dev_secret_change_in_production';

after(async () => {
  if (hasDatabase) {
    await pool.query('DELETE FROM users WHERE email = $1', [email]);
  }
  await pool.end();
});

describe('Auth API', () => {
  it('rejects invalid registration and login input', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'bad-email', fullname: 'Tester', password })
      .expect(400);

    await request(app)
      .post('/api/auth/login')
      .send({ email: 'bad-email', password })
      .expect(400);
  });

  it('registers as the default role and issues a valid login token', { skip: !hasDatabase }, async () => {
    const registered = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        fullname: 'Sprint One Tester',
        password,
        role: 'ADMIN',
      })
      .expect(201);

    assert.equal(registered.body.user.email, email);
    assert.equal(registered.body.user.role, 'OPERATOR');

    const loggedIn = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const decoded = jwt.verify(loggedIn.body.token, jwtSecret);
    assert.equal(decoded.email, email);
    assert.equal(decoded.role, 'OPERATOR');
  });

  it('rejects incorrect credentials', { skip: !hasDatabase }, async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPass123' })
      .expect(401);
  });
});
