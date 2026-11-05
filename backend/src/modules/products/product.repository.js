// src/modules/products/product.repository.js
// Truy vấn CSDL cho bảng products + join categories.
// Dùng pool từ src/config/db.js (CommonJS).

const { pool } = require('../../config/db');

const SELECT = `
  SELECT p.product_id, p.product_name, p.description, p.unit_price, p.status,
         p.created_at, p.updated_at, c.category_id, c.category_name
  FROM products p
  JOIN categories c ON c.category_id = p.category_id`;

/**
 * Lấy một trang sản phẩm, lọc tùy chọn theo danh mục và trạng thái.
 * @param {{ categoryId?: string, status?: string, page: number, size: number }} opts
 */
async function findPage({ categoryId, status, page, size }) {
  const where = [];
  const params = [];

  if (categoryId) {
    params.push(categoryId);
    where.push(`p.category_id = $${params.length}`);
  }
  if (status) {
    params.push(status);
    where.push(`p.status = $${params.length}`);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM products p ${clause}`,
    params,
  );
  const rowsResult = await pool.query(
    `${SELECT} ${clause} ORDER BY p.product_name, p.product_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, page * size],
  );

  return { rows: rowsResult.rows, total: countResult.rows[0].total };
}

/**
 * Tìm sản phẩm theo ID (kèm tên danh mục). Trả null nếu không tìm thấy.
 * @param {string} id - UUID của sản phẩm
 */
async function findById(id) {
  const { rows } = await pool.query(`${SELECT} WHERE p.product_id = $1`, [id]);
  return rows[0] ?? null;
}

module.exports = { findPage, findById };

