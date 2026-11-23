const { pool } = require('../../config/db');

async function findByEmail(email) {
  const result = await pool.query(
    `SELECT u.user_id, u.email, u.fullname, u.password_hash, r.name AS role
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.email = $1`,
    [email],
  );
  return result.rows[0] || null;
}

async function findById(userId) {
  const result = await pool.query(
    `SELECT u.user_id, u.email, u.fullname, r.name AS role
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.user_id = $1`,
    [userId],
  );
  return result.rows[0] || null;
}

async function create({ email, fullname, passwordHash, roleName = 'OPERATOR' }) {
  const result = await pool.query(
    `INSERT INTO users (role_id, email, fullname, password_hash)
     SELECT role_id, $1, $2, $3
     FROM roles
     WHERE name = $4
     RETURNING user_id`,
    [email, fullname, passwordHash, roleName],
  );
  if (!result.rowCount) return null;
  return findById(result.rows[0].user_id);
}

async function findAll() {
  const result = await pool.query(
    `SELECT u.user_id, u.email, u.fullname, r.name AS role
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     ORDER BY lower(u.email), u.user_id`,
  );
  return result.rows;
}

async function hasPermission(userId, permission) {
  const result = await pool.query(
    `SELECT 1
     FROM users u
     JOIN role_permissions rp ON rp.role_id = u.role_id
     JOIN permissions p ON p.permission_id = rp.permission_id
     WHERE u.user_id = $1 AND p.name = $2`,
    [userId, permission],
  );
  return result.rowCount > 0;
}

async function updateRoleSafely(userId, roleName) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('freshvend-admin-account-mutations'))");
    const current = await client.query(
      `SELECT u.user_id, r.name AS role
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 FOR UPDATE OF u`,
      [userId],
    );
    if (!current.rowCount) {
      await client.query('ROLLBACK');
      return { reason: 'NOT_FOUND' };
    }
    if (current.rows[0].role === 'ADMIN' && roleName !== 'ADMIN') {
      const admins = await client.query(
        `SELECT COUNT(*)::int AS count FROM users u
         JOIN roles r ON r.role_id = u.role_id WHERE r.name = 'ADMIN'`,
      );
      if (admins.rows[0].count <= 1) {
        await client.query('ROLLBACK');
        return { reason: 'LAST_ADMIN' };
      }
    }
    const result = await client.query(
      `UPDATE users u SET role_id = r.role_id
       FROM roles r WHERE u.user_id = $1 AND r.name = $2
       RETURNING u.user_id, u.email, u.fullname, r.name AS role`,
      [userId, roleName],
    );
    await client.query('COMMIT');
    return { user: result.rows[0] || null };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteUserSafely(userId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('freshvend-admin-account-mutations'))");
    const userResult = await client.query(
      `SELECT u.user_id, r.name AS role FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 FOR UPDATE OF u`,
      [userId],
    );
    if (!userResult.rowCount) {
      await client.query('ROLLBACK');
      return { reason: 'NOT_FOUND' };
    }
    const user = userResult.rows[0];
    if (!['ADMIN', 'OPERATOR'].includes(user.role)) {
      await client.query('ROLLBACK');
      return { reason: 'INVALID_ROLE' };
    }
    if (user.role === 'ADMIN') {
      const admins = await client.query(
        `SELECT COUNT(*)::int AS count FROM users u
         JOIN roles r ON r.role_id = u.role_id WHERE r.name = 'ADMIN'`,
      );
      if (admins.rows[0].count <= 1) {
        await client.query('ROLLBACK');
        return { reason: 'LAST_ADMIN' };
      }
    }
    const references = await client.query(
      'SELECT COUNT(*)::int AS count FROM public.restock_events WHERE user_id = $1',
      [userId],
    );
    if (references.rows[0].count > 0) {
      await client.query('ROLLBACK');
      return { reason: 'HAS_RESTOCK_HISTORY', count: references.rows[0].count };
    }
    const deleted = await client.query(
      'DELETE FROM users WHERE user_id = $1 RETURNING user_id',
      [userId],
    );
    await client.query('COMMIT');
    return { userId: deleted.rows[0]?.user_id || null };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function roleExists(roleName) {
  const result = await pool.query('SELECT 1 FROM roles WHERE name = $1', [roleName]);
  return result.rowCount > 0;
}

async function existsById(userId) {
  const result = await pool.query('SELECT 1 FROM users WHERE user_id = $1', [userId]);
  return result.rowCount > 0;
}

module.exports = {
  findByEmail,
  findById,
  create,
  findAll,
  hasPermission,
  updateRoleSafely,
  deleteUserSafely,
  roleExists,
  existsById,
};
