// server.js
// Entry point của backend FreshVend.
// Quy trình: kiểm tra kết nối DB trước → nếu OK mới lắng nghe HTTP.
// Nếu DB lỗi → in thông báo rõ ràng → thoát với exit code 1.

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const app = require("./app");
const { checkConnection } = require("./src/config/db");
const { pool } = require("./src/config/db");
const { MqttAdapter } = require("./src/modules/iot/mqtt.adapter");
const dispenseService = require("./src/modules/iot/dispense.service");

const PORT = process.env.APP_PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

async function start() {
  console.log("=".repeat(55));
  console.log("  FreshVend Backend — đang khởi động...");
  console.log(`    Môi trường : ${NODE_ENV}`);
  console.log(`    Port       : ${PORT}`);
  console.log("=".repeat(55));

  // ── 1. Kiểm tra kết nối cơ sở dữ liệu ──────────────────────────────────────
  try {
    await checkConnection();
  } catch (err) {
    // In thông báo lỗi rõ ràng để dễ debug
    console.error("\n" + "!".repeat(55));
    console.error("   KHÔNG THỂ KẾT NỐI TỚI CƠ SỞ DỮ LIỆU");
    console.error("!".repeat(55));
    console.error(` Mã lỗi  : ${err.code || "N/A"}`);
    console.error(` Chi tiết: ${err.message}`);
    console.error("\n Hãy kiểm tra:");
    console.error("   1. PostgreSQL có đang chạy không?");
    console.error("      → Mở DBeaver, thử kết nối lại.");
    console.error("   2. DATABASE_URL trong file .env có đúng không?");
    console.error(
      `      → Trạng thái: ${process.env.DATABASE_URL ? "đã cấu hình" : "chưa cấu hình"}`,
    );
    console.error('   3. Database "FreshVend" đã được tạo và import SQL chưa?');
    console.error(
      "      → Xem database/README.md để khôi phục baseline và chạy migrations.",
    );
    console.error("!".repeat(55) + "\n");
    process.exit(1); // dừng hẳn, không khởi động server
  }

  let mqttAdapter = null;
  if (process.env.MQTT_ENABLED !== "false") {
    try {
      mqttAdapter = new MqttAdapter();
      mqttAdapter.start({
        onTelemetry: dispenseService.receiveTelemetry,
        onStatus: dispenseService.receiveConnectionStatus,
        onDispenseResult: dispenseService.processDispenseResult,
        onAlert: dispenseService.receiveAlert,
        onControlResult: dispenseService.receiveControlResult,
      });
      dispenseService.start(mqttAdapter);
    } catch (err) {
      console.error("[MQTT] Configuration/startup failed:", err.message);
      process.exitCode = 1;
      await pool.end();
      return;
    }
  }

  // ── 2. Khởi động HTTP server ─────────────────────────────────────────────────
  const server = app.listen(PORT, () => {
    console.log("\n" + "=".repeat(55));
    console.log(`   Server đang chạy tại http://localhost:${PORT}`);
    console.log(`   Health check : http://localhost:${PORT}/health`);
    console.log("=".repeat(55) + "\n");
  });

  const shutdown = async () => {
    dispenseService.stop();
    if (mqttAdapter) await mqttAdapter.stop();
    server.close(async () => {
      await pool.end();
      process.exitCode = 0;
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

start();
