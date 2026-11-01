const machineService = require("./machine.service");

const handleControllerError = (res, err, defaultMessage) => {
  if (err instanceof machineService.ServiceError) {
    return res.status(err.statusCode).json({
      success: false,
      errorCode: err.errorCode,
      message: err.message,
    });
  }
  console.error("[MACHINE_CONTROLLER_ERROR]:", err.message);
  return res.status(500).json({
    success: false,
    errorCode: "INTERNAL_SERVER_ERROR",
    message: defaultMessage,
  });
};

const getAllMachines = async (req, res) => {
  try {
    const machines = await machineService.getAllMachines();
    return res.status(200).json({
      success: true,
      message: "Lấy danh sách máy thành công",
      data: machines,
    });
  } catch (err) {
    return handleControllerError(res, err, "Lỗi máy chủ khi truy vấn danh sách máy");
  }
};

const getMachineById = async (req, res) => {
  try {
    const machine = await machineService.getMachineById(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Lấy thông tin chi tiết máy thành công",
      data: machine,
    });
  } catch (err) {
    return handleControllerError(res, err, "Lỗi máy chủ khi truy vấn chi tiết máy");
  }
};

const getMachineSlots = async (req, res) => {
  try {
    const slots = await machineService.getMachineSlots(req.params.id);
    return res.status(200).json({
      success: true,
      message: "Lấy danh sách khe hàng của máy thành công",
      data: slots,
    });
  } catch (err) {
    return handleControllerError(res, err, "Lỗi máy chủ khi truy vấn danh sách khe hàng");
  }
};

const receiveSimulatorStatus = async (req, res) => {
  try {
    const result = await machineService.receiveSimulatorStatus(req.body);
    return res.status(200).json({
      success: true,
      message: "Đã cập nhật trạng thái máy từ IoT Simulator",
      data: result,
    });
  } catch (err) {
    return handleControllerError(res, err, "Lỗi máy chủ khi lưu trạng thái IoT");
  }
};

module.exports = {
  getAllMachines,
  getMachineById,
  getMachineSlots,
  receiveSimulatorStatus,
};