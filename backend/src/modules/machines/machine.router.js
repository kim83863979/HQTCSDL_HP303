// src/modules/machines/machine.router.js
const express = require('express');
const router = express.Router();
const machineController = require('./machine.controller');
const verifyIotDevice = require('../../middleware/verifyIotDevice');
const verifyToken = require('../../middleware/verifyToken');

// Các UUID của ADMIN và OPERATOR trong bảng roles (từ dump-FreshVend-202611011643.sql)
const ALLOWED_ROLE_IDS = [
  '2089312e-f84f-4928-a892-0a4ea44e688a', // ADMIN
  '42f83904-588e-4c05-b677-24a12967f709', // OPERATOR
];

const requireOperatorOrAdmin = (req, res, next) => {
  const userRoleName = (req.user?.role || req.user?.roleName || '').toUpperCase();
  const userRoleId = req.user?.role_id || req.user?.roleId;

  if (userRoleName && !['ADMIN', 'OPERATOR'].includes(userRoleName)) {
    return res.status(403).json({
      success:   false,
      errorCode: 'FORBIDDEN',
      message:   'Bạn không có quyền quản lý khe máy.',
    });
  }
  if (userRoleId && !ALLOWED_ROLE_IDS.includes(userRoleId)) {
    return res.status(403).json({
      success:   false,
      errorCode: 'FORBIDDEN',
      message:   'Bạn không có quyền quản lý khe máy.',
    });
  }
  return next();
};

// ─── Các endpoint Sprint 1 ────────────────────────────────────────────────────
router.get('/', machineController.getAllMachines);
router.post('/simulator/status', verifyIotDevice, machineController.receiveSimulatorStatus);

// ─── Các endpoint Sprint 2 (Phụ trách: HẢI) ──────────────────────────────────
router.get('/orders/:orderId/dispense-plan', machineController.getOrderDispensePlan);
router.get('/:id/consistency-check', machineController.checkConsistency);
router.post('/:id/resolve-order-slots', machineController.resolveOrderSlots);
router.post('/:id/slots', verifyToken, requireOperatorOrAdmin, machineController.createSlot);
router.patch('/:id/slots/:slotId/status', verifyToken, requireOperatorOrAdmin, machineController.updateSlotStatus);

// ─── Chi tiết máy và danh sách khe ────────────────────────────────────────────
router.get('/:id', machineController.getMachineById);
router.get('/:id/slots', machineController.getMachineSlots);

module.exports = router;