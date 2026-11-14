const express = require('express');
const { pool } = require('../../config/db');
const httpError = require('../../shared/httpError');
const { authenticateToken, requirePermissions } = require('../auth/auth.middleware');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_STATUSES = new Set(['ACTIVE', 'INACTIVE']);
const PRODUCT_SELECT = `
  SELECT p.product_id AS "productId", p.product_name AS "productName",
         p.description, p.unit_price AS "unitPrice", p.status,
         p.category_id AS "categoryId", c.category_name AS "categoryName",
         p.created_at AS "createdAt", p.updated_at AS "updatedAt"
  FROM public.products p
  JOIN public.categories c ON c.category_id = p.category_id
`;
const CATEGORY_SELECT = `
  SELECT c.category_id AS "categoryId", c.category_name AS "categoryName",
         c.description, c.created_at AS "createdAt", c.updated_at AS "updatedAt",
         COUNT(p.product_id) FILTER (WHERE p.status = 'ACTIVE')::int AS "activeProductCount",
         COUNT(p.product_id)::int AS "productCount"
  FROM public.categories c
  LEFT JOIN public.products p ON p.category_id = c.category_id
`;

router.use('/products', authenticateToken, requirePermissions('MANAGE_PRODUCT'));
router.use('/categories', authenticateToken, requirePermissions('MANAGE_PRODUCT'));

function parsePagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1
      || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw httpError(400, 'INVALID_PAGINATION', 'page phải >= 1; limit phải từ 1 đến 100.');
  }
  return { page, limit };
}

function validateUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw httpError(400, `INVALID_${field.toUpperCase()}`, `${field} phải là UUID hợp lệ.`);
  }
}

function validateName(value, field, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw httpError(400, 'INVALID_INPUT', `${field} không được để trống và tối đa ${maxLength} ký tự.`);
  }
  return value.trim();
}

function validateDescription(value) {
  if (value !== null && value !== undefined
      && (typeof value !== 'string' || value.length > 2000)) {
    throw httpError(400, 'INVALID_DESCRIPTION', 'description phải là chuỗi tối đa 2000 ký tự hoặc null.');
  }
  return value ?? null;
}

function validatePrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0 || price > 99999999.99) {
    throw httpError(400, 'INVALID_UNIT_PRICE', 'unitPrice phải lớn hơn 0 và không vượt quá 99,999,999.99.');
  }
  return price;
}

function validateProductStatus(value) {
  if (typeof value !== 'string' || !PRODUCT_STATUSES.has(value)) {
    throw httpError(400, 'INVALID_PRODUCT_STATUS', 'status chỉ nhận ACTIVE hoặc INACTIVE.');
  }
  return value;
}

function mapDatabaseError(error, resource) {
  if (error.code === '23505') {
    return httpError(409, 'DUPLICATE_NAME', `${resource} với tên này đã tồn tại.`);
  }
  if (error.code === '23503') {
    return httpError(409, 'RESOURCE_IN_USE', 'Dữ liệu đang được tham chiếu và không thể xóa hoặc cập nhật.');
  }
  return error;
}

