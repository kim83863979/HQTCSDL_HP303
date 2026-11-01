import { createApp } from './app.js';
import { assertDatabaseConnection, pool } from './config/db.js';

const port = Number(process.env.APP_PORT) || 3000;

try {
  await assertDatabaseConnection();
} catch (err) {
  console.error(err.message);
  process.exit(1); // khong chay gia khi chua ket noi duoc database
}

const server = createApp().listen(port, () => console.log(`Product API dang chay tai http://localhost:${port}`));

process.on('SIGINT', async () => {
  server.close();
  await pool.end();
  process.exit(0);
});
