// src/controller/auth.controller.js
// Xử lý HTTP request cho đăng ký và đăng nhập.
// Trường đăng nhập: email + password (theo ERD bảng users).

const jwt = require('jsonwebtoken');
const { registerUser, loginUser } = require('../service/auth.service');

const SECRET_KEY  = process.env.JWT_SECRET || 'freshvend_dev_secret_change_in_production';
const TOKEN_TTL   = process.env.JWT_EXPIRES_IN || '8h';

/** POST /api/auth/register */
const register = async (req, res) => {
  try {
    const { email, fullname, password } = req.body;

    if (!email || !fullname || !password) {
      return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (email, fullname, password).' });
    }

    const result = await registerUser(email, fullname, password);

    if (!result.success) {
      return res.status(400).json({ message: result.message });
    }

    return res.status(201).json({
      message: 'Đăng ký thành công.',
      user: result.user,
    });
  } catch (error) {
    console.error('[AuthController] register error:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
  }
};

/** POST /api/auth/login */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Thiếu email hoặc password.' });
    }

    const result = await loginUser(email, password);

    if (!result.success) {
      return res.status(401).json({ message: result.message });
    }

    const token = jwt.sign(
      { id: result.user.id, email: result.user.email, role: result.user.role },
      SECRET_KEY,
      { expiresIn: TOKEN_TTL },
    );

    return res.status(200).json({
      message: 'Đăng nhập thành công.',
      token,
      user: result.user,
    });
  } catch (error) {
    console.error('[AuthController] login error:', error);
    return res.status(500).json({ message: 'Lỗi máy chủ. Vui lòng thử lại sau.' });
  }
};

module.exports = { register, login };
