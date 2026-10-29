import pg from 'pg';

// Doc cau hinh tu bien moi truong DATABASE_URL (xem .env.example).
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

/** Kiem tra ket noi luc khoi dong; loi duoc nem ra de server bao ro, khong chay gia. */
export async function assertDatabaseConnection() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    const detail = err.message || err.errors?.map((e) => e.message).join('; ') || err.code;
    throw new Error(`Khong ket noi duoc PostgreSQL: ${detail}`);
  }
}
