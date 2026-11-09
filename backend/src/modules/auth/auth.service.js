const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const userRepository = require('./user.repository');
const { AuthError } = require('./auth.errors');
const { getJwtSecret } = require('./auth.config');

const BCRYPT_ROUNDS = 10;
const TOKEN_TTL = process.env.JWT_EXPIRES_IN || '8h';

function publicUser(user) {
  return {
    id: user.user_id,
    email: user.email,
    fullname: user.fullname,
    role: user.role,
  };
}

async function register({ email, fullname, password }) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  try {
    const user = await userRepository.create({
      email: email.toLowerCase().trim(),
      fullname: fullname.trim(),
      passwordHash,
    });
    if (!user) throw new AuthError(500, 'Không thể gán role OPERATOR cho tài khoản mới.');
    return publicUser(user);
  } catch (error) {
    if (error.code === '23505') {
      throw new AuthError(409, 'Email đã được sử dụng.');
    }
    throw error;
  }
}

async function login({ email, password }) {
  const user = await userRepository.findByEmail(email.toLowerCase().trim());
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new AuthError(401, 'Email hoặc mật khẩu không đúng.');
  }

  const token = jwt.sign(
    { email: user.email, role: user.role },
    getJwtSecret(),
    { subject: user.user_id, expiresIn: TOKEN_TTL, algorithm: 'HS256' },
  );
  return { token, user: publicUser(user) };
}

async function getProfile(userId) {
  const user = await userRepository.findById(userId);
  if (!user) throw new AuthError(401, 'Tài khoản không còn tồn tại hoặc không hợp lệ.');
  return publicUser(user);
}

async function listUsers() {
  return userRepository.findAll();
}

async function changeUserRole(userId, roleName, requesterId) {
  if (!['ADMIN', 'OPERATOR'].includes(roleName)) {
    throw new AuthError(400, 'role chỉ nhận ADMIN hoặc OPERATOR.');
  }
  if (userId.toLowerCase() === requesterId.toLowerCase()) {
    throw new AuthError(400, 'Không thể tự thay đổi role của chính mình.');
  }

  if (!(await userRepository.roleExists(roleName))) {
    throw new AuthError(500, `Role ${roleName} chưa được khởi tạo trong database.`);
  }
  const user = await userRepository.updateRole(userId, roleName);
  if (!user) throw new AuthError(404, 'Không tìm thấy người dùng.');
  return publicUser(user);
}

module.exports = { register, login, getProfile, listUsers, changeUserRole };
