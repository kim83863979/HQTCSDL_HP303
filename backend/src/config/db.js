// src/config/db.js
// Pool kết nối PostgreSQL dùng chung toàn ứng dụng.
// Đọc cấu hình từ biến môi trường DATABASE_URL — không ghi mật khẩu ở đây.

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                       // tối đa 10 kết nối đồng thời
  idleTimeoutMillis: 30000,      // đóng kết nối rảnh sau 30 s
  connectionTimeoutMillis: 5000, // báo lỗi nếu không lấy được kết nối sau 5 s
});

// Bắt lỗi idle client để không crash toàn app
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

/**
 * Chạy một câu SQL parameterized, tự trả client về pool sau khi xong.
 * @param {string} text   - Câu SQL, dùng $1 $2 … cho tham số
 * @param {Array}  params - Mảng tham số tương ứng
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const ms = Date.now() - start;
    console.log('[DB] query ok', { text: text.slice(0, 80), ms, rows: result.rowCount });
    return result;
  } catch (err) {
    console.error('[DB] query error:', err.message, '| SQL:', text.slice(0, 80));
    throw err; // ném lên để middleware errorHandler xử lý
  }
}

/**
 * Lấy một client thô từ pool (dùng cho transaction).
 * Nhớ gọi client.release() trong khối finally.
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return pool.connect();
}

/**
 * Kiểm tra kết nối thực sự bằng cách chạy một query đơn giản.
 * Gọi trong server.js khi khởi động; throws nếu không kết nối được.
 */
async function checkConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT NOW() AS now, current_database() AS db'
    );
    const { db, now } = result.rows[0];
    console.log('[DB] ✅ Connected to PostgreSQL');
    console.log(`[DB]    Database   : ${db}`);
    console.log(`[DB]    Server time: ${now}`);
  } finally {
    client.release();
  }
}

module.exports = { query, getClient, checkConnection, pool };