router.get('/products', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const { search, categoryId } = req.query;
    const status = req.query.status === undefined ? 'ALL' : req.query.status;
    if (!['ALL', ...PRODUCT_STATUSES].includes(status)) {
      throw httpError(400, 'INVALID_PRODUCT_STATUS', 'status chỉ nhận ALL, ACTIVE hoặc INACTIVE.');
    }
    if (categoryId !== undefined) validateUuid(categoryId, 'categoryId');

    const conditions = [];
    const values = [];
    if (status !== 'ALL') {
      values.push(status);
      conditions.push(`p.status = $${values.length}`);
    }
    if (categoryId) {
      values.push(categoryId);
      conditions.push(`p.category_id = $${values.length}`);
    }
    if (search !== undefined) {
      if (typeof search !== 'string' || search.length > 150) {
        throw httpError(400, 'INVALID_SEARCH', 'search tối đa 150 ký tự.');
      }
      values.push(`%${search.trim()}%`);
      conditions.push(`(p.product_name ILIKE $${values.length} OR COALESCE(p.description, '') ILIKE $${values.length})`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM public.products p ${where}`,
      values,
    );
    const total = count.rows[0].total;
    const result = await pool.query(
      `${PRODUCT_SELECT} ${where}
       ORDER BY p.product_name, p.product_id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit],
    );
    return res.json({
      success: true,
      data: result.rows.map((product) => ({ ...product, unitPrice: Number(product.unitPrice) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/products/:productId', async (req, res, next) => {
  try {
    validateUuid(req.params.productId, 'productId');
    const result = await pool.query(
      `${PRODUCT_SELECT} WHERE p.product_id = $1`,
      [req.params.productId],
    );
    if (!result.rows[0]) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm.');
    return res.json({
      success: true,
      data: { ...result.rows[0], unitPrice: Number(result.rows[0].unitPrice) },
    });
  } catch (error) {
    return next(error);
  }
});

router.post('/products', async (req, res, next) => {
  try {
    const body = req.body || {};
    validateUuid(body.categoryId, 'categoryId');
    const productName = validateName(body.productName, 'productName', 150);
    const unitPrice = validatePrice(body.unitPrice);
    const description = validateDescription(body.description);
    const status = body.status === undefined ? 'ACTIVE' : validateProductStatus(body.status);
    const result = await pool.query(
      `INSERT INTO public.products (category_id, product_name, description, unit_price, status)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING product_id`,
      [body.categoryId, productName, description, unitPrice, status],
    );
    const product = await pool.query(
      `${PRODUCT_SELECT} WHERE p.product_id = $1`,
      [result.rows[0].product_id],
    );
    return res.status(201).json({
      success: true,
      data: { ...product.rows[0], unitPrice: Number(product.rows[0].unitPrice) },
    });
  } catch (error) {
    return next(mapDatabaseError(error, 'Sản phẩm'));
  }
});

router.patch('/products/:productId', async (req, res, next) => {
  try {
    validateUuid(req.params.productId, 'productId');
    const body = req.body || {};
    const allowed = ['categoryId', 'productName', 'description', 'unitPrice', 'status'];
    const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
    if (unknown.length || !Object.keys(body).length) {
      throw httpError(400, 'INVALID_UPDATE', 'Cần cung cấp trường sản phẩm hợp lệ để cập nhật.');
    }

    const values = [];
    const updates = [];
    if (Object.hasOwn(body, 'categoryId')) {
      validateUuid(body.categoryId, 'categoryId');
      values.push(body.categoryId);
      updates.push(`category_id = $${values.length}`);
    }
    if (Object.hasOwn(body, 'productName')) {
      values.push(validateName(body.productName, 'productName', 150));
      updates.push(`product_name = $${values.length}`);
    }
    if (Object.hasOwn(body, 'description')) {
      values.push(validateDescription(body.description));
      updates.push(`description = $${values.length}`);
    }
    if (Object.hasOwn(body, 'unitPrice')) {
      values.push(validatePrice(body.unitPrice));
      updates.push(`unit_price = $${values.length}`);
    }
    if (Object.hasOwn(body, 'status')) {
      values.push(validateProductStatus(body.status));
      updates.push(`status = $${values.length}`);
    }
    values.push(req.params.productId);
    const result = await pool.query(
      `UPDATE public.products
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE product_id = $${values.length}
       RETURNING product_id`,
      values,
    );
    if (!result.rows[0]) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm.');
    const product = await pool.query(
      `${PRODUCT_SELECT} WHERE p.product_id = $1`,
      [req.params.productId],
    );
    return res.json({
      success: true,
      data: { ...product.rows[0], unitPrice: Number(product.rows[0].unitPrice) },
    });
  } catch (error) {
    return next(mapDatabaseError(error, 'Sản phẩm'));
  }
});

router.get('/categories', async (req, res, next) => {
  try {
    const result = await pool.query(
      `${CATEGORY_SELECT}
       GROUP BY c.category_id
       ORDER BY c.category_name, c.category_id`,
    );
    return res.json({ success: true, data: result.rows });
  } catch (error) {
    return next(error);
  }
});

router.get('/categories/:categoryId', async (req, res, next) => {
  try {
    validateUuid(req.params.categoryId, 'categoryId');
    const result = await pool.query(
      `${CATEGORY_SELECT}
       WHERE c.category_id = $1
       GROUP BY c.category_id`,
      [req.params.categoryId],
    );
    if (!result.rows[0]) throw httpError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục.');
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.post('/categories', async (req, res, next) => {
  try {
    const body = req.body || {};
    const categoryName = validateName(body.categoryName, 'categoryName', 100);
    const description = validateDescription(body.description);
    const result = await pool.query(
      `INSERT INTO public.categories (category_name, description)
       VALUES ($1, $2)
       RETURNING category_id`,
      [categoryName, description],
    );
    const category = await pool.query(
      `${CATEGORY_SELECT}
       WHERE c.category_id = $1
       GROUP BY c.category_id`,
      [result.rows[0].category_id],
    );
    return res.status(201).json({ success: true, data: category.rows[0] });
  } catch (error) {
    return next(mapDatabaseError(error, 'Danh mục'));
  }
});

router.patch('/categories/:categoryId', async (req, res, next) => {
  try {
    validateUuid(req.params.categoryId, 'categoryId');
    const body = req.body || {};
    const allowed = ['categoryName', 'description'];
    if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.includes(key))) {
      throw httpError(400, 'INVALID_UPDATE', 'Cần cung cấp categoryName hoặc description để cập nhật.');
    }
    const values = [];
    const updates = [];
    if (Object.hasOwn(body, 'categoryName')) {
      values.push(validateName(body.categoryName, 'categoryName', 100));
      updates.push(`category_name = $${values.length}`);
    }
    if (Object.hasOwn(body, 'description')) {
      values.push(validateDescription(body.description));
      updates.push(`description = $${values.length}`);
    }
    values.push(req.params.categoryId);
    const result = await pool.query(
      `UPDATE public.categories
       SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE category_id = $${values.length}
       RETURNING category_id`,
      values,
    );
    if (!result.rows[0]) throw httpError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục.');
    const category = await pool.query(
      `${CATEGORY_SELECT}
       WHERE c.category_id = $1
       GROUP BY c.category_id`,
      [req.params.categoryId],
    );
    return res.json({ success: true, data: category.rows[0] });
  } catch (error) {
    return next(mapDatabaseError(error, 'Danh mục'));
  }
});

router.delete('/categories/:categoryId', async (req, res, next) => {
  try {
    validateUuid(req.params.categoryId, 'categoryId');
    const result = await pool.query(
      'DELETE FROM public.categories WHERE category_id = $1 RETURNING category_id',
      [req.params.categoryId],
    );
    if (!result.rows[0]) throw httpError(404, 'CATEGORY_NOT_FOUND', 'Không tìm thấy danh mục.');
    return res.status(204).end();
  } catch (error) {
    return next(mapDatabaseError(error, 'Danh mục'));
  }
});

module.exports = router;
