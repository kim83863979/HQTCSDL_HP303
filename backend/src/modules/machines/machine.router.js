// src/modules/machines/machine.router.js
const express = require("express");
const router = express.Router();
const machineController = require("./machine.controller");
const verifyIotDevice = require("../../middleware/verifyIotDevice");
const {
  authenticateToken,
  requirePermissions,
  requireRoles,
} = require("../auth/auth.middleware");
const canViewMachines = [authenticateToken, requirePermissions("VIEW_MACHINE")];
const canManageSlots = [authenticateToken, requireRoles("ADMIN", "OPERATOR")];

// ─── Các endpoint Sprint 1 ────────────────────────────────────────────────────
router.get("/", ...canViewMachines, machineController.getAllMachines);
router.post(
  "/simulator/status",
  verifyIotDevice,
  machineController.receiveSimulatorStatus,
);

// ─── Các endpoint Sprint 2 (Phụ trách: HẢI) ──────────────────────────────────
router.get(
  "/orders/:orderId/dispense-plan",
  ...canViewMachines,
  machineController.getOrderDispensePlan,
);
router.get(
  "/:id/consistency-check",
  ...canViewMachines,
  machineController.checkConsistency,
);
router.post(
  "/:id/resolve-order-slots",
  ...canViewMachines,
  machineController.resolveOrderSlots,
);
router.post(
  "/:id/slots",
  ...canManageSlots,
  machineController.createSlot,
);
router.patch(
  "/:id/slots/:slotId/status",
  ...canManageSlots,
  machineController.updateSlotStatus,
);

// ─── Chi tiết máy và danh sách khe ────────────────────────────────────────────
router.get("/:id", ...canViewMachines, machineController.getMachineById);
router.get("/:id/slots", ...canViewMachines, machineController.getMachineSlots);
module.exports = router;
