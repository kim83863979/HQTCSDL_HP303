const crypto = require('crypto');

const verifySharedSecret = ({ environmentVariable, headerName, errorCode }) => (req, res, next) => {
  const expected = process.env[environmentVariable];
  if (!expected) {
    return res.status(503).json({
      success: false,
      errorCode: `${errorCode}_NOT_CONFIGURED`,
      message: 'API xác thực chưa được cấu hình trên máy chủ.',
    });
  }

  const provided = req.headers[headerName];
  if (typeof provided !== 'string') {
    return res.status(401).json({
      success: false,
      errorCode,
      message: 'Thiếu khóa xác thực.',
    });
  }

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const providedBuffer = Buffer.from(provided, 'utf8');
  if (expectedBuffer.length !== providedBuffer.length
      || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
    return res.status(401).json({
      success: false,
      errorCode,
      message: 'Khóa xác thực không hợp lệ.',
    });
  }

  return next();
};

module.exports = verifySharedSecret;
