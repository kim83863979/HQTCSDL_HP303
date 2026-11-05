
const inventoryRepository = require("../repository/inventory.repository");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const requireUuid = (id, label) => {
    if (!id || !UUID_RE.test(id)) {
        const error = new Error(`${label} must be a valid UUID`);
        error.status = 400;
        throw error;
    }
};

class InventoryService {
    // Lấy tồn kho theo máy
    async getInventoryByMachine(machineId) {
        requireUuid(machineId, "Machine ID");

        const result =
            await inventoryRepository.getInventoryByMachine(machineId);

        if (result.length === 0 || !result[0].machine_id) {
            const error = new Error("Machine not found");
            error.status = 404;
            throw error;
        }

        return result;
    }

    // Lấy tồn kho theo khe
    async getInventoryBySlot(slotId) {
        requireUuid(slotId, "Slot ID");

        const result =
            await inventoryRepository.getInventoryBySlot(slotId);

        if (result.length === 0 || !result[0].slot_id) {
            const error = new Error("Slot not found");
            error.status = 404;
            throw error;
        }

        return result;
    }
}

module.exports = new InventoryService();
