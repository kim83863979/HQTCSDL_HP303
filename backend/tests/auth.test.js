const assert = require('node:assert/strict');
const { after, before, describe, it } = require('node:test');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const app = require('../app');
const { pool } = require('../src/config/db');

const hasDatabase = Boolean(process.env.DATABASE_URL);
const email = `sprint1-${randomUUID()}@example.test`;
const operatorEmail = `sprint1-operator-${randomUUID()}@example.test`;
const adminEmail = `sprint1-admin-${randomUUID()}@example.test`;
const adminCreatedEmail = `admin-created-${randomUUID()}@example.test`;
const password = 'TestPass123';
const jwtSecret = process.env.JWT_SECRET || 'freshvend_dev_secret_change_in_production';
let operatorId;
let adminId;

before(async () => {
  if (!hasDatabase) return;
  const passwordHash = await bcrypt.hash(password, 10);
  const operator = await pool.query(
    `INSERT INTO users (role_id, email, fullname, password_hash)
     SELECT role_id, $1, 'Auth test operator', $2 FROM roles WHERE name = 'OPERATOR'
     RETURNING user_id`,
    [operatorEmail, passwordHash],
  );
  const admin = await pool.query(
    `INSERT INTO users (role_id, email, fullname, password_hash)
     SELECT role_id, $1, 'Auth test admin', $2 FROM roles WHERE name = 'ADMIN'
     RETURNING user_id`,
    [adminEmail, passwordHash],
  );
  operatorId = operator.rows[0].user_id;
  adminId = admin.rows[0].user_id;
});

after(async () => {
  if (hasDatabase) {
    await pool.query(
      'DELETE FROM users WHERE email = ANY($1::text[])',
      [[email, operatorEmail, adminEmail, adminCreatedEmail]],
    );
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
    assert.equal(Object.hasOwn(registered.body.user, 'password_hash'), false);

    const loggedIn = await request(app)
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);

    const decoded = jwt.verify(loggedIn.body.token, jwtSecret);
    assert.equal(decoded.email, email);
    assert.equal(decoded.role, 'OPERATOR');
    assert.equal(decoded.sub, registered.body.user.id);
  });

  it('rejects incorrect credentials', { skip: !hasDatabase }, async () => {
    await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'WrongPass123' })
      .expect(401);
  });

  it('authenticates bearer tokens and enforces database-backed MANAGE_USER permission', {
    skip: !hasDatabase,
  }, async () => {
    const noToken = await request(app).get('/api/admin/users').expect(401);
    assert.match(noToken.body.message, /Bearer token/);

    await request(app)
      .get('/api/admin/users')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    const operatorToken = jwt.sign(
      { email: operatorEmail, role: 'ADMIN' },
      jwtSecret,
      { subject: operatorId, expiresIn: '1h' },
    );
    await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(403);
    const operatorPermission = await pool.query(
      `SELECT rp.role_id, rp.permission_id
       FROM role_permissions rp
       JOIN roles r ON r.role_id = rp.role_id
       JOIN permissions p ON p.permission_id = rp.permission_id
       WHERE r.name = 'OPERATOR' AND p.name = 'MANAGE_USER'`,
    );
    let temporaryPermission;
    if (!operatorPermission.rowCount) {
      const insertedPermission = await pool.query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT r.role_id, p.permission_id
         FROM roles r CROSS JOIN permissions p
         WHERE r.name = 'OPERATOR' AND p.name = 'MANAGE_USER'
         RETURNING role_id, permission_id`,
      );
      temporaryPermission = insertedPermission.rows[0];
    }
    try {
      await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({
          email: adminCreatedEmail,
          fullname: 'Created By Operator',
          password,
          role: 'ADMIN',
        })
        .expect(403);
      await request(app)
        .patch(`/api/admin/users/${adminId}/role`)
        .set('Authorization', `Bearer ${operatorToken}`)
        .send({ role: 'OPERATOR' })
        .expect(403);
    } finally {
      if (temporaryPermission) {
        await pool.query(
          `DELETE FROM role_permissions
           WHERE role_id = $1 AND permission_id = $2`,
          [temporaryPermission.role_id, temporaryPermission.permission_id],
        );
      }
    }

    const adminToken = jwt.sign(
      { email: adminEmail, role: 'OPERATOR' },
      jwtSecret,
      { subject: adminId, expiresIn: '1h' },
    );
    await request(app)
      .patch(`/api/admin/users/${adminId.toUpperCase()}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'OPERATOR' })
      .expect(400);

    const response = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    assert.ok(response.body.users.length > 0);
    assert.equal(Object.hasOwn(response.body.users[0], 'password_hash'), false);

    await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: adminCreatedEmail,
        fullname: 'Admin Created User',
        password,
        role: 'ADMIN',
      })
      .expect(201)
      .expect(({ body }) => {
        assert.equal(body.user.email, adminCreatedEmail);
        assert.equal(body.user.fullname, 'Admin Created User');
        assert.equal(body.user.role, 'ADMIN');
        assert.equal(Object.hasOwn(body.user, 'password_hash'), false);
      });

    const createdUser = await pool.query(
      'SELECT password_hash FROM users WHERE email = $1',
      [adminCreatedEmail],
    );
    assert.equal(await bcrypt.compare(password, createdUser.rows[0].password_hash), true);

    await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: adminCreatedEmail,
        fullname: 'Duplicate User',
        password,
        role: 'OPERATOR',
      })
      .expect(409);

    await request(app)
      .post('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        email: `invalid-role-${randomUUID()}@example.test`,
        fullname: 'Invalid Role User',
        password,
        role: 'SUPERADMIN',
      })
      .expect(400);

    const createdLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: adminCreatedEmail, password })
      .expect(200);
    assert.equal(createdLogin.body.user.role, 'ADMIN');

    const changedRole = await request(app)
      .patch(`/api/admin/users/${operatorId}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'ADMIN' })
      .expect(200);
    assert.equal(changedRole.body.user.role, 'ADMIN');
    await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${operatorToken}`)
      .expect(200);

    await pool.query(
      `UPDATE users SET role_id = (SELECT role_id FROM roles WHERE name = 'OPERATOR')
       WHERE user_id = $1`,
      [operatorId],
    );
    await pool.query(
      `UPDATE users SET role_id = (SELECT role_id FROM roles WHERE name = 'OPERATOR')
       WHERE user_id = $1`,
      [adminId],
    );
    await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(403);
  });
});
