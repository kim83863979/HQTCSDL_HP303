// src/modules/machines/machine.service.js
const Machine = require('./machine.model');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOT_CODE_REGEX = /^[A-Z][0-9]{1,3}$/; // VD: A1, A01, B02
const VALID_OPERATION_STATES = Object.freeze(['IDLE', 'BUSY', 'DISPENSING', 'ERROR', 'MAINTENANCE', 'OFFLINE']);
const VALID_DOOR_STATUS = Object.freeze(['OPEN', 'CLOSED']);
const VALID_SENSOR_STATUS = Object.freeze(['OK', 'FAULT', 'ERROR']);
const VALID_SLOT_STATUS = Object.freeze(['ACTIVE', 'INACTIVE']);
const HEARTBEAT_TIMEOUT_MS = 60 * 1000;
const MAX_ORDER_ITEMS_COUNT = 50;
const MAX_ITEM_QUANTITY = 100;
const DISPENSABLE_ORDER_STATUSES = Object.freeze(['PENDING', 'PAID', 'DISPENSING']);

class ServiceError extends Error {
  constructor(statusCode, errorCode, message, details = null) {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    if (details) this.details = details;
  }
}

const validateUuid = (id, fieldName = 'ID') => {
  if (!id || typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
    throw new ServiceError(400, `INVALID_${fieldName.toUpperCase()}`, `${fieldName} không đúng định dạng UUID.`);
  }
  return id.trim();
};

const parseStrictDecimal = (val) => {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') return null;
  const num = Number(val);
  if (!Number.isFinite(num)) return NaN;
  return Math.round(num * 10) / 10;
};

const evaluateConnectivity = (machine) => {
  if (!machine) return null;
  const lastSeenMs = machine.lastSeenAt ? new Date(machine.lastSeenAt).getTime() : 0;
  const isTimedOut = !lastSeenMs || (Date.now() - lastSeenMs > HEARTBEAT_TIMEOUT_MS);
  const isOnline = Boolean(machine.connectionStatus === 'ONLINE' && !isTimedOut);
  return {
    ...machine,
    isOnline,
    connectionStatus: isOnline ? 'ONLINE' : 'OFFLINE',
    operationStatus:  isOnline ? machine.operationStatus : 'OFFLINE',
  };
};

const evaluateMachinePurchaseReadiness = (machine) => {
  const reasons = [];
  if (machine.lifecycleStatus !== 'ACTIVE') reasons.push(`Máy không hoạt động (${machine.lifecycleStatus}).`);
  if (machine.connectionStatus !== 'ONLINE') reasons.push('Máy đang mất kết nối OFFLINE.');
  if (machine.operationStatus === 'ERROR' || machine.operationStatus === 'MAINTENANCE') {
    reasons.push(`Trạng thái vận hành: ${machine.operationStatus}.`);
  }
  if (machine.healthStatus === 'ERROR') reasons.push('Cảm biến/thiết bị báo lỗi ERROR.');
  if (
    machine.temperature !== null &&
    (machine.temperature < machine.minTemperature || machine.temperature > machine.maxTemperature)
  ) {
    reasons.push(`Nhiệt độ ${machine.temperature}°C ngoài ngưỡng chuẩn (${machine.minTemperature}-${machine.maxTemperature}°C).`);
  }
  return { isReadyForOrder: reasons.length === 0, unreadyReasons: reasons };
};

// ─── Nghiệp vụ Sprint 1 (Tương thích 100% với bộ Test Sprint 1) ──────────────

const getAllMachines = async () => {
  const machines = await Machine.findAll();
  return machines.map(evaluateConnectivity);
};

