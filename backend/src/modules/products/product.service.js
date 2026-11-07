// src/modules/products/product.service.js
// Business logic cho sản phẩm: phân trang, lọc, lấy chi tiết.

const { notFound } = require('./product.errors');
const categoryRepo = require('./category.repository');
const productRepo = require('./product.repository');

/** Chuyển hàng DB thành response object chuẩn. */
const toProductResponse = (r) => ({
  id: r.product_id,
  name: r.product_name,
  description: r.description,
  unitPrice: Number(r.unit_price), // pg trả NUMERIC dạng chuỗi, đổi sang số
  status: r.status,
  category: { id: r.category_id, name: r.category_name },
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/**
 * Lấy danh sách sản phẩm có phân trang.
 * @param {{ categoryId?: string, status?: string, page: number, size: number }} opts
 */
async function list({ categoryId, status, page, size }) {
  // Kiểm tra danh mục tồn tại trước khi query
  if (categoryId && !(await categoryRepo.exists(categoryId))) {
    throw notFound(`Không tìm thấy danh mục có id ${categoryId}`);
  }

  const { rows, total } = await productRepo.findPage({ categoryId, status, page, size });
  return {
    items: rows.map(toProductResponse),
    page,
    size,
    totalElements: total,
    totalPages: Math.ceil(total / size),
  };
}

/**
 * Lấy chi tiết một sản phẩm theo ID.
 * @param {string} id - UUID sản phẩm
 */
async function get(id) {
  const row = await productRepo.findById(id);
  if (!row) throw notFound(`Không tìm thấy sản phẩm có id ${id}`);
  return toProductResponse(row);
}

module.exports = { list, get };

