// src/modules/inventory/repository/inventory.repository.js
// Truy vấn tồn kho theo máy hoặc khe, dùng pool pg (không dùng Sequelize).

const { pool } = require('../../../config/db');

class InventoryRepository {

  /** Lấy toàn bộ tồn kho của một máy (theo machineId UUID). */
  async getInventoryByMachine(machineId) {
    const sql = `
      SELECT
        m.machine_id,
        m.machine_code,
        m.machine_name,
        ms.slot_id,
        ms.slot_code,
        ms.capacity,
        ms.status        AS slot_status,
        i.inventory_id,
        i.product_id,
        p.product_name,
        p.description    AS product_description,
        p.unit_price,
        p.status         AS product_status,
        i.quantity,
        i.updated_at
      FROM machines m
      LEFT JOIN machine_slots ms  ON m.machine_id  = ms.machine_id
      LEFT JOIN inventories   i   ON ms.slot_id     = i.slot_id
      LEFT JOIN products      p   ON i.product_id   = p.product_id
      WHERE m.machine_id = $1
      ORDER BY ms.slot_code
    `;
    const result = await pool.query(sql, [machineId]);
    return result.rows;
  }

  /** Lấy tồn kho của một khe cụ thể (theo slotId UUID). */
  async getInventoryBySlot(slotId) {
    const sql = `
      SELECT
        ms.slot_id,
        ms.machine_id,
        ms.slot_code,
        ms.capacity,
        ms.status        AS slot_status,
        i.inventory_id,
        i.product_id,
        p.product_name,
        p.description    AS product_description,
        p.unit_price,
        p.status         AS product_status,
        i.quantity,
        i.updated_at
      FROM machine_slots ms
      LEFT JOIN inventories i  ON ms.slot_id    = i.slot_id
      LEFT JOIN products    p  ON i.product_id  = p.product_id
      WHERE ms.slot_id = $1
    `;
    const result = await pool.query(sql, [slotId]);
    return result.rows;
  }
}

module.exports = new InventoryRepository();