const getMachineById = async (id) => {
  const machineId = validateUuid(id, 'MACHINE_ID');
  const [machine, slots] = await Promise.all([
    Machine.findById(machineId),
    Machine.findSlotsByMachineId(machineId),
  ]);
  if (!machine) throw new ServiceError(404, 'MACHINE_NOT_FOUND', `Không tìm thấy máy ${machineId}.`);
  const evaluatedMachine = evaluateConnectivity(machine);
  const readiness = evaluateMachinePurchaseReadiness(evaluatedMachine);
  return {
    ...evaluatedMachine,
    isReadyForOrder: readiness.isReadyForOrder,
    unreadyReasons:  readiness.unreadyReasons,
    slots,
  };
};

const getMachineSlots = async (id, { includeInventory = false } = {}) => {
  const machineId = validateUuid(id, 'MACHINE_ID');
  const machine = await Machine.findById(machineId);
  if (!machine) throw new ServiceError(404, 'MACHINE_NOT_FOUND', `Không tìm thấy máy ${machineId}.`);
  if (includeInventory) {
    return await Machine.findSlotsWithInventoryByMachineId(machineId);
  }
  return await Machine.findSlotsByMachineId(machineId);
};

// ─── Nghiệp vụ Sprint 2 (Phụ trách: HẢI) ─────────────────────────────────────

/**
 * [SPRINT 2 - Task 1] Kiểm tra quan hệ máy–khe–sản phẩm, tình trạng khe và tính nhất quán tồn kho.
 */
const checkMachineSlotInventoryConsistency = async (id) => {
  const machineId = validateUuid(id, 'MACHINE_ID');
  const [machine, slots] = await Promise.all([
    Machine.findById(machineId),
    Machine.findSlotsWithInventoryByMachineId(machineId),
  ]);
  if (!machine) throw new ServiceError(404, 'MACHINE_NOT_FOUND', `Không tìm thấy máy ${machineId}.`);

  const evaluatedMachine = evaluateConnectivity(machine);
  const readiness = evaluateMachinePurchaseReadiness(evaluatedMachine);

  const evaluatedSlots = slots.map((slot) => {
    const issues = [];
    if (!slot.inventoryId || !slot.productId) {
      issues.push({
        code: 'SLOT_UNASSIGNED',
        severity: 'INFO',
        message: `Khe ${slot.slotCode} chưa được gán sản phẩm trong bảng tồn kho.`,
      });
    } else {
      if (slot.quantity > slot.capacity) {
        issues.push({
          code: 'QUANTITY_EXCEEDS_CAPACITY',
          severity: 'ERROR',
          message: `Tồn kho (${slot.quantity}) vượt quá sức chứa tối đa của khe ${slot.slotCode} (${slot.capacity}).`,
        });
      }
      if (slot.slotStatus === 'INACTIVE' && slot.quantity > 0) {
        issues.push({
          code: 'INACTIVE_SLOT_HAS_STOCK',
          severity: 'WARNING',
          message: `Khe ${slot.slotCode} đang ngừng hoạt động (INACTIVE) nhưng vẫn còn ${slot.quantity} sản phẩm.`,
        });
      }
      if (slot.productStatus === 'INACTIVE' && slot.quantity > 0) {
        issues.push({
          code: 'INACTIVE_PRODUCT_IN_SLOT',
          severity: 'WARNING',
          message: `Sản phẩm '${slot.productName}' tại khe ${slot.slotCode} đã ngừng bán (INACTIVE).`,
        });
      }
      if (slot.slotStatus === 'ACTIVE' && slot.quantity === 0) {
        issues.push({
          code: 'ACTIVE_SLOT_OUT_OF_STOCK',
          severity: 'WARNING',
          message: `Khe ${slot.slotCode} (${slot.productName}) đã hết hàng (quantity = 0).`,
        });
      }
    }

    const hasError = issues.some((i) => i.severity === 'ERROR');
    const isSellable =
      slot.slotStatus === 'ACTIVE' &&
      slot.productId !== null &&
      slot.productStatus === 'ACTIVE' &&
      slot.quantity > 0 &&
      !hasError;

    return {
      ...slot,
      availableToSell: isSellable ? slot.quantity : 0,
      isConsistent:    !hasError,
      isSellable,
      issues,
    };
  });

  const inconsistencyCount = evaluatedSlots.filter((s) => !s.isConsistent).length;
  const sellableSlotCount = evaluatedSlots.filter((s) => s.isSellable).length;

  return {
    machineId:          evaluatedMachine.id,
    machineCode:        evaluatedMachine.machineCode,
    machineName:        evaluatedMachine.name,
    lifecycleStatus:    evaluatedMachine.lifecycleStatus,
    connectionStatus:   evaluatedMachine.connectionStatus,
    isReadyForOrder:    readiness.isReadyForOrder,
    unreadyReasons:     readiness.unreadyReasons,
    totalSlots:         evaluatedSlots.length,
    sellableSlotCount,
    inconsistencyCount,
    isAllConsistent:    inconsistencyCount === 0,
    slots:              evaluatedSlots,
  };
};

