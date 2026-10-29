import { notFound } from '../../shared/errors.js';
import * as categoryRepo from '../category/category.repository.js';
import * as repo from './product.repository.js';

export const toProductResponse = (r) => ({
  id: r.product_id,
  name: r.product_name,
  description: r.description,
  unitPrice: Number(r.unit_price), // pg tra NUMERIC dang chuoi, doi sang so
  status: r.status,
  category: { id: r.category_id, name: r.category_name },
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export async function list({ categoryId, status, page, size }) {
  if (categoryId && !(await categoryRepo.exists(categoryId))) {
    throw notFound(`Khong tim thay danh muc co id ${categoryId}`);
  }
  const { rows, total } = await repo.findPage({ categoryId, status, page, size });
  return {
    items: rows.map(toProductResponse),
    page,
    size,
    totalElements: total,
    totalPages: Math.ceil(total / size),
  };
}

export async function get(id) {
  const row = await repo.findById(id);
  if (!row) throw notFound(`Khong tim thay san pham co id ${id}`);
  return toProductResponse(row);
}
