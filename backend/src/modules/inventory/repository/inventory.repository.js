
const { sequelize } = require("../../../model");
const { QueryTypes } = require("sequelize");

class InventoryRepository {
    // ==========================================
    // SPRINT 1: TRUY VẤN TỒN KHO
    // ==========================================

    // Lấy tồn kho theo máy
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
                i.reserved_quantity,
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

        return sequelize.query(sql, {
            replacements: { machineId },
            type: QueryTypes.SELECT
        });
    }

    // Lấy tồn kho theo khe
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
                i.reserved_quantity,
                i.updated_at
            FROM machine_slots ms
            LEFT JOIN inventories i
                ON ms.slot_id = i.slot_id
            LEFT JOIN products p
                ON i.product_id = p.product_id
            WHERE ms.slot_id = :slotId;
        `;

        return sequelize.query(sql, {
            replacements: { slotId },
            type: QueryTypes.SELECT
        });
    }

    // ==========================================
    // SPRINT 2: KHÓA VÀ KIỂM TRA TỒN KHO
    // ==========================================

    // Khóa dòng tồn kho trong transaction để tránh
    // nhiều đơn hàng cùng lấy một lượng hàng.
    async getInventoryForUpdate(slotId, productId, transaction) {
        const sql = `
            SELECT
                i.inventory_id,
                i.slot_id,
                i.product_id,
                i.quantity,
                i.reserved_quantity,
                ms.machine_id,
                ms.status AS slot_status,
                p.status AS product_status
            FROM inventories i
            INNER JOIN machine_slots ms
                ON i.slot_id = ms.slot_id
            INNER JOIN products p
                ON i.product_id = p.product_id
            WHERE i.slot_id = :slotId
              AND i.product_id = :productId
            FOR UPDATE OF i;
        `;

        const result = await sequelize.query(sql, {
            replacements: { slotId, productId },
            type: QueryTypes.SELECT,
            transaction
        });

        return result[0] || null;
    }

    // ==========================================
    // SPRINT 2: GIỮ HÀNG
    // ==========================================

    // Tăng số lượng hàng đang được giữ
    async increaseReservedQuantity(inventoryId, quantity, transaction) {
        const sql = `
            UPDATE inventories
            SET reserved_quantity = reserved_quantity + :quantity,
                updated_at = CURRENT_TIMESTAMP
            WHERE inventory_id = :inventoryId
              AND quantity - reserved_quantity >= :quantity
            RETURNING inventory_id, quantity, reserved_quantity;
        `;

        const result = await sequelize.query(sql, {
            replacements: { inventoryId, quantity },
            type: QueryTypes.SELECT,
            transaction
        });

        return result[0] || null;
    }

    // Tạo bản ghi giữ hàng
    async createReservation(orderItemId, inventoryId, quantity, transaction) {
        const sql = `
            INSERT INTO inventory_reservations (
                order_item_id,
                inventory_id,
                quantity,
                status
            )
            VALUES (
                :orderItemId,
                :inventoryId,
                :quantity,
                'RESERVED'
            )
            RETURNING *;
        `;

        const result = await sequelize.query(sql, {
            replacements: {
                orderItemId,
                inventoryId,
                quantity
            },
            type: QueryTypes.SELECT,
            transaction
        });

        return result[0];
    }

    // ==========================================
    // SPRINT 2: LẤY THÔNG TIN RESERVATION
    // ==========================================

    // Khóa bản ghi reservation khi xử lý
    async getReservationForUpdate(reservationId, transaction) {
        const sql = `
            SELECT
                reservation_id,
                order_item_id,
                inventory_id,
                quantity,
                status
            FROM inventory_reservations
            WHERE reservation_id = :reservationId
            FOR UPDATE;
        `;

        const result = await sequelize.query(sql, {
            replacements: { reservationId },
            type: QueryTypes.SELECT,
            transaction
        });

        return result[0] || null;
    }

    // ==========================================
    // SPRINT 2: THANH TOÁN THÀNH CÔNG
    // ==========================================

    // Trừ tồn kho thực tế và giảm số lượng đang giữ
    async consumeReservation(reservationId, transaction) {
        const reservation = await this.getReservationForUpdate(
            reservationId,
            transaction
        );

        if (!reservation || reservation.status !== "RESERVED") {
            return null;
        }

        const updateInventorySql = `
            UPDATE inventories
            SET quantity = quantity - :quantity,
                reserved_quantity = reserved_quantity - :quantity,
                updated_at = CURRENT_TIMESTAMP
            WHERE inventory_id = :inventoryId
              AND quantity >= :quantity
              AND reserved_quantity >= :quantity
            RETURNING inventory_id, quantity, reserved_quantity;
        `;

        const inventoryResult = await sequelize.query(updateInventorySql, {
            replacements: {
                inventoryId: reservation.inventory_id,
                quantity: reservation.quantity
            },
            type: QueryTypes.SELECT,
            transaction
        });

        if (!inventoryResult[0]) {
            throw new Error("Không đủ tồn kho để xác nhận đơn hàng");
        }

        const updateReservationSql = `
            UPDATE inventory_reservations
            SET status = 'CONSUMED',
                resolved_at = CURRENT_TIMESTAMP
            WHERE reservation_id = :reservationId
              AND status = 'RESERVED'
            RETURNING *;
        `;

        const result = await sequelize.query(updateReservationSql, {
            replacements: { reservationId },
            type: QueryTypes.SELECT,
            transaction
        });

        return result[0] || null;
    }

    // ==========================================
    // SPRINT 2: GIẢI PHÓNG HÀNG
    // ==========================================

    // Hủy giữ hàng khi thanh toán thất bại hoặc đơn bị hủy
    async releaseReservation(reservationId, transaction) {
        const reservation = await this.getReservationForUpdate(
            reservationId,
            transaction
        );

        if (!reservation || reservation.status !== "RESERVED") {
            return null;
        }

        const updateInventorySql = `
            UPDATE inventories
            SET reserved_quantity = reserved_quantity - :quantity,
                updated_at = CURRENT_TIMESTAMP
            WHERE inventory_id = :inventoryId
              AND reserved_quantity >= :quantity
            RETURNING inventory_id, quantity, reserved_quantity;
        `;

        const inventoryResult = await sequelize.query(updateInventorySql, {
            replacements: {
                inventoryId: reservation.inventory_id,
                quantity: reservation.quantity
            },
            type: QueryTypes.SELECT,
            transaction
        });

        if (!inventoryResult[0]) {
            throw new Error("Không thể giải phóng số lượng hàng đã giữ");
        }

        const updateReservationSql = `
            UPDATE inventory_reservations
            SET status = 'RELEASED',
                resolved_at = CURRENT_TIMESTAMP
            WHERE reservation_id = :reservationId
              AND status = 'RESERVED'
            RETURNING *;
        `;

        const result = await sequelize.query(updateReservationSql, {
            replacements: { reservationId },
            type: QueryTypes.SELECT,
            transaction
        });

        return result[0] || null;
    }
}

module.exports = new InventoryRepository();
