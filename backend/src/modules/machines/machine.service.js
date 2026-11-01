const Machine = require("./machine.model");

const VALID_STATES = Object.freeze(["IDLE", "BUSY", "ERROR", "MAINTENANCE", "OFFLINE"]);
const VALID_DOOR_STATUS = Object.freeze(["OPEN", "CLOSED"]);
const VALID_SENSOR_STATUS = Object.freeze(["OK", "FAULT"]);
const HEARTBEAT_TIMEOUT_MS = 60 * 1000; // 60s timeout theo ADM-05[cite: 1]

class ServiceError extends Error {
  constructor(statusCode, errorCode, message) {
    super(message);
    this.name = "ServiceError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
  }
}

const parseStrictDecimal = (val) => {
  if (val === null || val === undefined || val === "" || typeof val === "boolean") {
    return null;
  }
  const num = Number(val);
  if (!Number.isFinite(num)) {
    return NaN;
  }
  return Math.round(num * 100) / 100;
};

const evaluateMachineConnectivity = (machine) => {
  if (!machine) return null;
  const lastSeenMs = machine.lastSeen ? new Date(machine.lastSeen).getTime() : 0;
  const isExpired = !lastSeenMs || Date.now() - lastSeenMs > HEARTBEAT_TIMEOUT_MS;
  const isActuallyOnline = Boolean(machine.isOnline && !isExpired);
  const effectiveState = isActuallyOnline ? machine.machineState : "OFFLINE";

  return {
    ...machine,
    isOnline: isActuallyOnline,
    status: effectiveState,
    machineState: effectiveState,
  };
};

const parseMachineId = (id) => {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new ServiceError(400, "INVALID_MACHINE_ID", "ID máy không hợp lệ (phải là số nguyên dương).");
  }
  return numericId;
};

const getAllMachines = async () => {
  const machines = await Machine.findAll();
  return machines.map(evaluateMachineConnectivity);
};

const getMachineById = async (id) => {
  const numericId = parseMachineId(id);

  const [machine, slots] = await Promise.all([
    Machine.findById(numericId),
    Machine.findSlotsByMachineId(numericId),
  ]);

  if (!machine) {
    throw new ServiceError(404, "MACHINE_NOT_FOUND", `Không tìm thấy máy bán hàng với ID = ${numericId}.`);
  }

  return {
    ...evaluateMachineConnectivity(machine),
    slots,
  };
};

const getMachineSlots = async (id) => {
  const numericId = parseMachineId(id);
  const machine = await Machine.findById(numericId);
  if (!machine) {
    throw new ServiceError(404, "MACHINE_NOT_FOUND", `Không tìm thấy máy bán hàng với ID = ${numericId}.`);
  }
  return await Machine.findSlotsByMachineId(numericId);
};

const receiveSimulatorStatus = async (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ServiceError(400, "INVALID_PAYLOAD_FORMAT", "Dữ liệu gửi lên phải là một JSON Object hợp lệ.");
  }

  const {
    machineCode,
    machineState = "IDLE",
    temperature,
    humidity,
    doorStatus = "CLOSED",
    sensorStatus = "OK",
    errorCode = null,
  } = payload;

  if (!machineCode || typeof machineCode !== "string" || !machineCode.trim()) {
    throw new ServiceError(400, "INVALID_MACHINE_CODE", "Thiếu hoặc sai định dạng mã máy (machineCode).");
  }

  const normalizedCode = machineCode.trim().toUpperCase();
  const machine = await Machine.findByCode(normalizedCode);
  if (!machine) {
    throw new ServiceError(404, "MACHINE_NOT_FOUND", `Mã máy '${normalizedCode}' không tồn tại trong hệ thống.`);
  }

  if (!VALID_STATES.includes(machineState)) {
    throw new ServiceError(400, "INVALID_MACHINE_STATE", `Trạng thái máy '${machineState}' không hợp lệ.`);
  }

  if (!VALID_DOOR_STATUS.includes(doorStatus)) {
    throw new ServiceError(400, "INVALID_DOOR_STATUS", `Trạng thái cửa '${doorStatus}' không hợp lệ (chỉ nhận OPEN/CLOSED).`);
  }

  if (!VALID_SENSOR_STATUS.includes(sensorStatus)) {
    throw new ServiceError(400, "INVALID_SENSOR_STATUS", `Trạng thái cảm biến '${sensorStatus}' không hợp lệ (chỉ nhận OK/FAULT).`);
  }

  const parsedTemp = parseStrictDecimal(temperature);
  if (Number.isNaN(parsedTemp) || (parsedTemp !== null && (parsedTemp < -50 || parsedTemp > 100))) {
    throw new ServiceError(400, "INVALID_TEMPERATURE_VALUE", "Nhiệt độ không hợp lệ (phải là số trong khoảng -50°C đến 100°C).");
  }

  if (sensorStatus === "OK" && parsedTemp === null) {
    throw new ServiceError(400, "MISSING_TEMPERATURE", "Bắt buộc phải gửi kèm giá trị temperature khi sensorStatus = OK.");
  }

  const parsedHumidity = parseStrictDecimal(humidity);
  if (Number.isNaN(parsedHumidity) || (parsedHumidity !== null && (parsedHumidity < 0 || parsedHumidity > 100))) {
    throw new ServiceError(400, "INVALID_HUMIDITY_VALUE", "Độ ẩm không hợp lệ (phải từ 0% đến 100%).");
  }

  const isTempOutOfRange =
    parsedTemp !== null &&
    (parsedTemp < machine.minTempThreshold || parsedTemp > machine.maxTempThreshold);
  const isUnauthorizedDoorOpen = doorStatus === "OPEN" && machineState !== "MAINTENANCE";

  let resolvedErrorCode = errorCode;
  let warningMessage = null;

  if (sensorStatus === "FAULT") {
    resolvedErrorCode = resolvedErrorCode || "SENSOR_DHT22_FAULT";
    warningMessage = "Cảm biến nhiệt độ DHT22 gặp sự cố (ERR-07)[cite: 1]. Đang giữ giá trị hợp lệ gần nhất.";
  } else if (isTempOutOfRange) {
    resolvedErrorCode = resolvedErrorCode || "TEMP_OUT_OF_RANGE";
    warningMessage = `Cảnh báo: Nhiệt độ ${parsedTemp}°C vượt ngưỡng an toàn (${machine.minTempThreshold}°C - ${machine.maxTempThreshold}°C).`;
  } else if (isUnauthorizedDoorOpen) {
    resolvedErrorCode = resolvedErrorCode || "UNAUTHORIZED_DOOR_OPEN";
    warningMessage = "Cảnh báo an ninh: Cửa máy mở khi không ở chế độ bảo trì (IOT-04)[cite: 1].";
  }

  const hasAlert = Boolean(resolvedErrorCode);
  const effectiveState = sensorStatus === "FAULT" ? "ERROR" : machineState;

  const updatedStatus = await Machine.updateSimulatedStatus(machine.id, {
    machineState: effectiveState,
    temperature: parsedTemp,
    humidity: parsedHumidity,
    doorStatus,
    sensorStatus,
    errorCode: resolvedErrorCode,
    eventType: hasAlert ? "ALERT" : "TELEMETRY",
    eventStatus: hasAlert ? "WARNING" : "SUCCESS",
    errorMessage: warningMessage,
  });

  return {
    machineCode: machine.machineCode,
    tempWarning: warningMessage,
    status: updatedStatus,
  };
};

module.exports = {
  ServiceError,
  getAllMachines,
  getMachineById,
  getMachineSlots,
  receiveSimulatorStatus,
};