/**
 * [SPRINT 2 - Task 1] Tạo khe mới cho máy bán hàng (Quản lý khe máy).
 */
const createMachineSlot = async (machineIdParam, payload = {}) => {
  const machineId = validateUuid(machineIdParam, 'MACHINE_ID');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ServiceError(400, 'INVALID_PAYLOAD_FORMAT', 'Payload phải là JSON object.');
  }

  const { slotCode, capacity = 20, status = 'ACTIVE' } = payload;
  if (!slotCode || typeof slotCode !== 'string' || !SLOT_CODE_REGEX.test(slotCode.trim().toUpperCase())) {
    throw new ServiceError(400, 'INVALID_SLOT_CODE', 'Mã khe (slotCode) không hợp lệ (VD hợp lệ: A01, A02, B1).');
  }

  const parsedCapacity = Number(capacity);
  if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0 || parsedCapacity > 100) {
    throw new ServiceError(400, 'INVALID_SLOT_CAPACITY', 'Sức chứa của khe (capacity) phải là số nguyên từ 1 đến 100.');
  }

  const normalizedStatus = String(status).toUpperCase();
  if (!VALID_SLOT_STATUS.includes(normalizedStatus)) {
    throw new ServiceError(400, 'INVALID_SLOT_STATUS', `Trạng thái khe chỉ chấp nhận: ${VALID_SLOT_STATUS.join(', ')}.`);
  }

  const machine = await Machine.findById(machineId);
  if (!machine) throw new ServiceError(404, 'MACHINE_NOT_FOUND', `Không tìm thấy máy ${machineId}.`);

  try {
    return await Machine.createSlot(machineId, {
      slotCode: slotCode.trim().toUpperCase(),
      capacity: parsedCapacity,
      status:   normalizedStatus,
    });
  } catch (err) {
    if (err.code === '23505') {
      throw new ServiceError(409, 'DUPLICATE_SLOT_CODE', `Khe '${slotCode.trim().toUpperCase()}' đã tồn tại trong máy này.`);
    }
    throw err;
  }
};

/**
 * [SPRINT 2 - Task 1] Cập nhật trạng thái (ACTIVE/INACTIVE) hoặc sức chứa (capacity) của khe máy.
 * Đảm bảo tính nhất quán: Không cho phép giảm capacity xuống thấp hơn số lượng tồn kho hiện có trong khe.
 */
