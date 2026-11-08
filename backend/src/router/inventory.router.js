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
router.get("/machines/:machineId", inventoryController.getInventoryByMachine);
router.get("/slots/:slotId", inventoryController.getInventoryBySlot);

// Sprint 2: Kiểm tra tồn kho
router.get("/availability", inventoryController.checkAvailability);

// Sprint 2: Giữ hàng
router.post("/reservations", inventoryController.reserveInventory);

// Sprint 2: Xác nhận trừ kho
router.post(
  "/reservations/:reservationId/consume",
  inventoryController.consumeReservation,
);

// Sprint 2: Giải phóng hàng
router.post(
  "/reservations/:reservationId/release",
  inventoryController.releaseReservation,
);

module.exports = router;
