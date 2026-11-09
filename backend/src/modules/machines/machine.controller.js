// src/modules/machines/machine.controller.js
const machineService = require('./machine.service');

const handleControllerError = (res, err, defaultMessage) => {
  if (err instanceof machineService.ServiceError) {
    const responseBody = {
      success:   false,
      errorCode: err.errorCode,
      message:   err.message,
    };
    if (err.details) responseBody.details = err.details;
    return res.status(err.statusCode).json(responseBody);
  }
  console.error('[MACHINE_CONTROLLER_ERROR]:', err.message);
  return res.status(500).json({
    success:   false,
    errorCode: 'INTERNAL_SERVER_ERROR',
    message:   defaultMessage,
  });
};

const getAllMachines = async (req, res) => {
  try {
    const machines = await machineService.getAllMachines();
    return res.status(200).json({ success: true, message: 'Lấy danh sách máy thành công', data: machines });
  } catch (err) {
    return handleControllerError(res, err, 'Lỗi máy chủ khi truy vấn danh sách máy');
  }
};

const getMachineById = async (req, res) => {
  try {
    const machine = await machineService.getMachineById(req.params.id);
    return res.status(200).json({ success: true, message: 'Lấy chi tiết máy thành công', data: machine });
  } catch (err) {
    return handleControllerError(res, err, 'Lỗi máy chủ khi truy vấn chi tiết máy');
  }
};

const getMachineSlots = async (req, res) => {
  try {
    const includeInventory = req.query.includeInventory === 'true';
    const slots = await machineService.getMachineSlots(req.params.id, { includeInventory });
    return res.status(200).json({ success: true, message: 'Lấy danh sách khe hàng thành công', data: slots });
  } catch (err) {
    return handleControllerError(res, err, 'Lỗi máy chủ khi lấy danh sách khe hàng');
  }
};

const checkConsistency = async (req, res) => {
  try {
    const report = await machineService.checkMachineSlotInventoryConsistency(req.params.id);
    return res.status(200).json({ success: true, message: 'Kiểm tra tính nhất quán thành công', data: report });
  } catch (err) {
    return handleControllerError(res, err, 'Lỗi máy chủ khi kiểm tra tính nhất quán');
  }
};

const createSlot = async (req, res) => {
  try {
    const newSlot = await machineService.createMachineSlot(req.params.id, req.body);
    return res.status(201).json({ success: true, message: 'Thêm khe máy mới thành công', data: newSlot });
  } catch (err) {
    return handleControllerError(res, err, 'Lỗi máy chủ khi thêm khe máy mới');
  }
};

const updateSlotStatus = async (req, res) => {
  try {
    const updatedSlot = await machineService.updateMachineSlotStatus(
      req.params.id,
      req.params.slotId,
      req.body,
    );
    return res.status(200).json({ success: true, message: 'Cập nhật thông tin khe máy thành công', data: updatedSlot });
  } catch (err) {
    return handleControllerError(res, err, 'Lỗi máy chủ khi cập nhật thông tin khe máy');
  }
};

const resolveOrderSlots = async (req, res) => {
  try {
    const { items, enforceMachineReady = false } = req.body || {};
    const allocation = await machineService.resolveSlotsForOrderItems(
      req.params.id,
      items,
      { enforceMachineReady: Boolean(enforceMachineReady) },
    );
    return res.status(200).json({ success: true, message: 'Phân bổ khe hàng thành công', data: allocation });
  } catch (err) {
    return handleControllerError(res, err, 'Lỗi máy chủ khi phân bổ khe hàng');
  }
};

const getOrderDispensePlan = async (req, res) => {
  try {
    const plan = await machineService.getOrderDispensePlan(req.params.orderId);
    return res.status(200).json({ success: true, message: 'Tạo kế hoạch nhả hàng thành công', data: plan });
  } catch (err) {
    return handleControllerError(res, err, 'Lỗi máy chủ khi tạo kế hoạch nhả hàng');
  }
};

const receiveSimulatorStatus = async (req, res) => {
  try {
    const result = await machineService.receiveSimulatorStatus(req.body);
    return res.status(200).json({ success: true, message: 'Cập nhật trạng thái IoT thành công', data: result });
  } catch (err) {
    return handleControllerError(res, err, 'Lỗi máy chủ khi lưu trạng thái IoT');
  }
};

module.exports = {
  getAllMachines,
  getMachineById,
  getMachineSlots,
  checkConsistency,
  createSlot,
  updateSlotStatus,
  resolveOrderSlots,
  getOrderDispensePlan,
  receiveSimulatorStatus,
};