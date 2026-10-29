import { pool } from '../../config/db.js';

const SELECT = `
  SELECT p.product_id, p.product_name, p.description, p.unit_price, p.status,
         p.created_at, p.updated_at, c.category_id, c.category_name
  FROM products p
  JOIN categories c ON c.category_id = p.category_id`;

/** Lay mot trang san pham, loc tuy chon theo danh muc va trang thai. */
export async function findPage({ categoryId, status, page, size }) {
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

  const count = await pool.query(`SELECT COUNT(*)::int AS total FROM products p ${clause}`, params);
  const rows = await pool.query(
    `${SELECT} ${clause} ORDER BY p.product_name, p.product_id LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, size, page * size],
  );
  return { rows: rows.rows, total: count.rows[0].total };
}

export async function findById(id) {
  const { rows } = await pool.query(`${SELECT} WHERE p.product_id = $1`, [id]);
  return rows[0] ?? null;
}
