const express = require('express');
const { query } = require('../../config/db');
const httpError = require('../../shared/httpError');

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT c.category_id AS "categoryId",
              c.category_name AS "categoryName", c.description,
              c.created_at AS "createdAt", c.updated_at AS "updatedAt",
              COUNT(p.product_id)::int AS "activeProductCount"
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.category_id AND p.status = 'ACTIVE'
        GROUP BY c.category_id
        ORDER BY c.category_name, c.category_id`
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.get('/:categoryId', async (req, res, next) => {
  try {
    const { categoryId } = req.params;
    if (!UUID.test(categoryId)) {
      throw httpError(400, 'INVALID_CATEGORY_ID', 'categoryId phải là UUID hợp lệ.');
    }
    const result = await query(
      `SELECT c.category_id AS "categoryId",
              c.category_name AS "categoryName", c.description,
              c.created_at AS "createdAt", c.updated_at AS "updatedAt",
              COUNT(p.product_id)::int AS "activeProductCount"
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.category_id AND p.status = 'ACTIVE'
        WHERE c.category_id = $1
        GROUP BY c.category_id`,
      [categoryId]
    );
    if (!result.rows[0]) throw httpError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục.');
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
