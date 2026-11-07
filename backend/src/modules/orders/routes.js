const express = require('express');
const service = require('./service');
const verifySecret = require('../../shared/verifySecret');
const verifyIotDevice = require('../../middleware/verifyIotDevice');

const router = express.Router();

router.post('/expire', verifySecret('ORDER_MAINTENANCE_SECRET', 'x-order-maintenance-key'), async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.expireOrders() });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await service.createOrder(req.body) });
  } catch (error) {
    next(error);
  }
});

router.get('/:orderId', async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.getOrderById(req.params.orderId) });
  } catch (error) {
    next(error);
  }
});

router.post('/:orderId/cancel', async (req, res, next) => {
  try {
    const result = await service.cancelOrder(req.params.orderId);
    res.json({ success: true, data: result.order, changed: result.changed });
  } catch (error) {
    next(error);
  }
});

router.post('/:orderId/dispense-result', verifyIotDevice, async (req, res, next) => {
  try {
    const result = await service.reportDispenseResult(req.params.orderId, req.body);
    res.json({ success: true, data: result.order, changed: result.changed });
  } catch (error) {
    next(error);
  }
});

module.exports = router;