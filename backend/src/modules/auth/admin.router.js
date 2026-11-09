const express = require('express');
const authService = require('./auth.service');
const { authenticateToken, requirePermissions } = require('./auth.middleware');
const { AuthError } = require('./auth.errors');
const { UUID_RE } = require('./auth.validation');

const router = express.Router();

router.use(authenticateToken, requirePermissions('MANAGE_USER'));

router.get('/users', async (req, res, next) => {
  try {
    return res.status(200).json({ users: await authService.listUsers() });
  } catch (error) {
    return next(error);
  }
});

router.patch('/users/:userId/role', async (req, res, next) => {
  const { userId } = req.params;
  if (!UUID_RE.test(userId)) {
    return res.status(400).json({ message: 'userId phải là UUID hợp lệ.' });
  }
  if (!req.body || typeof req.body.role !== 'string') {
    return res.status(400).json({ message: 'Thiếu role cần cập nhật.' });
  }

  try {
    const user = await authService.changeUserRole(userId, req.body.role, req.auth.userId);
    return res.status(200).json({ message: 'Cập nhật role thành công.', user });
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

module.exports = router;
