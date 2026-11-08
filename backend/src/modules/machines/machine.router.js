const express = require("express");
const router = express.Router();
const machineController = require("./machine.controller");
const verifyIotDevice = require("../../middleware/verifyIotDevice");
const { authenticateToken, requirePermissions } = require("../auth/auth.middleware");

const canViewMachines = [authenticateToken, requirePermissions("VIEW_MACHINE")];

router.get("/", ...canViewMachines, machineController.getAllMachines);
router.post(
  "/simulator/status",
  verifyIotDevice,
  machineController.receiveSimulatorStatus
);
router.get("/:id", ...canViewMachines, machineController.getMachineById);
router.get("/:id/slots", ...canViewMachines, machineController.getMachineSlots);

module.exports = router;