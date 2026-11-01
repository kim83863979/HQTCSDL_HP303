const pool = require("../../config/db.config");

const mapMachineRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    machineCode: row.machine_code,
    name: row.name,
    location: row.location,
    status: row.status,
    minTempThreshold: row.min_temp_threshold !== null ? Number(row.min_temp_threshold) : 2.0,
    maxTempThreshold: row.max_temp_threshold !== null ? Number(row.max_temp_threshold) : 8.0,
    isOnline: Boolean(row.is_online),
    machineState: row.machine_state || "OFFLINE",
    temperature: row.temperature !== null && row.temperature !== undefined ? Number(row.temperature) : null,
    humidity: row.humidity !== null && row.humidity !== undefined ? Number(row.humidity) : null,
    doorStatus: row.door_status || "CLOSED",
    sensorStatus: row.sensor_status || "OK",
    errorCode: row.error_code || null,
    lastSeen: row.last_seen || null,
    updatedAt: row.updated_at || null,
  };
};

const mapStatusRow = (row) => {
  if (!row) return null;
  return {
    machineId: row.machine_id,
    isOnline: Boolean(row.is_online),
    machineState: row.machine_state,
    temperature: row.temperature !== null && row.temperature !== undefined ? Number(row.temperature) : null,
    humidity: row.humidity !== null && row.humidity !== undefined ? Number(row.humidity) : null,
    doorStatus: row.door_status,
    sensorStatus: row.sensor_status,
    errorCode: row.error_code || null,
    lastSeen: row.last_seen,
    updatedAt: row.updated_at,
  };
};

const Machine = {
  findAll: async () => {
    const query = `
      SELECT 
        m.id, m.machine_code, m.name, m.location, m.status,
        m.min_temp_threshold, m.max_temp_threshold,
        ms.is_online, ms.machine_state, ms.temperature, ms.humidity,
        ms.door_status, ms.sensor_status, ms.error_code, ms.last_seen, ms.updated_at
      FROM machines m
      LEFT JOIN machine_statuses ms ON m.id = ms.machine_id
      ORDER BY m.id ASC
    `;
    const result = await pool.query(query);
    return result.rows.map(mapMachineRow);
  },

  findById: async (id) => {
    const query = `
      SELECT 
        m.id, m.machine_code, m.name, m.location, m.status,
        m.min_temp_threshold, m.max_temp_threshold,
        ms.is_online, ms.machine_state, ms.temperature, ms.humidity,
        ms.door_status, ms.sensor_status, ms.error_code, ms.last_seen, ms.updated_at
      FROM machines m
      LEFT JOIN machine_statuses ms ON m.id = ms.machine_id
      WHERE m.id = $1
    `;
    const result = await pool.query(query, [id]);
    return mapMachineRow(result.rows[0]);
  },

  findByCode: async (machineCode) => {
    const query = `
      SELECT 
        m.id, m.machine_code, m.name, m.location, m.status,
        m.min_temp_threshold, m.max_temp_threshold
      FROM machines m
      WHERE m.machine_code = $1
    `;
    const result = await pool.query(query, [machineCode]);
    return mapMachineRow(result.rows[0]);
  },

  findSlotsByMachineId: async (machineId) => {
    const query = `
      SELECT 
        id,
        machine_id AS "machineId",
        slot_code AS "slotCode",
        capacity,
        slot_status AS "slotStatus",
        updated_at AS "updatedAt"
      FROM machine_slots
      WHERE machine_id = $1
      ORDER BY slot_code ASC
    `;
    const result = await pool.query(query, [machineId]);
    return result.rows;
  },

  updateSimulatedStatus: async (machineId, statusPayload) => {
    const {
      machineState,
      temperature,
      humidity,
      doorStatus,
      sensorStatus,
      errorCode,
      eventType = "TELEMETRY",
      eventStatus = "SUCCESS",
      errorMessage = null,
    } = statusPayload;

    const cteQuery = `
      WITH upserted_status AS (
        INSERT INTO machine_statuses (
          machine_id, is_online, machine_state, temperature, humidity,
          door_status, sensor_status, error_code, last_seen, updated_at
        )
        VALUES ($1, TRUE, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (machine_id) DO UPDATE SET
          is_online = TRUE,
          machine_state = EXCLUDED.machine_state,
          temperature = COALESCE(EXCLUDED.temperature, machine_statuses.temperature),
          humidity = COALESCE(EXCLUDED.humidity, machine_statuses.humidity),
          door_status = EXCLUDED.door_status,
          sensor_status = EXCLUDED.sensor_status,
          error_code = EXCLUDED.error_code,
          last_seen = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      ),
      updated_machine AS (
        UPDATE machines
        SET status = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      ),
      inserted_temp_log AS (
        INSERT INTO temperature_logs (machine_id, temperature, humidity, sensor_status)
        SELECT $1, $3, $4, $6
        WHERE $3 IS NOT NULL
      ),
      inserted_event AS (
        INSERT INTO machine_events (machine_id, event_type, event_status, error_message, payload)
        SELECT $1, $8, $9, $10, $11::jsonb
        WHERE $7 IS NOT NULL OR $8 = 'ALERT'
      )
      SELECT * FROM upserted_status;
    `;

    const values = [
      machineId,
      machineState,
      temperature,
      humidity,
      doorStatus,
      sensorStatus,
      errorCode,
      eventType,
      eventStatus,
      errorMessage,
      JSON.stringify({
        machineState,
        temperature,
        humidity,
        doorStatus,
        sensorStatus,
        errorCode,
      }),
    ];

    const result = await pool.query(cteQuery, values);
    return mapStatusRow(result.rows[0]);
  },
};

module.exports = Machine;