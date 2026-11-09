// src/middleware/errorHandler.js
// Middleware xử lý lỗi tập trung — phải đăng ký CUỐI CÙNG trong app.js.
// Nhận 4 tham số (err, req, res, next) theo quy ước Express.

/**
 * Ánh xạ mã lỗi PostgreSQL sang HTTP response rõ ràng.
 * Tham khảo: https://www.postgresql.org/docs/current/errcodes-appendix.html
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars

  // ── Lỗi kết nối mạng / PostgreSQL chưa chạy ───────────────────────────────
  if (err.code === 'ECONNREFUSED') {
    console.error('[ErrorHandler] DB connection refused:', err.message);
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Không thể kết nối tới cơ sở dữ liệu. PostgreSQL có thể chưa chạy.',
      code: 'DB_CONNECTION_REFUSED',
    });
  }

  if (err.code === 'ENOTFOUND') {
    console.error('[ErrorHandler] DB host not found:', err.message);
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Không tìm thấy host cơ sở dữ liệu. Kiểm tra DATABASE_URL trong .env.',
      code: 'DB_HOST_NOT_FOUND',
    });
  }

  // ── Timeout ───────────────────────────────────────────────────────────────
  if (err.code === 'ETIMEDOUT' || (err.message && err.message.toLowerCase().includes('timeout'))) {
    console.error('[ErrorHandler] DB timeout:', err.message);
    return res.status(504).json({
      error: 'Gateway Timeout',
      message: 'Kết nối cơ sở dữ liệu bị timeout.',
      code: 'DB_TIMEOUT',
    });
  }

  // ── Xác thực PostgreSQL thất bại (sai user/password) ─────────────────────
  if (err.code === '28P01' || err.code === '28000') {
    console.error('[ErrorHandler] DB auth failed:', err.message);
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Xác thực cơ sở dữ liệu thất bại. Kiểm tra user/password trong .env.',
      code: 'DB_AUTH_FAILED',
    });
  }

  // ── Database không tồn tại ────────────────────────────────────────────────
  if (err.code === '3D000') {
    console.error('[ErrorHandler] DB does not exist:', err.message);
    return res.status(503).json({
      error: 'Service Unavailable',
      message: 'Database không tồn tại. Hãy tạo database và chạy migration trước.',
      code: 'DB_NOT_FOUND',
    });
  }

  // ── Vi phạm UNIQUE constraint ─────────────────────────────────────────────
  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Dữ liệu đã tồn tại (vi phạm ràng buộc UNIQUE).',
      code: 'DUPLICATE_ENTRY',
      detail: err.detail || undefined,
    });
  }

  // ── Vi phạm FOREIGN KEY ────────────────────────────────────────────────────
  if (err.code === '23503') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Vi phạm ràng buộc khóa ngoại (dữ liệu tham chiếu không tồn tại).',
      code: 'FOREIGN_KEY_VIOLATION',
      detail: err.detail || undefined,
    });
  }

  // ── Vi phạm CHECK constraint ───────────────────────────────────────────────
  if (err.code === '23514') {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Dữ liệu không thỏa ràng buộc CHECK của bảng.',
      code: 'CHECK_VIOLATION',
      detail: err.detail || undefined,
    });
  }

  // ── Vi phạm NOT NULL ───────────────────────────────────────────────────────
  if (err.code === '23502') {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Trường bắt buộc bị thiếu: ${err.column || 'không xác định'}.`,
      code: 'NOT_NULL_VIOLATION',
    });
  }

  // ── Lỗi cú pháp SQL (chỉ xảy ra khi dev) ─────────────────────────────────
  if (err.code === '42601') {
    console.error('[ErrorHandler] SQL syntax error:', err.message);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Lỗi cú pháp SQL (báo cáo cho developer).',
      code: 'SQL_SYNTAX_ERROR',
    });
  }

  // ── Lỗi HTTP tự định nghĩa (ném từ route với err.status) ──────────────────
  if (err.status) {
    return res.status(err.status).json({
      error: err.name || 'Error',
      message: err.message,
      code: err.code || undefined,
    });
  }

  // ── Lỗi không xác định — 500 ───────────────────────────────────────────────
  console.error('[ErrorHandler] Unhandled error:', err);
  return res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'Đã xảy ra lỗi phía máy chủ.'
      : err.message, // hiển thị chi tiết khi development
  });
}

module.exports = errorHandler;

