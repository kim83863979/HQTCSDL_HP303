const express = require("express");
const router = express.Router();

const inventoryController = require("../modules/inventory/controller/inventory.controller");
const { authenticateToken, requirePermissions } = require("../modules/auth/auth.middleware");
const canManageInventory = [authenticateToken, requirePermissions("MANAGE_INVENTORY")];

router.get(
    "/machines/:machineId",
    ...canManageInventory,
    inventoryController.getInventoryByMachine
);

router.get(
    "/slots/:slotId",
    ...canManageInventory,
    inventoryController.getInventoryBySlot
);

module.exports = router;