const updateMachineSlotStatus = async (machineIdParam, slotIdParam, payload = {}) => {
  const machineId = validateUuid(machineIdParam, 'MACHINE_ID');
  const slotId = validateUuid(slotIdParam, 'SLOT_ID');

  const statusInput = typeof payload === 'string' ? payload : payload?.status;
  const capacityInput = typeof payload === 'object' && payload !== null ? payload.capacity : undefined;

  let normalizedStatus = null;
  if (statusInput !== undefined) {
    if (typeof statusInput !== 'string' || !VALID_SLOT_STATUS.includes(statusInput.toUpperCase())) {
      throw new ServiceError(400, 'INVALID_SLOT_STATUS', `Trạng thái khe không hợp lệ (chỉ chấp nhận: ${VALID_SLOT_STATUS.join(', ')}).`);
    }
    normalizedStatus = statusInput.toUpperCase();
  }

  let parsedCapacity = null;
  if (capacityInput !== undefined) {
    parsedCapacity = Number(capacityInput);
    if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0 || parsedCapacity > 100) {
      throw new ServiceError(400, 'INVALID_SLOT_CAPACITY', 'Sức chứa của khe (capacity) phải là số nguyên từ 1 đến 100.');
    }
  }

  if (normalizedStatus === null && parsedCapacity === null) {
    throw new ServiceError(400, 'EMPTY_UPDATE_PAYLOAD', 'Cần cung cấp status hoặc capacity để cập nhật khe máy.');
  }

  const existingSlot = await Machine.findSlotWithInventoryById(machineId, slotId);
  if (!existingSlot) {
    throw new ServiceError(404, 'SLOT_NOT_FOUND', `Không tìm thấy khe ${slotId} thuộc máy ${machineId}.`);
  }

  // Kiểm tra tính nhất quán với tồn kho: không cho giảm capacity nhỏ hơn quantity hiện có
  if (parsedCapacity !== null && existingSlot.quantity > parsedCapacity) {
    throw new ServiceError(
      409,
      'CAPACITY_BELOW_CURRENT_STOCK',
      `Không thể giảm sức chứa của khe ${existingSlot.slotCode} xuống ${parsedCapacity} vì tồn kho hiện tại đang có ${existingSlot.quantity} sản phẩm.`,
    );
  }

  return await Machine.updateSlot(machineId, slotId, {
    status:   normalizedStatus,
    capacity: parsedCapacity,
  });
};

/**
 * [SPRINT 2 - Task 2 & 3] Xác định và phân bổ khe máy (Slot Allocation) cho từng sản phẩm trong đơn hàng.
 */
