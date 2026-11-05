// src/modules/products/category.routes.js
// Router Express cho API danh mục sản phẩm.
// Mount tại: app.use('/api/categories', require('./src/modules/products/category.routes'))

const { Router } = require('express');
const { requireUuid } = require('./product.validate');
const categoryService = require('./category.service');

const router = Router();

// GET /api/categories
router.get('/', async (req, res, next) => {
  try {
    res.json(await categoryService.list());
  } catch (err) {
    next(err);
  }
});

// GET /api/categories/:id
router.get('/:id', async (req, res, next) => {
  try {
    res.json(await categoryService.get(requireUuid(req.params.id, 'id')));
  } catch (err) {
    next(err);
  }
});

module.exports = router;

