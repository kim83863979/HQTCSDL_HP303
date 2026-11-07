// src/modules/products/product.errors.js
// Lớp lỗi và các hàm tạo lỗi nhanh cho module products.
// Tương thích với errorHandler.js ở middleware (kiểm tra err.status).

class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

const badRequest = (message) => new AppError(400, message);
const notFound = (message) => new AppError(404, message);

module.exports = { AppError, badRequest, notFound };