const resolveSlotsForOrderItems = async (
  machineIdParam,
  items,
  options = { enforceMachineReady: false, dbClient: null, lockRows: false },
) => {
  const machineId = validateUuid(machineIdParam, 'MACHINE_ID');

  if (!Array.isArray(items) || items.length === 0) {
    throw new ServiceError(400, 'INVALID_ORDER_ITEMS', 'Danh sách sản phẩm (items) không được để trống.');
  }
  if (items.length > MAX_ORDER_ITEMS_COUNT) {
    throw new ServiceError(400, 'TOO_MANY_ORDER_ITEMS', `Tối đa chỉ được đặt ${MAX_ORDER_ITEMS_COUNT} dòng sản phẩm mỗi đơn.`);
  }

  const aggregatedItemsMap = new Map();
  for (const item of items) {
    if (!item || typeof item !== 'object') {
      throw new ServiceError(400, 'INVALID_ORDER_ITEM_FORMAT', 'Mỗi phần tử trong items phải là một object.');
    }
    const productId = validateUuid(item.productId, 'PRODUCT_ID');
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_ITEM_QUANTITY) {
      throw new ServiceError(400, 'INVALID_ITEM_QUANTITY', `Số lượng đặt mua phải là số nguyên từ 1 đến ${MAX_ITEM_QUANTITY}.`);
    }
    const newTotalQty = (aggregatedItemsMap.get(productId) || 0) + quantity;
    if (newTotalQty > MAX_ITEM_QUANTITY) {
      throw new ServiceError(400, 'MAX_QUANTITY_EXCEEDED', `Tổng số lượng của sản phẩm ${productId} vượt mức tối đa (${MAX_ITEM_QUANTITY}).`);
    }
    aggregatedItemsMap.set(productId, newTotalQty);
  }

  const machine = await Machine.findById(machineId);
  if (!machine) throw new ServiceError(404, 'MACHINE_NOT_FOUND', `Không tìm thấy máy ${machineId}.`);

  const evaluatedMachine = evaluateConnectivity(machine);
  const readiness = evaluateMachinePurchaseReadiness(evaluatedMachine);
  if (options.enforceMachineReady && !readiness.isReadyForOrder) {
    throw new ServiceError(
      409,
      'MACHINE_NOT_READY',
      `Máy ${evaluatedMachine.machineCode} hiện không sẵn sàng nhận đơn: ${readiness.unreadyReasons.join(' ')}`,
      { unreadyReasons: readiness.unreadyReasons },
    );
  }

  const productIds = Array.from(aggregatedItemsMap.keys());
  const allProductSlots = await Machine.findProductSlotsInMachine(machineId, productIds, {
    dbClient: options.dbClient,
    lockRows: options.lockRows,
  });

  const allSlotsByProduct = new Map();
  for (const slot of allProductSlots) {
    if (!allSlotsByProduct.has(slot.productId)) allSlotsByProduct.set(slot.productId, []);
    allSlotsByProduct.get(slot.productId).push(slot);
  }

  const allocationsByProduct = [];
  const dispenseQueue = [];

  for (const [productId, requestedQty] of aggregatedItemsMap.entries()) {
    const productSlotsInMachine = allSlotsByProduct.get(productId) || [];

    // Phân biệt rõ: Sản phẩm chưa từng được gán vào bất kỳ khe nào của máy vs Sản phẩm hết hàng
    if (productSlotsInMachine.length === 0) {
      throw new ServiceError(
        404,
        'PRODUCT_NOT_IN_MACHINE',
        `Sản phẩm ${productId} không tồn tại hoặc chưa được phân bổ vào khe nào của máy ${evaluatedMachine.machineCode}.`,
        { machineId, productId },
      );
    }

    // Lọc các khe đủ điều kiện bán: Khe ACTIVE, sản phẩm ACTIVE, 0 < quantity <= capacity
    const candidateSlots = productSlotsInMachine.filter(
      (s) => s.slotStatus === 'ACTIVE' && s.productStatus === 'ACTIVE' && s.quantity > 0 && s.quantity <= s.capacity,
    );

    const totalAvailableQty = candidateSlots.reduce((sum, s) => sum + s.quantity, 0);
    if (totalAvailableQty < requestedQty) {
      throw new ServiceError(
        409,
        'OUT_OF_STOCK',
        `Sản phẩm '${productSlotsInMachine[0].productName}' không đủ tồn kho khả dụng trên máy (Yêu cầu: ${requestedQty}, Khả dụng: ${totalAvailableQty}).`,
        {
          machineId,
          productId,
          productName:       productSlotsInMachine[0].productName,
          requestedQuantity: requestedQty,
          availableQuantity: totalAvailableQty,
        },
      );
    }

    let remainingToAllocate = requestedQty;
    const allocatedSlots = [];

    for (const slot of candidateSlots) {
      if (remainingToAllocate <= 0) break;
      const takeQty = Math.min(slot.quantity, remainingToAllocate);
      remainingToAllocate -= takeQty;

      allocatedSlots.push({
        slotId:            slot.slotId,
        slotCode:          slot.slotCode,
        inventoryId:       slot.inventoryId,
        productId:         slot.productId,
        productName:       slot.productName,
        unitPrice:         slot.unitPrice,
        allocatedQuantity: takeQty,
        remainingInSlot:   slot.quantity - takeQty,
      });

      dispenseQueue.push({
        columnId:  slot.slotCode,
        slotId:    slot.slotId,
        productId: slot.productId,
        quantity:  takeQty,
      });
    }

    const firstSlot = candidateSlots[0];
    allocationsByProduct.push({
      productId,
      productName:       firstSlot.productName,
      unitPrice:         firstSlot.unitPrice,
      requestedQuantity: requestedQty,
      subtotal:          Math.round(firstSlot.unitPrice * requestedQty * 100) / 100,
      allocatedSlots,
    });
  }

  const estimatedTotalAmount = allocationsByProduct.reduce((sum, item) => sum + item.subtotal, 0);

  return {
    machineId:            evaluatedMachine.id,
    machineCode:          evaluatedMachine.machineCode,
    isMachineReady:       readiness.isReadyForOrder,
    estimatedTotalAmount: Math.round(estimatedTotalAmount * 100) / 100,
    allocations:          allocationsByProduct,
    dispenseCommandItems: dispenseQueue,
  };
};

