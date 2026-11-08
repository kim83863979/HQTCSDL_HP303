// src/modules/machines/machine.model.js
// Truy vấn CSDL cho bảng machines, machine_statuses, machine_slots, machine_events
// và liên kết dữ liệu khe - tồn kho - đơn hàng cho Sprint 2.

const { pool } = require('../../config/db');

// ─── Mapper: hàng DB → object API ────────────────────────────────────────────

const mapMachineRow = (row) => {
  if (!row) return null;
  return {
    id:                row.machine_id,
    machineCode:       row.machine_code,
    name:              row.machine_name,
    location:          row.location_name,
    address:           row.address,
    lifecycleStatus:   row.lifecycle_status,
    minTemperature:    row.min_temperature !== null && row.min_temperature !== undefined
                         ? Number(row.min_temperature) : 2.0,
    maxTemperature:    row.max_temperature !== null && row.max_temperature !== undefined
                         ? Number(row.max_temperature) : 8.0,
    alertDelayMinutes: row.alert_delay_minutes !== null && row.alert_delay_minutes !== undefined
                         ? Number(row.alert_delay_minutes) : 5,
    connectionStatus:  row.connection_status ?? 'OFFLINE',
    operationStatus:   row.operation_status  ?? 'UNKNOWN',
    healthStatus:      row.health_status     ?? 'UNKNOWN',
    isOnline:          row.connection_status === 'ONLINE',
    doorStatus:        row.door_status       ?? 'CLOSED',
    temperature:       row.last_temperature  !== null && row.last_temperature !== undefined
                         ? Number(row.last_temperature) : null,
    humidity:          row.last_humidity     !== null && row.last_humidity !== undefined
                         ? Number(row.last_humidity) : null,
    errorCode:         row.last_error_code   ?? null,
    lastSeenAt:        row.last_seen_at      ?? null,
    statusUpdatedAt:   row.status_updated_at ?? null,
  };
};

const mapSlotWithInventoryRow = (row) => {
  if (!row) return null;
  return {
    slotId:             row.slot_id,
    machineId:          row.machine_id,
    slotCode:           row.slot_code,
    capacity:           Number(row.capacity),
    slotStatus:         row.slot_status,
    inventoryId:        row.inventory_id ?? null,
    productId:          row.product_id ?? null,
    productName:        row.product_name ?? null,
    productDescription: row.product_description ?? null,
    unitPrice:          row.unit_price !== null && row.unit_price !== undefined
                          ? Number(row.unit_price) : null,
    productStatus:      row.product_status ?? null,
    quantity:           row.quantity !== null && row.quantity !== undefined
                          ? Number(row.quantity) : 0,
    inventoryUpdatedAt: row.inventory_updated_at ?? null,
  };
};

// ─── SQL: lấy máy kèm trạng thái mới nhất (LATERAL JOIN) ─────────────────────
const MACHINE_WITH_STATUS_SQL = `
  SELECT
    m.machine_id, m.machine_code, m.machine_name, m.location_name, m.address,
    m.lifecycle_status, m.min_temperature, m.max_temperature, m.alert_delay_minutes,
    ms.connection_status, ms.operation_status, ms.health_status,
    ms.door_status, ms.last_temperature, ms.last_humidity,
    ms.last_error_code, ms.last_seen_at,
    ms.updated_at AS status_updated_at
  FROM machines m
  LEFT JOIN LATERAL (
    SELECT *
    FROM machine_statuses
    WHERE machine_id = m.machine_id
    ORDER BY last_seen_at DESC
    LIMIT 1
  ) ms ON true
`;

// ─── Machine object (exported) ────────────────────────────────────────────────

