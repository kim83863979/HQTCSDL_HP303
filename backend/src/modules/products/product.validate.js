// src/modules/products/product.validate.js
// Hàm kiểm tra và parse tham số đầu vào cho API products & categories.

const { badRequest } = require('./product.errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Xác nhận giá trị là UUID hợp lệ. Ném 400 nếu không hợp lệ.
 * @param {string} value
 * @param {string} name  - Tên tham số (dùng trong thông báo lỗi)
 */
function requireUuid(value, name) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw badRequest(`Giá trị '${value}' không hợp lệ cho tham số '${name}' (phải là UUID)`);
  }
  return value;
}

/**
 * Parse một tham số query thành số nguyên trong khoảng [min, max].
 * Trả về fallback nếu tham số không có. Ném 400 nếu ngoài khoảng.
 */
function parseIntInRange(value, name, { min, max, fallback }) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`Tham số '${name}' phải là số nguyên từ ${min} đến ${max}`);
  }
  return n;
}

module.exports = { requireUuid, parseIntInRange };

