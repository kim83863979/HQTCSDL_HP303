const crypto = require("crypto");

/**
 * Middleware xác thực thiết bị IoT bằng thuật toán so sánh hằng số thời gian (Chống Timing Attack)
 */
const verifyIotDevice = (req, res, next) => {
  const configuredSecret = process.env.IOT_DEVICE_SECRET;
  
  if (!configuredSecret) {
    return res.status(503).json({
      success: false,
      errorCode: "IOT_DEVICE_AUTH_NOT_CONFIGURED",
      message: "IOT_DEVICE_SECRET phải được cấu hình trước khi nhận bản tin thiết bị.",
    });
  }
  const secretBuffer = Buffer.from(configuredSecret, "utf8");
  if (secretBuffer.length < 32) {
    return res.status(503).json({
      success: false,
      errorCode: "IOT_DEVICE_AUTH_MISCONFIGURED",
      message: "IOT_DEVICE_SECRET phải có ít nhất 32 byte.",
    });
  }

  const providedKey = req.headers["x-iot-key"];
  if (typeof providedKey !== "string" || !providedKey.trim()) {
    return res.status(401).json({
      success: false,
      errorCode: "UNAUTHORIZED_IOT_DEVICE",
      message: "Từ chối truy cập: Thiếu hoặc sai định dạng khóa xác thực thiết bị IoT (x-iot-key).",
    });
  }

  const providedBuffer = Buffer.from(providedKey, "utf8");

  if (
    secretBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(secretBuffer, providedBuffer)
  ) {
    return res.status(401).json({
      success: false,
      errorCode: "UNAUTHORIZED_IOT_DEVICE",
      message: "Từ chối truy cập: Khóa xác thực thiết bị IoT không hợp lệ.",
    });
  }

  return next();
};

module.exports = verifyIotDevice;