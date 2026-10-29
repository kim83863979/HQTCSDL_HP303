import { notFound } from '../../shared/errors.js';
import * as repo from './category.repository.js';

export const toCategoryResponse = (r) => ({
  id: r.category_id,
  name: r.category_name,
  description: r.description,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function list() {
  return (await repo.findAll()).map(toCategoryResponse);
}

export async function get(id) {
  const row = await repo.findById(id);
  if (!row) throw notFound(`Khong tim thay danh muc co id ${id}`);
  return toCategoryResponse(row);
}
