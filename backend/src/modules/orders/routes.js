const express = require('express');
const service = require('./service');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const order = await service.createOrder(req.body);
    return res.status(201).json({ success: true, data: order });
  } catch (error) {
    return next(error);
  }
});

router.get('/:orderId', async (req, res, next) => {
  try {
    const order = await service.getOrderById(req.params.orderId);
    return res.json({ success: true, data: order });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
