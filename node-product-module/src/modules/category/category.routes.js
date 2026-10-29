import { Router } from 'express';
import { requireUuid } from '../../shared/validate.js';
import * as service from './category.service.js';

const router = Router();

// GET /api/categories
router.get('/', async (req, res) => {
  res.json(await service.list());
});

// GET /api/categories/:id
router.get('/:id', async (req, res) => {
  res.json(await service.get(requireUuid(req.params.id, 'id')));
});

export default router;
