// app.js
// Khởi tạo Express application, đăng ký middleware và router.
// Không chứa logic khởi động server (xem server.js).

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const errorHandler = require('./src/middleware/errorHandler');
const { checkConnection } = require('./src/config/db');

const app = express();

// ── Middleware toàn cục ───────────────────────────────────────────────────────
app.use(express.json());           // parse JSON request body
app.use(express.urlencoded({ extended: false })); // parse form data

// ── Health-check (dùng để kiểm tra server + DB còn sống không) ───────────────
app.get('/health', async (req, res, next) => {
  try {
    await checkConnection();
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err); // chuyển sang errorHandler → trả 503
  }
});

// ── Routes Sprint 1 ───────────────────────────────────────────────────────────
// Bỏ comment khi module tương ứng đã hoàn thành:
// app.use('/api/auth',      require('./src/modules/auth/routes'));
// app.use('/api/products',  require('./src/modules/products/routes'));
// app.use('/api/inventory', require('./src/modules/inventory/routes'));
// app.use('/api/machines',  require('./src/modules/machines/routes'));

// ── 404 — route không tồn tại ────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route '${req.method} ${req.path}' không tồn tại.`,
  });
});

// ── Error handler — PHẢI là middleware cuối cùng ──────────────────────────────
app.use(errorHandler);

module.exports = app;

