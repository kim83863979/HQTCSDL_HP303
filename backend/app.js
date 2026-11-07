require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const express = require('express');
const errorHandler = require('./src/middleware/errorHandler');
const { checkConnection } = require('./src/config/db');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.get('/health', async (req, res, next) => {
  try {
    await checkConnection();
    res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch (err) {
    next(err);
  }
});

app.use('/api/auth', require('./src/router/auth.router'));
app.use('/api/inventory', require('./src/router/inventory.router'));
app.use('/api/machines', require('./src/modules/machines/machine.router'));
app.use('/api/products', require('./src/modules/products/product.routes'));
app.use('/api/categories', require('./src/modules/products/category.routes'));
app.use('/api/orders', require('./src/modules/orders/routes'));
app.use('/api/payments', require('./src/modules/payments/routes'));

app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route '${req.method} ${req.path}' khong ton tai.`,
  });
});
app.use(errorHandler);

module.exports = app;