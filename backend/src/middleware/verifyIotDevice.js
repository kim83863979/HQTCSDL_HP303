const crypto = require("crypto");

/**
 * Middleware xác thực thiết bị IoT bằng thuật toán so sánh hằng số thời gian (Chống Timing Attack)
 */
const verifyIotDevice = (req, res, next) => {
  const configuredSecret = process.env.IOT_DEVICE_SECRET;
  
  if (!configuredSecret) {
    return next();
  }

  const providedKey = req.headers["x-iot-key"];
  if (typeof providedKey !== "string" || !providedKey.trim()) {
    return res.status(401).json({
      success: false,
      errorCode: "UNAUTHORIZED_IOT_DEVICE",
      message: "Từ chối truy cập: Thiếu hoặc sai định dạng khóa xác thực thiết bị IoT (x-iot-key).",
    });
  }

  const secretBuffer = Buffer.from(configuredSecret, "utf8");
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