const Machine = {

  /** Lấy tất cả máy kèm trạng thái mới nhất. */
  findAll: async () => {
    const result = await pool.query(`${MACHINE_WITH_STATUS_SQL} ORDER BY m.machine_code ASC`);
    return result.rows.map(mapMachineRow);
  },

  /** Tìm máy theo UUID. Trả null nếu không tồn tại. */
  findById: async (machineId) => {
    const result = await pool.query(
      `${MACHINE_WITH_STATUS_SQL} WHERE m.machine_id = $1`,
      [machineId],
    );
    return mapMachineRow(result.rows[0]);
  },

  /** Tìm máy theo machine_code (chuỗi hoa). Trả null nếu không tồn tại. */
  findByCode: async (machineCode) => {
    const result = await pool.query(
      `${MACHINE_WITH_STATUS_SQL} WHERE m.machine_code = $1`,
      [machineCode],
    );
    return mapMachineRow(result.rows[0]);
  },

  /** [SPRINT 1] Lấy danh sách khe cơ bản của máy theo machineId UUID. */
  findSlotsByMachineId: async (machineId) => {
    const result = await pool.query(
      `SELECT slot_id    AS "slotId",
              machine_id AS "machineId",
              slot_code  AS "slotCode",
              capacity,
              status     AS "slotStatus"
       FROM machine_slots
       WHERE machine_id = $1
       ORDER BY slot_code ASC`,
      [machineId],
    );
    return result.rows;
  },

  /** [SPRINT 2] Lấy danh sách khe kèm thông tin sản phẩm và tồn kho. */
  findSlotsWithInventoryByMachineId: async (machineId) => {
    const sql = `
      SELECT
        ms.slot_id,
        ms.machine_id,
        ms.slot_code,
        ms.capacity,
        ms.status        AS slot_status,
        i.inventory_id,
        i.product_id,
        i.quantity,
        i.updated_at     AS inventory_updated_at,
        p.product_name,
        p.description    AS product_description,
        p.unit_price,
        p.status         AS product_status
      FROM machine_slots ms
      LEFT JOIN inventories i ON ms.slot_id = i.slot_id
      LEFT JOIN products    p ON i.product_id = p.product_id
      WHERE ms.machine_id = $1
      ORDER BY ms.slot_code ASC
    `;
    const result = await pool.query(sql, [machineId]);
    return result.rows.map(mapSlotWithInventoryRow);
  },

  /** [SPRINT 2] Tìm 1 khe kèm thông tin tồn kho hiện tại để kiểm tra ràng buộc trước khi sửa. */
  findSlotWithInventoryById: async (machineId, slotId) => {
    const sql = `
      SELECT
        ms.slot_id,
        ms.machine_id,
        ms.slot_code,
        ms.capacity,
        ms.status        AS slot_status,
        i.inventory_id,
        i.product_id,
        i.quantity,
        i.updated_at     AS inventory_updated_at,
        p.product_name,
        p.description    AS product_description,
        p.unit_price,
        p.status         AS product_status
      FROM machine_slots ms
      LEFT JOIN inventories i ON ms.slot_id = i.slot_id
      LEFT JOIN products    p ON i.product_id = p.product_id
      WHERE ms.machine_id = $1 AND ms.slot_id = $2
    `;
    const result = await pool.query(sql, [machineId, slotId]);
    return mapSlotWithInventoryRow(result.rows[0]);
  },

  /** [SPRINT 2] Tạo khe mới cho máy bán hàng. */
  createSlot: async (machineId, { slotCode, capacity, status = 'ACTIVE' }) => {
    const sql = `
      INSERT INTO machine_slots (machine_id, slot_code, capacity, status)
      VALUES ($1, $2, $3, $4)
      RETURNING
        slot_id    AS "slotId",
        machine_id AS "machineId",
        slot_code  AS "slotCode",
        capacity,
        status     AS "slotStatus"
    `;
    const result = await pool.query(sql, [machineId, slotCode, capacity, status]);
    return result.rows[0];
  },

  /** [SPRINT 2] Cập nhật thông tin khe máy (status và/hoặc capacity). */
  updateSlot: async (machineId, slotId, { status, capacity }) => {
    const sql = `
      UPDATE machine_slots ms
      SET status   = COALESCE($3, ms.status),
          capacity = COALESCE($4, ms.capacity)
      WHERE ms.machine_id = $1 AND ms.slot_id = $2
      RETURNING
        ms.slot_id    AS "slotId",
        ms.machine_id AS "machineId",
        ms.slot_code  AS "slotCode",
        ms.capacity,
        ms.status     AS "slotStatus"
    `;
    const result = await pool.query(sql, [machineId, slotId, status ?? null, capacity ?? null]);
    return result.rows[0] || null;
  },

  /**
   * [SPRINT 2] Tìm tất cả các khe đang gán với danh sách productIds trên máy
   * (Dùng để phân biệt rõ sản phẩm chưa gán vào máy vs sản phẩm đã hết hàng).
   * Hỗ trợ dbClient và lockRows (FOR UPDATE) khi tích hợp Transaction với Order/Inventory.
   */
  findProductSlotsInMachine: async (machineId, productIds, { dbClient = null, lockRows = false } = {}) => {
    const executor = dbClient || pool;
    const lockClause = dbClient && lockRows ? 'FOR UPDATE OF i, ms' : '';

    const sql = `
      SELECT
        ms.slot_id,
        ms.machine_id,
        ms.slot_code,
        ms.capacity,
        ms.status        AS slot_status,
        i.inventory_id,
        i.product_id,
        i.quantity,
        p.product_name,
        p.unit_price,
        p.status         AS product_status
      FROM machine_slots ms
      INNER JOIN inventories i ON ms.slot_id = i.slot_id
      INNER JOIN products    p ON i.product_id = p.product_id
      WHERE ms.machine_id = $1
        AND i.product_id = ANY($2::uuid[])
      ORDER BY ms.slot_code ASC
      ${lockClause}
    `;
    const result = await executor.query(sql, [machineId, productIds]);
    return result.rows.map(mapSlotWithInventoryRow);
  },

  /** [SPRINT 2] Lấy đơn hàng kèm danh sách order_items để lập kế hoạch nhả hàng (Dispense Plan). */
  findOrderWithItemsById: async (orderId) => {
    const orderSql = `
      SELECT order_id, machine_id, order_status, total_amount, created_at, updated_at
      FROM orders
      WHERE order_id = $1
    `;
    const itemsSql = `
      SELECT
        oi.order_item_id,
        oi.order_id,
        oi.product_id,
        oi.quantity,
        oi.unit_price,
        oi.subtotal,
        p.product_name,
        p.status AS product_status
      FROM order_items oi
      INNER JOIN products p ON oi.product_id = p.product_id
      WHERE oi.order_id = $1
      ORDER BY oi.order_item_id ASC
    `;

    const [orderRes, itemsRes] = await Promise.all([
      pool.query(orderSql, [orderId]),
      pool.query(itemsSql, [orderId]),
    ]);

    if (!orderRes.rows[0]) return null;

    const orderRow = orderRes.rows[0];
    return {
      orderId:     orderRow.order_id,
      machineId:   orderRow.machine_id,
      orderStatus: orderRow.order_status,
      totalAmount: Number(orderRow.total_amount),
      createdAt:   orderRow.created_at,
      updatedAt:   orderRow.updated_at,
      items:       itemsRes.rows.map((item) => ({
        orderItemId:   item.order_item_id,
        productId:     item.product_id,
        productName:   item.product_name,
        productStatus: item.product_status,
        quantity:      Number(item.quantity),
        unitPrice:     Number(item.unit_price),
        subtotal:      Number(item.subtotal),
      })),
    };
  },

  /** [SPRINT 1] Ghi nhận trạng thái mới từ IoT Simulator. */
  recordSimulatorStatus: async (machineId, payload) => {
    const {
      operationStatus,
      connectionStatus = 'ONLINE',
      healthStatus,
      doorStatus,
      temperature,
      humidity,
      errorCode       = null,
      eventType       = 'TELEMETRY',
      severity        = 'INFO',
      errorMessage    = null,
    } = payload;

    const statusResult = await pool.query(
      `INSERT INTO machine_statuses
         (machine_id, connection_status, operation_status, health_status,
          door_status, last_temperature, last_humidity, last_error_code,
          last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
       ON CONFLICT (machine_id) DO UPDATE SET
         connection_status = EXCLUDED.connection_status,
         operation_status = EXCLUDED.operation_status,
         health_status = EXCLUDED.health_status,
         door_status = EXCLUDED.door_status,
         last_temperature = COALESCE(EXCLUDED.last_temperature, machine_statuses.last_temperature),
         last_humidity = COALESCE(EXCLUDED.last_humidity, machine_statuses.last_humidity),
         last_error_code = EXCLUDED.last_error_code,
         last_seen_at = EXCLUDED.last_seen_at,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [machineId, connectionStatus, operationStatus, healthStatus,
       doorStatus, temperature, humidity, errorCode],
    );

    if (temperature !== null && temperature !== undefined) {
      const isOutOfRange = payload.isOutOfRange ?? false;
      const sensorStatus = healthStatus === 'ERROR' ? 'ERROR' : 'OK';
      await pool.query(
        `INSERT INTO temperature_logs
           (machine_id, temperature, humidity, sensor_status, is_out_of_range,
            recorded_at)
         VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
        [machineId, temperature, humidity, sensorStatus, isOutOfRange],
      );
    }

    if (errorCode || eventType === 'ALERT') {
      const idempotencyKey = `SIM_${machineId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await pool.query(
        `INSERT INTO machine_events
           (machine_id, event_type, severity, event_status,
            error_code, error_message, idempotency_key, payload, occurred_at)
         VALUES ($1, $2, $3, 'RECEIVED', $4, $5, $6, $7::jsonb, CURRENT_TIMESTAMP)`,
        [
          machineId, eventType, severity,
          errorCode, errorMessage, idempotencyKey,
          JSON.stringify({ operationStatus, temperature, humidity, doorStatus, errorCode }),
        ],
      );
    }

    return statusResult.rows[0];
  },
};

module.exports = Machine;