const authService = require('./auth.service');
const { AuthError } = require('./auth.errors');
const { validateRegister, validateLogin } = require('./auth.validation');

async function register(req, res, next) {
  const validationError = validateRegister(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  try {
    const user = await authService.register(req.body);
    return res.status(201).json({ message: 'Đăng ký thành công.', user });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function login(req, res, next) {
  const validationError = validateLogin(req.body);
  if (validationError) return res.status(400).json({ message: validationError });

  try {
    const result = await authService.login(req.body);
    return res.status(200).json({ message: 'Đăng nhập thành công.', ...result });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function profile(req, res, next) {
  try {
    const user = await authService.getProfile(req.auth.userId);
    return res.status(200).json({ user });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

module.exports = { register, login, profile };
