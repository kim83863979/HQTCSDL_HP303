import { pool } from '../../config/db.js';

const COLUMNS = 'category_id, category_name, description, created_at, updated_at';

export async function findAll() {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM categories ORDER BY category_name, category_id`);
  return rows;
}

export async function findById(id) {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM categories WHERE category_id = $1`, [id]);
  return rows[0] ?? null;
}

export async function exists(id) {
  const { rowCount } = await pool.query('SELECT 1 FROM categories WHERE category_id = $1', [id]);
  return rowCount > 0;
}