/**
 * [SPRINT 2 - Task 2 & 3] Tạo kế hoạch nhả hàng (Dispense Plan) từ một orderId để chuẩn bị cho Sprint 3.
 * Giữ nguyên unitPrice và subtotal lịch sử tại thời điểm đặt hàng từ bảng order_items.
 */
const getOrderDispensePlan = async (orderIdParam) => {
  const orderId = validateUuid(orderIdParam, 'ORDER_ID');
  const order = await Machine.findOrderWithItemsById(orderId);
  if (!order) throw new ServiceError(404, 'ORDER_NOT_FOUND', `Không tìm thấy đơn hàng ${orderId}.`);

  if (order.orderStatus === 'CANCELLED' || order.orderStatus === 'FAILED') {
    throw new ServiceError(
      409,
      'INVALID_ORDER_STATUS_FOR_DISPENSE',
      `Không thể tạo kế hoạch nhả hàng cho đơn hàng ở trạng thái '${order.orderStatus}'.`,
    );
  }
  if (!order.items || order.items.length === 0) {
    throw new ServiceError(400, 'EMPTY_ORDER_ITEMS', 'Đơn hàng không có sản phẩm nào.');
  }

  const resolution = await resolveSlotsForOrderItems(
    order.machineId,
    order.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
    { enforceMachineReady: false },
  );

  // Bảo toàn giá bán lịch sử tại thời điểm đặt hàng (order_items.unit_price & subtotal)
  const historicalItemMap = new Map(order.items.map((i) => [i.productId, i]));
  const historicalAllocations = resolution.allocations.map((alloc) => {
    const orderItem = historicalItemMap.get(alloc.productId);
    return {
      ...alloc,
      unitPrice: orderItem ? orderItem.unitPrice : alloc.unitPrice,
      subtotal:  orderItem ? orderItem.subtotal : alloc.subtotal,
    };
  });

  return {
    orderId:          order.orderId,
    orderStatus:      order.orderStatus,
    isDispensableNow: DISPENSABLE_ORDER_STATUSES.includes(order.orderStatus),
    machineId:        order.machineId,
    machineCode:      resolution.machineCode,
    totalAmount:      order.totalAmount,
    allocations:      historicalAllocations,
    mqttDispensePayload: {
      commandId:   `cmd_${order.orderId.slice(0, 8)}`,
      orderId:     order.orderId,
      machineId:   order.machineId,
      machineCode: resolution.machineCode,
      timestamp:   new Date().toISOString(),
      items:       resolution.dispenseCommandItems,
    },
  };
};

// ─── Xử lý Telemetry từ IoT Simulator (Sprint 1) ─────────────────────────────

