// src/modules/products/category.repository.js
// Truy vấn CSDL cho bảng categories.

const { pool } = require('../../config/db');

const COLUMNS = 'category_id, category_name, description, created_at, updated_at';

/** Lấy toàn bộ danh mục, sắp xếp theo tên. */
async function findAll() {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM categories ORDER BY category_name, category_id`,
  );
  return rows;
}

/** Tìm danh mục theo ID. Trả null nếu không tìm thấy. */
async function findById(id) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM categories WHERE category_id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

/** Kiểm tra danh mục có tồn tại không. */
async function exists(id) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM categories WHERE category_id = $1',
    [id],
  );
  return rowCount > 0;
}

module.exports = { findAll, findById, exists };

