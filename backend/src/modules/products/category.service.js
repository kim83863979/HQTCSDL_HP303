// src/modules/products/category.service.js
// Business logic cho danh mục sản phẩm.

const { notFound } = require('./product.errors');
const categoryRepo = require('./category.repository');

/** Chuyển hàng DB thành response object chuẩn. */
const toCategoryResponse = (r) => ({
  id: r.category_id,
  name: r.category_name,
  description: r.description,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Lấy toàn bộ danh mục. */
async function list() {
  return (await categoryRepo.findAll()).map(toCategoryResponse);
}

/**
 * Lấy chi tiết một danh mục theo ID.
 * @param {string} id - UUID danh mục
 */
async function get(id) {
  const row = await categoryRepo.findById(id);
  if (!row) throw notFound(`Không tìm thấy danh mục có id ${id}`);
  return toCategoryResponse(row);
}

module.exports = { list, get };