const receiveSimulatorStatus = async (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new ServiceError(400, 'INVALID_PAYLOAD_FORMAT', 'Payload phải là JSON object.');
  }
  const {
    machineCode,
    machineState,
    operationStatus,
    temperature,
    humidity,
    doorStatus = 'CLOSED',
    sensorStatus = 'OK',
    errorCode = null,
  } = payload;

  if (!machineCode || typeof machineCode !== 'string' || !machineCode.trim()) {
    throw new ServiceError(400, 'INVALID_MACHINE_CODE', 'Thiếu machineCode.');
  }

  const machine = await Machine.findByCode(machineCode.trim().toUpperCase());
  if (!machine) throw new ServiceError(404, 'MACHINE_NOT_FOUND', `Mã máy '${machineCode}' không tồn tại.`);

  const rawOpState = (operationStatus || machineState || 'IDLE').toUpperCase();
  if (!VALID_OPERATION_STATES.includes(rawOpState)) {
    throw new ServiceError(400, 'INVALID_MACHINE_STATE', 'Trạng thái máy không hợp lệ.');
  }
  const normalizedDoor = String(doorStatus).toUpperCase();
  if (!VALID_DOOR_STATUS.includes(normalizedDoor)) {
    throw new ServiceError(400, 'INVALID_DOOR_STATUS', 'Trạng thái cửa không hợp lệ.');
  }
  const normalizedSensor = String(sensorStatus).toUpperCase();
  if (!VALID_SENSOR_STATUS.includes(normalizedSensor)) {
    throw new ServiceError(400, 'INVALID_SENSOR_STATUS', 'Trạng thái cảm biến không hợp lệ.');
  }

  const isSensorFault = normalizedSensor === 'FAULT' || normalizedSensor === 'ERROR';
  const parsedTemp = parseStrictDecimal(temperature);
  if (Number.isNaN(parsedTemp) || (parsedTemp !== null && (parsedTemp < -50 || parsedTemp > 100))) {
    throw new ServiceError(400, 'INVALID_TEMPERATURE_VALUE', 'Nhiệt độ không hợp lệ.');
  }
  if (!isSensorFault && parsedTemp === null) {
    throw new ServiceError(400, 'MISSING_TEMPERATURE', 'Thiếu nhiệt độ.');
  }

  const parsedHumidity = parseStrictDecimal(humidity);
  if (Number.isNaN(parsedHumidity) || (parsedHumidity !== null && (parsedHumidity < 0 || parsedHumidity > 100))) {
    throw new ServiceError(400, 'INVALID_HUMIDITY_VALUE', 'Độ ẩm không hợp lệ.');
  }

  const isOutOfRange = parsedTemp !== null && (parsedTemp < machine.minTemperature || parsedTemp > machine.maxTemperature);
  const isUnauthorizedDoorOpen = normalizedDoor === 'OPEN' && rawOpState !== 'MAINTENANCE';

  let healthStatus = 'NORMAL';
  let resolvedErrorCode = errorCode;
  let warningMessage = null;
  let severity = 'INFO';

  if (isSensorFault) {
    healthStatus = 'ERROR';
    resolvedErrorCode = resolvedErrorCode || 'SENSOR_DHT22_FAULT';
    warningMessage = 'Cảm biến DHT22 lỗi.';
    severity = 'ERROR';
  } else if (isOutOfRange) {
    healthStatus = 'WARNING';
    resolvedErrorCode = resolvedErrorCode || 'TEMP_OUT_OF_RANGE';
    warningMessage = `Nhiệt độ ${parsedTemp}°C ngoài ngưỡng chuẩn.`;
    severity = 'WARNING';
  } else if (isUnauthorizedDoorOpen) {
    healthStatus = 'WARNING';
    resolvedErrorCode = resolvedErrorCode || 'UNAUTHORIZED_DOOR_OPEN';
    warningMessage = 'Cửa mở trái phép.';
    severity = 'CRITICAL';
  }

  const recorded = await Machine.recordSimulatorStatus(machine.id, {
    connectionStatus: rawOpState === 'OFFLINE' ? 'OFFLINE' : 'ONLINE',
    operationStatus:  isSensorFault ? 'ERROR' : rawOpState,
    healthStatus,
    doorStatus:       normalizedDoor,
    temperature:      parsedTemp,
    humidity:         parsedHumidity,
    errorCode:        resolvedErrorCode,
    isOutOfRange,
    eventType:        resolvedErrorCode ? 'ALERT' : 'TELEMETRY',
    severity,
    errorMessage:     warningMessage,
  });

  return { machineId: machine.id, machineCode: machine.machineCode, tempWarning: warningMessage, status: recorded };
};

module.exports = {
  ServiceError,
  getAllMachines,
  getMachineById,
  getMachineSlots,
  checkMachineSlotInventoryConsistency,
  createMachineSlot,
  updateMachineSlotStatus,
  resolveSlotsForOrderItems,
  getOrderDispensePlan,
  receiveSimulatorStatus,
};