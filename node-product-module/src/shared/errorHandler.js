import { AppError } from './errors.js';

const STATUS_TEXT = {
  400: 'Bad Request',
  404: 'Not Found',
  500: 'Internal Server Error',
  503: 'Service Unavailable',
};

function isDatabaseDown(err) {
  const codes = [err.code, ...(err.errors ?? []).map((e) => e.code)];
  return codes.some((c) => c === 'ECONNREFUSED' || c === 'ENOTFOUND' || c === 'ETIMEDOUT' || (typeof c === 'string' && c.startsWith('08')));
}

function body(status, message, req) {
  return {
    timestamp: new Date().toISOString(),
    status,
    error: STATUS_TEXT[status] ?? 'Error',
    message,
    path: req.originalUrl.split('?')[0],
  };
}

// Dinh dang loi tam thoi cua module san pham.
// Khi KIM chot format loi chung cua backend thi thay file nay bang format chung.
export function notFoundHandler(req, res) {
  res.status(404).json(body(404, `Khong tim thay duong dan ${req.method} ${req.originalUrl.split('?')[0]}`, req));
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json(body(err.status, err.message, req));
  }
  if (isDatabaseDown(err)) {
    console.error('Loi ket noi database:', err.message || err.code);
    return res.status(503).json(body(503, 'Khong ket noi duoc co so du lieu', req));
  }
  console.error(err);
  return res.status(500).json(body(500, 'Loi may chu', req));
}
