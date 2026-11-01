const express = require("express");
const router = express.Router();
const machineController = require("./machine.controller");
const verifyIotDevice = require("../../middleware/verifyIotDevice");

router.get("/", machineController.getAllMachines);
router.post(
  "/simulator/status",
  verifyIotDevice,
  machineController.receiveSimulatorStatus
);
router.get("/:id", machineController.getMachineById);
router.get("/:id/slots", machineController.getMachineSlots);

module.exports = router;