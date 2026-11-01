
const inventoryRepository = require("../repository/inventory.repository");

class InventoryService {
    // Lấy tồn kho theo máy
    async getInventoryByMachine(machineId) {
        if (!machineId) {
            const error = new Error("Machine ID is required");
            error.statusCode = 400;
            throw error;
        }

        const result =
            await inventoryRepository.getInventoryByMachine(machineId);

        if (result.length === 0 || !result[0].machine_id) {
            const error = new Error("Machine not found");
            error.statusCode = 404;
            throw error;
        }

        return result;
    }

    // Lấy tồn kho theo khe
    async getInventoryBySlot(slotId) {
        if (!slotId) {
            const error = new Error("Slot ID is required");
            error.statusCode = 400;
            throw error;
        }

        const result =
            await inventoryRepository.getInventoryBySlot(slotId);

        if (result.length === 0 || !result[0].slot_id) {
            const error = new Error("Slot not found");
            error.statusCode = 404;
            throw error;
        }

        return result;
    }
}

module.exports = new InventoryService();
