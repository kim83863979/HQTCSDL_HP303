import express from 'express';
import categoryRoutes from './modules/category/category.routes.js';
import productRoutes from './modules/product/product.routes.js';
import { errorHandler, notFoundHandler } from './shared/errorHandler.js';

// File nay chi de chay module doc lap. Khi ghep vao backend cua KIM,
// chi can mount hai router duoi day vao app chung.
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({
      name: 'FreshVend Product API',
      status: 'running',
      endpoints: {
        products: '/api/products',
        productById: '/api/products/:id',
        categories: '/api/categories',
        categoryById: '/api/categories/:id',
      },
    });
  });

  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
