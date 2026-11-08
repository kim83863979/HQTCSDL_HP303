const { pool } = require('../../../config/db');

class InventoryRepository {

    // ==========================================
    // SPRINT 1: TRUY VẤN TỒN KHO
    // ==========================================

    // Lấy toàn bộ tồn kho của một máy.
    async getInventoryByMachine(machineId) {
        const sql = `
            SELECT
                m.machine_id,
                m.machine_code,
                m.machine_name,
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
                COALESCE(r.reserved_quantity, 0)::integer
                    AS reserved_quantity,
                (
                    i.quantity - COALESCE(r.reserved_quantity, 0)
                )::integer AS available_quantity,
                i.updated_at
            FROM machines m
            LEFT JOIN machine_slots ms
                ON m.machine_id = ms.machine_id
            LEFT JOIN inventories i
                ON ms.slot_id = i.slot_id
            LEFT JOIN products p
                ON i.product_id = p.product_id
            LEFT JOIN LATERAL (
                SELECT SUM(ir.quantity) AS reserved_quantity
                FROM inventory_reservations ir
                WHERE ir.inventory_id = i.inventory_id
                  AND ir.status = 'RESERVED'
            ) r ON TRUE
            WHERE m.machine_id = $1
            ORDER BY ms.slot_code;
        `;

        const result = await pool.query(sql, [machineId]);
        return result.rows;
    }

    // Lấy tồn kho của một khe cụ thể.
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
                COALESCE(r.reserved_quantity, 0)::integer
                    AS reserved_quantity,
                (
                    i.quantity - COALESCE(r.reserved_quantity, 0)
                )::integer AS available_quantity,
                i.updated_at
            FROM machine_slots ms
            LEFT JOIN inventories i
                ON ms.slot_id = i.slot_id
            LEFT JOIN products p
                ON i.product_id = p.product_id
            LEFT JOIN LATERAL (
                SELECT SUM(ir.quantity) AS reserved_quantity
                FROM inventory_reservations ir
                WHERE ir.inventory_id = i.inventory_id
                  AND ir.status = 'RESERVED'
            ) r ON TRUE
            WHERE ms.slot_id = $1;
        `;

        const result = await pool.query(sql, [slotId]);
        return result.rows;
    }

    // ==========================================
    // SPRINT 2: KHÓA VÀ KIỂM TRA TỒN KHO
    // ==========================================

    // Khóa dòng inventory trong transaction.
    // Tính số lượng đang giữ từ inventory_reservations.
    async getInventoryForUpdate(slotId, productId, client) {
        const sql = `
            SELECT
                i.inventory_id,
                i.slot_id,
                i.product_id,
                i.quantity,
                COALESCE(
                    (
                        SELECT SUM(ir.quantity)
                        FROM inventory_reservations ir
                        WHERE ir.inventory_id = i.inventory_id
                          AND ir.status = 'RESERVED'
                    ),
                    0
                )::integer AS reserved_quantity,
                (
                    i.quantity - COALESCE(
                        (
                            SELECT SUM(ir.quantity)
                            FROM inventory_reservations ir
                            WHERE ir.inventory_id = i.inventory_id
                              AND ir.status = 'RESERVED'
                        ),
                        0
                    )
                )::integer AS available_quantity,
                ms.machine_id,
                ms.status AS slot_status,
                p.status AS product_status
            FROM inventories i
            INNER JOIN machine_slots ms
                ON i.slot_id = ms.slot_id
            INNER JOIN products p
                ON i.product_id = p.product_id
            WHERE i.slot_id = $1
              AND i.product_id = $2
            FOR UPDATE OF i;
        `;

        const result = await client.query(sql, [slotId, productId]);
        return result.rows[0] || null;
    }

    // ==========================================
    // SPRINT 2: TẠO RESERVATION
    // ==========================================

    async createReservation(orderItemId, inventoryId, quantity, client) {
        const sql = `
            INSERT INTO inventory_reservations (
                order_item_id,
                inventory_id,
                quantity,
                status
            )
            VALUES ($1, $2, $3, 'RESERVED')
            RETURNING *;
        `;

        const result = await client.query(sql, [
            orderItemId,
            inventoryId,
            quantity
        ]);

        return result.rows[0];
    }

    // ==========================================
    // SPRINT 2: LẤY RESERVATION
    // ==========================================

    // Khóa reservation để tránh xử lý đồng thời nhiều lần.
    async getReservationForUpdate(reservationId, client) {
        const sql = `
            SELECT
                reservation_id,
                order_item_id,
                inventory_id,
                quantity,
                status,
                created_at,
                resolved_at
            FROM inventory_reservations
            WHERE reservation_id = $1
            FOR UPDATE;
        `;

        const result = await client.query(sql, [reservationId]);
        return result.rows[0] || null;
    }

    // ==========================================
    // SPRINT 2: THANH TOÁN THÀNH CÔNG
    // ==========================================

    // Trừ tồn kho thực tế và chuyển reservation sang CONSUMED.
    // Hàm này phải được gọi bên trong transaction.
    async consumeReservation(reservationId, client) {
        const reservation = await this.getReservationForUpdate(
            reservationId,
            client
        );

        if (!reservation || reservation.status !== 'RESERVED') {
            return null;
        }

        const updateInventorySql = `
            UPDATE inventories
            SET quantity = quantity - $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE inventory_id = $2
              AND quantity >= $1
            RETURNING inventory_id, quantity;
        `;

        const inventoryResult = await client.query(updateInventorySql, [
            reservation.quantity,
            reservation.inventory_id
        ]);

        if (inventoryResult.rowCount === 0) {
            throw new Error('Không đủ tồn kho để xác nhận đơn hàng');
        }

        const updateReservationSql = `
            UPDATE inventory_reservations
            SET status = 'CONSUMED',
                resolved_at = CURRENT_TIMESTAMP
            WHERE reservation_id = $1
              AND status = 'RESERVED'
            RETURNING *;
        `;

        const result = await client.query(updateReservationSql, [
            reservationId
        ]);

        return result.rows[0] || null;
    }

    // ==========================================
    // SPRINT 2: GIẢI PHÓNG HÀNG
    // ==========================================

    // Hủy giữ hàng khi thanh toán thất bại hoặc đơn bị hủy.
    // Không trừ quantity vì hàng chưa được xuất khỏi máy.
    async releaseReservation(reservationId, client) {
        const reservation = await this.getReservationForUpdate(
            reservationId,
            client
        );

        if (!reservation || reservation.status !== 'RESERVED') {
            return null;
        }

        const sql = `
            UPDATE inventory_reservations
            SET status = 'RELEASED',
                resolved_at = CURRENT_TIMESTAMP
            WHERE reservation_id = $1
              AND status = 'RESERVED'
            RETURNING *;
        `;

        const result = await client.query(sql, [reservationId]);
        return result.rows[0] || null;
    }
}

module.exports = new InventoryRepository();
