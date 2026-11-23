# Product administration

- Admin product deletion: `DELETE /api/admin/products/:productId`. Products
  referenced by inventory or order items are kept and changed to `INACTIVE`;
  otherwise the product is physically deleted. The route requires both
  `MANAGE_PRODUCT` permission and the `ADMIN` role.
- Product images: upload with `POST /api/admin/products/:productId/image` as
  raw `application/octet-stream`, setting `X-Image-Content-Type` to
  `image/jpeg`, `image/png`, or `image/webp`. Remove one with
  `DELETE /api/admin/products/:productId/image`.
- Images are limited to 5 MB, stored as generated filenames under
  `backend/uploads/products`, and served from `/uploads/products/...`. The
  directory must be backed by persistent storage in deployments. PostgreSQL
  stores only the public path in `products.image_url`.
- Apply migration `20261122100000_add_product_image_url.sql` before enabling
  image uploads. Until then the product catalog remains readable and image
  writes return `PRODUCT_IMAGE_SCHEMA_PENDING`.
