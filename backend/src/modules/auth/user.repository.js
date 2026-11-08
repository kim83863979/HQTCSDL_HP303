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

async function create({ email, fullname, passwordHash }) {
  const result = await pool.query(
    `INSERT INTO users (role_id, email, fullname, password_hash)
     SELECT role_id, $1, $2, $3
     FROM roles
     WHERE name = 'OPERATOR'
     RETURNING user_id`,
    [email, fullname, passwordHash],
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

async function updateRole(userId, roleName) {
  const result = await pool.query(
    `UPDATE users u
     SET role_id = r.role_id
     FROM roles r
     WHERE u.user_id = $1 AND r.name = $2
     RETURNING u.user_id, u.email, u.fullname, r.name AS role`,
    [userId, roleName],
  );
  return result.rows[0] || null;
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
  updateRole,
  roleExists,
  existsById,
};
