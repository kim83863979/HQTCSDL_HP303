import { Router } from 'express';
import { parseIntInRange, requireUuid } from '../../shared/validate.js';
import * as service from './product.service.js';

const router = Router();

// GET /api/products?categoryId=&status=&page=&size=
router.get('/', async (req, res) => {
  const { categoryId, status } = req.query;
  res.json(
    await service.list({
      categoryId: categoryId === undefined ? undefined : requireUuid(categoryId, 'categoryId'),
      status: typeof status === 'string' && status.trim() ? status.trim() : undefined,
      page: parseIntInRange(req.query.page, 'page', { min: 0, max: 1_000_000, fallback: 0 }),
      size: parseIntInRange(req.query.size, 'size', { min: 1, max: 100, fallback: 20 }),
    }),
  );
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  res.json(await service.get(requireUuid(req.params.id, 'id')));
});

export default router;
