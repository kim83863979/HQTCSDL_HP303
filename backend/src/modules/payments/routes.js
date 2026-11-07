const express = require('express');
const service = require('./service');
const verifySecret = require('../../shared/verifySecret');

const router = express.Router();
const verifyPaymentWebhook = verifySecret('PAYMENT_WEBHOOK_SECRET', 'x-payment-key');

router.post('/', async (req, res, next) => {
  try {
    const result = await service.createPayment(req.body);
    res.status(result.created ? 201 : 200).json({ success: true, data: result.payment, created: result.created });
  } catch (error) {
    next(error);
  }
});

router.get('/:paymentId', async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.getPaymentById(req.params.paymentId) });
  } catch (error) {
    next(error);
  }
});

router.post('/:paymentId/callback', verifyPaymentWebhook, async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.setPaymentResult(req.params.paymentId, req.body) });
  } catch (error) {
    next(error);
  }
});

// Backward-compatible path for the first Sprint 2 draft; it uses the same authenticated callback logic.
router.post('/:paymentId/result', verifyPaymentWebhook, async (req, res, next) => {
  try {
    res.json({ success: true, data: await service.setPaymentResult(req.params.paymentId, req.body) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;