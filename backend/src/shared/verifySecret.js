const crypto = require('node:crypto');
const httpError = require('./httpError');

module.exports = function verifySecret(envName, headerName) {
  return (req, res, next) => {
    const expected = process.env[envName];
    if (!expected) {
      return next(httpError(503, 'SECRET_NOT_CONFIGURED', `${envName} chưa được cấu hình.`));
    }
    const provided = req.get(headerName);
    if (typeof provided !== 'string' || !provided) {
      return next(httpError(401, 'UNAUTHORIZED', `Thiếu header ${headerName}.`));
    }
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const providedBuffer = Buffer.from(provided, 'utf8');
    if (expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
      return next(httpError(401, 'UNAUTHORIZED', 'Khóa xác thực không hợp lệ.'));
    }
    return next();
  };
};