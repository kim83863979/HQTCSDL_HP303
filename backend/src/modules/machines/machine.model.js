// src/modules/machines/machine.model.js
// Truy vấn CSDL cho bảng machines, machine_statuses, machine_slots, machine_events.
// Dùng pool từ src/config/db — cột đúng theo ERD (UUID, snake_case).

const { pool } = require('../../config/db');

// ─── Mapper: hàng DB → object API ────────────────────────────────────────────

const mapMachineRow = (row) => {
  if (!row) return null;
  return {
    id:             row.machine_id,
    machineCode:    row.machine_code,
    name:           row.machine_name,
    location:       row.location_name,
    address:        row.address,
    lifecycleStatus: row.lifecycle_status,
    minTemperature: row.min_temperature !== null ? Number(row.min_temperature) : 2.0,
    maxTemperature: row.max_temperature !== null ? Number(row.max_temperature) : 8.0,
    // từ machine_statuses (có thể null nếu chưa có bản ghi nào)
    connectionStatus: row.connection_status ?? 'OFFLINE',
    operationStatus:  row.operation_status  ?? 'UNKNOWN',
    healthStatus:     row.health_status     ?? 'UNKNOWN',
    isOnline:         row.connection_status === 'ONLINE',
    doorStatus:       row.door_status       ?? 'CLOSED',
    temperature:      row.last_temperature  !== null && row.last_temperature !== undefined
                        ? Number(row.last_temperature) : null,
    humidity:         row.last_humidity     !== null && row.last_humidity !== undefined
                        ? Number(row.last_humidity) : null,
    errorCode:        row.last_error_code   ?? null,
    lastSeenAt:       row.last_seen_at      ?? null,
    statusUpdatedAt:  row.status_updated_at ?? null,
  };
};

// ─── SQL: lấy máy kèm trạng thái mới nhất (LATERAL JOIN) ─────────────────────
const MACHINE_WITH_STATUS_SQL = `
  SELECT
    m.machine_id, m.machine_code, m.machine_name, m.location_name, m.address,
    m.lifecycle_status, m.min_temperature, m.max_temperature,
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

  /** Lấy danh sách khe của máy theo machineId UUID. */
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

  /**
   * Ghi nhận trạng thái mới từ IoT Simulator:
   *  1. INSERT một hàng mới vào machine_statuses (time-series).
   *  2. INSERT machine_event nếu có cảnh báo.
   *  3. INSERT temperature_log nếu có nhiệt độ hợp lệ.
   * Trả về hàng machine_statuses vừa INSERT.
   */
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

    // 1. INSERT machine_statuses
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
         last_temperature = EXCLUDED.last_temperature,
         last_humidity = EXCLUDED.last_humidity,
         last_error_code = EXCLUDED.last_error_code,
         last_seen_at = EXCLUDED.last_seen_at,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [machineId, connectionStatus, operationStatus, healthStatus,
       doorStatus, temperature, humidity, errorCode],
    );

    // 2. INSERT temperature_log nếu có nhiệt độ
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

    // 3. INSERT machine_event nếu có cảnh báo hoặc errorCode
    if (errorCode || eventType === 'ALERT') {
      const idempotencyKey = `SIM_${machineId}_${Date.now()}`;
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
