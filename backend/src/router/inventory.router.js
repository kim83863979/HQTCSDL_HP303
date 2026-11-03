const express = require("express");
const router = express.Router();

const inventoryController = require("../modules/inventory/controller/inventory.controller");

router.get(
    "/machines/:machineId",
    inventoryController.getInventoryByMachine
);

router.get(
    "/slots/:slotId",
    inventoryController.getInventoryBySlot
);

module.exports = router;