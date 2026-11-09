const express = require('express');
const { query } = require('../../config/db');
const httpError = require('../../shared/httpError');

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mapProduct = (product) => ({
  ...product,
  unitPrice: Number(product.unitPrice),
});

router.get('/', async (req, res, next) => {
  try {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    const { categoryId } = req.query;
    if (!Number.isInteger(page) || page < 1 ||
        !Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw httpError(400, 'INVALID_PAGINATION', 'page phải >= 1; limit phải từ 1 đến 100.');
    }
    if (categoryId && !UUID.test(categoryId)) {
      throw httpError(400, 'INVALID_CATEGORY_ID', 'categoryId phải là UUID hợp lệ.');
    }

    const values = [];
    let filter = "p.status = 'ACTIVE'";
    if (categoryId) {
      values.push(categoryId);
      filter += ` AND p.category_id = $1`;
    }
    const count = await query(
      `SELECT COUNT(*)::int AS total FROM products p WHERE ${filter}`,
      values
    );
    const offset = (page - 1) * limit;
    const data = await query(
      `SELECT p.product_id AS "productId", p.product_name AS "productName",
              p.description, p.unit_price AS "unitPrice", p.status,
              p.category_id AS "categoryId", c.category_name AS "categoryName",
              p.created_at AS "createdAt", p.updated_at AS "updatedAt"
         FROM products p JOIN categories c ON c.category_id = p.category_id
        WHERE ${filter}
        ORDER BY p.product_name, p.product_id
        LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset]
    );
    const total = count.rows[0].total;
    return res.json({
      success: true,
      data: data.rows.map(mapProduct),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:productId', async (req, res, next) => {
  try {
    const { productId } = req.params;
    if (!UUID.test(productId)) {
      throw httpError(400, 'INVALID_PRODUCT_ID', 'productId phải là UUID hợp lệ.');
    }
    const result = await query(
      `SELECT p.product_id AS "productId", p.product_name AS "productName",
              p.description, p.unit_price AS "unitPrice", p.status,
              p.category_id AS "categoryId", c.category_name AS "categoryName",
              p.created_at AS "createdAt", p.updated_at AS "updatedAt"
         FROM products p JOIN categories c ON c.category_id = p.category_id
        WHERE p.product_id = $1 AND p.status = 'ACTIVE'`,
      [productId]
    );
    if (!result.rows[0]) {
      throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm đang được bán.');
    }
    return res.json({ success: true, data: mapProduct(result.rows[0]) });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
