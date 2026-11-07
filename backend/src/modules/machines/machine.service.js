// src/modules/machines/machine.service.js
// Business logic cho module máy bán hàng.
// ID máy là UUID (theo ERD). Trạng thái IoT Simulator ánh xạ sang cột ERD.

const Machine = require('./machine.model');

// ─── Hằng số hợp lệ ───────────────────────────────────────────────────────────
const VALID_OPERATION_STATES = Object.freeze(['IDLE', 'BUSY', 'ERROR', 'MAINTENANCE']);
const VALID_DOOR_STATUS      = Object.freeze(['OPEN', 'CLOSED']);
const VALID_SENSOR_STATUS    = Object.freeze(['OK', 'FAULT']);
const HEARTBEAT_TIMEOUT_MS   = 60 * 1000; // 60 s — máy được xem là OFFLINE sau khoảng này

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── ServiceError ─────────────────────────────────────────────────────────────
class ServiceError extends Error {
  constructor(statusCode, errorCode, message) {
    super(message);
    this.name       = 'ServiceError';
    this.statusCode = statusCode;
    this.errorCode  = errorCode;
    this.status     = statusCode; // tương thích errorHandler middleware
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Xác nhận UUID hợp lệ; ném 400 nếu sai. */
const requireMachineId = (id) => {
  if (!id || !UUID_RE.test(id)) {
    throw new ServiceError(400, 'INVALID_MACHINE_ID', 'ID máy phải là UUID hợp lệ.');
  }
  return id;
};

/** Làm giàu thông tin máy: tính lại isOnline từ lastSeenAt. */
const enrichMachine = (machine) => {
  if (!machine) return null;
  const lastMs    = machine.lastSeenAt ? new Date(machine.lastSeenAt).getTime() : 0;
  const isExpired = !lastMs || Date.now() - lastMs > HEARTBEAT_TIMEOUT_MS;
  const isOnline  = machine.connectionStatus === 'ONLINE' && !isExpired;
  return {
    ...machine,
    isOnline,
    connectionStatus: isOnline ? 'ONLINE' : 'OFFLINE',
  };
};

const parseStrictDecimal = (val) => {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') return null;
  const num = Number(val);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : NaN;
};

// ─── API handlers ─────────────────────────────────────────────────────────────

const getAllMachines = async () => {
  const machines = await Machine.findAll();
  return machines.map(enrichMachine);
};

const getMachineById = async (id) => {
  requireMachineId(id);
  const machine = await Machine.findById(id);
  if (!machine) {
    throw new ServiceError(404, 'MACHINE_NOT_FOUND', `Không tìm thấy máy bán hàng với ID ${id}.`);
  }
  const slots = await Machine.findSlotsByMachineId(id);
  return { ...enrichMachine(machine), slots };
};

const getMachineSlots = async (id) => {
  requireMachineId(id);
  const machine = await Machine.findById(id);
  if (!machine) {
    throw new ServiceError(404, 'MACHINE_NOT_FOUND', `Không tìm thấy máy bán hàng với ID ${id}.`);
  }
  return Machine.findSlotsByMachineId(id);
};

/**
 * Nhận heartbeat/telemetry từ IoT Simulator.
 * Ánh xạ payload simulator → cột ERD machine_statuses.
 */
const receiveSimulatorStatus = async (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ServiceError(400, 'INVALID_PAYLOAD_FORMAT', 'Dữ liệu gửi lên phải là JSON Object.');
  }

  const {
    machineCode,
    machineState = 'IDLE',
    temperature,
    humidity,
    doorStatus   = 'CLOSED',
    sensorStatus = 'OK',
    errorCode    = null,
  } = payload;

  // Kiểm tra machineCode
  if (!machineCode || typeof machineCode !== 'string' || !machineCode.trim()) {
    throw new ServiceError(400, 'INVALID_MACHINE_CODE', 'Thiếu hoặc sai định dạng mã máy (machineCode).');
  }

  // Tìm máy theo code
  const normalizedCode = machineCode.trim().toUpperCase();
  const machine = await Machine.findByCode(normalizedCode);
  if (!machine) {
    throw new ServiceError(404, 'MACHINE_NOT_FOUND', `Mã máy '${normalizedCode}' không tồn tại.`);
  }

  // Validate machineState
  if (!VALID_OPERATION_STATES.includes(machineState)) {
    throw new ServiceError(400, 'INVALID_MACHINE_STATE',
      `Trạng thái máy '${machineState}' không hợp lệ. Cho phép: ${VALID_OPERATION_STATES.join(', ')}.`);
  }

  // Validate doorStatus
  if (!VALID_DOOR_STATUS.includes(doorStatus)) {
    throw new ServiceError(400, 'INVALID_DOOR_STATUS',
      `Trạng thái cửa '${doorStatus}' không hợp lệ (chỉ nhận OPEN/CLOSED).`);
  }

  // Validate sensorStatus
  if (!VALID_SENSOR_STATUS.includes(sensorStatus)) {
    throw new ServiceError(400, 'INVALID_SENSOR_STATUS',
      `Trạng thái cảm biến '${sensorStatus}' không hợp lệ (chỉ nhận OK/FAULT).`);
  }

  // Parse nhiệt độ và độ ẩm
  const parsedTemp     = parseStrictDecimal(temperature);
  const parsedHumidity = parseStrictDecimal(humidity);

  if (Number.isNaN(parsedTemp) || (parsedTemp !== null && (parsedTemp < -50 || parsedTemp > 100))) {
    throw new ServiceError(400, 'INVALID_TEMPERATURE_VALUE', 'Nhiệt độ phải là số trong khoảng −50°C đến 100°C.');
  }
  if (sensorStatus === 'OK' && parsedTemp === null) {
    throw new ServiceError(400, 'MISSING_TEMPERATURE', 'Phải gửi kèm temperature khi sensorStatus = OK.');
  }
  if (Number.isNaN(parsedHumidity) || (parsedHumidity !== null && (parsedHumidity < 0 || parsedHumidity > 100))) {
    throw new ServiceError(400, 'INVALID_HUMIDITY_VALUE', 'Độ ẩm phải từ 0% đến 100%.');
  }

  // ── Tính health_status (cột ERD: NORMAL / WARNING / ERROR) ──────────────────
  let healthStatus  = 'NORMAL';
  let resolvedError = errorCode;
  let warningMsg    = null;
  let eventType     = 'TELEMETRY';
  let severity      = 'INFO';
  let isOutOfRange  = false;

  if (sensorStatus === 'FAULT') {
    healthStatus  = 'ERROR';
    resolvedError = resolvedError || 'SENSOR_DHT22_FAULT';
    warningMsg    = 'Cảm biến nhiệt độ DHT22 gặp sự cố. Giữ giá trị gần nhất.';
    eventType     = 'ALERT';
    severity      = 'ERROR';
  } else if (parsedTemp !== null && (parsedTemp < machine.minTemperature || parsedTemp > machine.maxTemperature)) {
    healthStatus  = 'WARNING';
    resolvedError = resolvedError || 'TEMP_OUT_OF_RANGE';
    warningMsg    = `Cảnh báo: Nhiệt độ ${parsedTemp}°C vượt ngưỡng (${machine.minTemperature}°C–${machine.maxTemperature}°C).`;
    eventType     = 'ALERT';
    severity      = 'WARNING';
    isOutOfRange  = true;
  } else if (doorStatus === 'OPEN' && machineState !== 'MAINTENANCE') {
    healthStatus  = 'WARNING';
    resolvedError = resolvedError || 'UNAUTHORIZED_DOOR_OPEN';
    warningMsg    = 'Cảnh báo an ninh: Cửa máy mở khi không trong chế độ bảo trì.';
    eventType     = 'ALERT';
    severity      = 'WARNING';
  }

  // ── Ghi vào DB ──────────────────────────────────────────────────────────────
  const statusRow = await Machine.recordSimulatorStatus(machine.id, {
    operationStatus: sensorStatus === 'FAULT' ? 'ERROR' : machineState,
    connectionStatus: 'ONLINE',
    healthStatus,
    doorStatus,
    temperature:  parsedTemp,
    humidity:     parsedHumidity,
    errorCode:    resolvedError,
    eventType,
    severity,
    errorMessage: warningMsg,
    isOutOfRange,
  });

  return {
    machineCode: machine.machineCode,
    operationStatus: statusRow.operation_status,
    healthStatus:    statusRow.health_status,
    lastSeenAt:      statusRow.last_seen_at,
    warning:         warningMsg,
  };
};

module.exports = {
  ServiceError,
  getAllMachines,
  getMachineById,
  getMachineSlots,
  receiveSimulatorStatus,
};
