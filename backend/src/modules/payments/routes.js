const express = require('express');
const service = require('./service');

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const result = await service.createPayment(req.body);
    return res.status(result.created ? 201 : 200).json({ success: true, data: result.payment });
  } catch (error) {
    return next(error);
  }
});

router.get('/:paymentId', async (req, res, next) => {
  try {
    const payment = await service.getPaymentById(req.params.paymentId);
    return res.json({ success: true, data: payment });
  } catch (error) {
    return next(error);
  }
});

// Endpoint mô phỏng callback của cổng thanh toán cho demo Sprint 2.
router.post('/:paymentId/result', async (req, res, next) => {
  try {
    const result = await service.setPaymentResult(req.params.paymentId, req.body);
    return res.json({ success: true, data: result });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
