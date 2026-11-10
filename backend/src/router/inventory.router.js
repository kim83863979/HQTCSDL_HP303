const express = require("express");
const router = express.Router();

const inventoryController = require("../modules/inventory/controller/inventory.controller");
const {
  authenticateToken,
  requirePermissions,
} = require("../modules/auth/auth.middleware");
const canManageInventory = [
  authenticateToken,
  requirePermissions("MANAGE_INVENTORY"),
];

// Sprint 1: Truy vấn tồn kho
router.get(
  "/machines/:machineId",
  inventoryController.getInventoryByMachine,
);
router.get(
  "/slots/:slotId",
  ...canManageInventory,
  inventoryController.getInventoryBySlot,
);

// Sprint 2: Kiểm tra tồn kho
router.get(
  "/availability",
  ...canManageInventory,
  inventoryController.checkAvailability,
);

// Sprint 2: Giữ hàng
router.post(
  "/reservations",
  ...canManageInventory,
  inventoryController.reserveInventory,
);

// Sprint 2: Xác nhận trừ kho
router.post(
  "/reservations/:reservationId/consume",
  ...canManageInventory,
  inventoryController.consumeReservation,
);

// Sprint 2: Giải phóng hàng
router.post(
  "/reservations/:reservationId/release",
  ...canManageInventory,
  inventoryController.releaseReservation,
);

module.exports = router;
