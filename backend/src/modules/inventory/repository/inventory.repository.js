
const { sequelize } = require("../../../model");
const { QueryTypes } = require("sequelize");

class InventoryRepository {
    // Truy vấn tồn kho theo máy
    async getInventoryByMachine(machineId) {
        const sql = `
            SELECT
                m.machine_id,
                ms.slot_id,
                ms.slot_code,
                ms.capacity,
                ms.status AS slot_status,
                i.inventory_id,
                i.product_id,
                p.product_name,
                p.description AS product_description,
                p.unit_price,
                p.status AS product_status,
                i.quantity,
                i.updated_at
            FROM machines m
            LEFT JOIN machine_slots ms
                ON m.machine_id = ms.machine_id
            LEFT JOIN inventories i
                ON ms.slot_id = i.slot_id
            LEFT JOIN products p
                ON i.product_id = p.product_id
            WHERE m.machine_id = :machineId
            ORDER BY ms.slot_code;
        `;

        return await sequelize.query(sql, {
            replacements: { machineId },
            type: QueryTypes.SELECT
        });
    }

    // Truy vấn tồn kho theo khe
    async getInventoryBySlot(slotId) {
        const sql = `
            SELECT
                ms.slot_id,
                ms.machine_id,
                ms.slot_code,
                ms.capacity,
                ms.status AS slot_status,
                i.inventory_id,
                i.product_id,
                p.product_name,
                p.description AS product_description,
                p.unit_price,
                p.status AS product_status,
                i.quantity,
                i.updated_at
            FROM machine_slots ms
            LEFT JOIN inventories i
                ON ms.slot_id = i.slot_id
            LEFT JOIN products p
                ON i.product_id = p.product_id
            WHERE ms.slot_id = :slotId;
        `;

        return await sequelize.query(sql, {
            replacements: { slotId },
            type: QueryTypes.SELECT
        });
    }
}

module.exports = new InventoryRepository();
