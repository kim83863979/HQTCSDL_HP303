// server.js
// Entry point của backend FreshVend.
// Quy trình: kiểm tra kết nối DB trước → nếu OK mới lắng nghe HTTP.
// Nếu DB lỗi → in thông báo rõ ràng → thoát với exit code 1.

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const app = require('./app');
const { checkConnection } = require('./src/config/db');

const PORT = process.env.APP_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

async function start() {
  console.log('='.repeat(55));
  console.log(' 🥤 FreshVend Backend — đang khởi động...');
  console.log(`    Môi trường : ${NODE_ENV}`);
  console.log(`    Port       : ${PORT}`);
  console.log('='.repeat(55));

  // ── 1. Kiểm tra kết nối cơ sở dữ liệu ──────────────────────────────────────
  try {
    await checkConnection();
  } catch (err) {
    // In thông báo lỗi rõ ràng để dễ debug
    console.error('\n' + '!'.repeat(55));
    console.error(' ❌  KHÔNG THỂ KẾT NỐI TỚI CƠ SỞ DỮ LIỆU');
    console.error('!'.repeat(55));
    console.error(` Mã lỗi  : ${err.code || 'N/A'}`);
    console.error(` Chi tiết: ${err.message}`);
    console.error('\n Hãy kiểm tra:');
    console.error('   1. PostgreSQL có đang chạy không?');
    console.error('      → Mở DBeaver, thử kết nối lại.');
    console.error('   2. DATABASE_URL trong file .env có đúng không?');
    console.error(`      → Hiện tại: ${process.env.DATABASE_URL || '(chưa cấu hình)'}`);
    console.error('   3. Database "FreshVend" đã được tạo và import SQL chưa?');
    console.error('      → Xem: database/migrations/dump-FreshVend-202611011643.sql');
    console.error('!'.repeat(55) + '\n');
    process.exit(1); // dừng hẳn, không khởi động server
  }

  // ── 2. Khởi động HTTP server ─────────────────────────────────────────────────
  app.listen(PORT, () => {
    console.log('\n' + '='.repeat(55));
    console.log(` ✅  Server đang chạy tại http://localhost:${PORT}`);
    console.log(` 🔍  Health check : http://localhost:${PORT}/health`);
    console.log('='.repeat(55) + '\n');
  });
}

start();

