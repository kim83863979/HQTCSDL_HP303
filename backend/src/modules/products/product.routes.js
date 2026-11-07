// src/modules/products/product.routes.js
// Router Express cho API sản phẩm.
// Mount tại: app.use('/api/products', require('./src/modules/products/product.routes'))

const { Router } = require('express');
const { requireUuid, parseIntInRange } = require('./product.validate');
const productService = require('./product.service');

const router = Router();

// GET /api/products?categoryId=&status=&page=&size=
router.get('/', async (req, res, next) => {
  try {
    const { categoryId, status } = req.query;
    const result = await productService.list({
      categoryId: categoryId === undefined ? undefined : requireUuid(categoryId, 'categoryId'),
      status: typeof status === 'string' && status.trim() ? status.trim() : undefined,
      page: parseIntInRange(req.query.page, 'page', { min: 0, max: 1_000_000, fallback: 0 }),
      size: parseIntInRange(req.query.size, 'size', { min: 1, max: 100, fallback: 20 }),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res, next) => {
  try {
    const result = await productService.get(requireUuid(req.params.id, 'id'));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

