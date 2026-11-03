
const inventoryService = require("../service/inventory.service");

class InventoryController {
    async getInventoryByMachine(req, res, next) {
        try {
            const { machineId } = req.params;
            const result = await inventoryService.getInventoryByMachine(machineId);

            return res.status(200).json({
                success: true,
                message: "Get inventory by machine successfully",
                data: result
            });
        } catch (error) {
            return next(error);
        }
    }

    async getInventoryBySlot(req, res, next) {
        try {
            const { slotId } = req.params;
            const result = await inventoryService.getInventoryBySlot(slotId);

            return res.status(200).json({
                success: true,
                message: "Get inventory by slot successfully",
                data: result
            });
        } catch (error) {
            return next(error);
        }
    }
}

module.exports = new InventoryController();
