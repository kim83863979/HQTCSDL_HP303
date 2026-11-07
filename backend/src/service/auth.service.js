// src/service/auth.service.js
// Business logic xác thực: đăng ký, đăng nhập.
// Dùng pool pg trực tiếp — không dùng Sequelize.
// Schema ERD: users(user_id, role_id, email, fullname, password_hash)
//             roles(role_id, name)

const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

const BCRYPT_ROUNDS = 10;

/**
 * Đăng ký tài khoản mới.
 * @param {string} email
 * @param {string} fullname
 * @param {string} password   - mật khẩu plain text
 * @param {string} [roleName] - 'ADMIN' | 'OPERATOR' | … (mặc định 'OPERATOR')
 */
const registerUser = async (email, fullname, password, roleName = 'OPERATOR') => {
  // 1. Kiểm tra email đã tồn tại chưa
  const existing = await pool.query('SELECT user_id FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) {
    return { success: false, message: 'Email đã được sử dụng.' };
  }

  // 2. Lấy role_id theo tên role
  const roleResult = await pool.query('SELECT role_id FROM roles WHERE name = $1', [roleName]);
  if (roleResult.rowCount === 0) {
    return { success: false, message: `Role '${roleName}' không tồn tại trong hệ thống.` };
  }
  const roleId = roleResult.rows[0].role_id;

  // 3. Hash mật khẩu
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  // 4. INSERT user mới
  const insertResult = await pool.query(
    `INSERT INTO users (role_id, email, fullname, password_hash)
     VALUES ($1, $2, $3, $4)
     RETURNING user_id, email, fullname`,
    [roleId, email.toLowerCase().trim(), fullname.trim(), passwordHash],
  );

  const user = insertResult.rows[0];
  return {
    success: true,
    user: {
      id:       user.user_id,
      email:    user.email,
      fullname: user.fullname,
      role:     roleName,
    },
  };
};

/**
 * Đăng nhập.
 * @param {string} email
 * @param {string} password
 */
const loginUser = async (email, password) => {
  // Lấy user kèm tên role
  const result = await pool.query(
    `SELECT u.user_id, u.email, u.fullname, u.password_hash, r.name AS role_name
     FROM users u
     JOIN roles r ON r.role_id = u.role_id
     WHERE u.email = $1`,
    [email.toLowerCase().trim()],
  );

  if (result.rowCount === 0) {
    return { success: false, message: 'Email không tồn tại.' };
  }

  const user = result.rows[0];

  // So sánh mật khẩu
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    return { success: false, message: 'Mật khẩu không đúng.' };
  }

  return {
    success: true,
    user: {
      id:       user.user_id,
      email:    user.email,
      fullname: user.fullname,
      role:     user.role_name,
    },
  };
};

module.exports = { registerUser, loginUser };
