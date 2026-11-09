const jwt = require('jsonwebtoken');
const userRepository = require('./user.repository');
const { getJwtSecret } = require('./auth.config');

function authenticateToken(req, res, next) {
  const authorization = req.get('authorization');
  const match = typeof authorization === 'string'
    ? authorization.match(/^Bearer\s+(\S+)$/i)
    : null;
  if (!match) {
    return res.status(401).json({ message: 'Thiếu hoặc sai định dạng Bearer token.' });
  }

  let secret;
  try {
    secret = getJwtSecret();
  } catch (error) {
    return next(error);
  }

  try {
    const payload = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
    if (!payload || typeof payload.sub !== 'string') {
      return res.status(401).json({ message: 'Token không hợp lệ.' });
    }
    req.auth = { userId: payload.sub, email: payload.email, role: payload.role };
    return next();
  } catch {
    return res.status(401).json({ message: 'Token hết hạn hoặc không hợp lệ.' });
  }
}

function requirePermissions(...permissions) {
  return async (req, res, next) => {
    try {
      const granted = await Promise.all(
        permissions.map((permission) => userRepository.hasPermission(req.auth.userId, permission)),
      );
      if (granted.some((allowed) => !allowed)) {
        return res.status(403).json({ message: 'Bạn không có quyền thực hiện chức năng này.' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

function requireRoles(...roles) {
  return async (req, res, next) => {
    try {
      const user = await userRepository.findById(req.auth.userId);
      if (!user) return res.status(401).json({ message: 'Tài khoản không còn tồn tại.' });
      req.auth.role = user.role;
      if (!roles.includes(user.role)) {
        return res.status(403).json({ message: 'Bạn không có quyền thực hiện chức năng này.' });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = { authenticateToken, requirePermissions, requireRoles };
