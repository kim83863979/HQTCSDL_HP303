const express = require('express');
const service = require('./service');
const orderService = require('../orders/order.service');
const verifySharedSecret = require('../../middleware/verifySharedSecret');
const { authenticateToken } = require('../auth/auth.middleware');
const router = express.Router();
const verifyPaymentWebhook = verifySharedSecret({
  environmentVariable: 'PAYMENT_WEBHOOK_SECRET',
  headerName: 'x-payment-key',
  errorCode: 'UNAUTHORIZED_PAYMENT_WEBHOOK',
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const { orderId, paymentMethod } = req.body || {};
    const payment = await orderService.createPaymentAttempt(orderId, paymentMethod);
    return res.status(201).json({
      success: true,
      data: {
        paymentId: payment.id,
        orderId: payment.orderId,
        paymentMethod: payment.method,
        paymentStatus: payment.status,
        amount: payment.amount,
        createdAt: payment.createdAt,
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/:paymentId', authenticateToken, async (req, res, next) => {
  try {
    const payment = await service.getPaymentById(req.params.paymentId);
    return res.json({ success: true, data: payment });
  } catch (error) {
    return next(error);
  }
});

// Endpoint mô phỏng callback của cổng thanh toán cho demo Sprint 2.
router.post('/:paymentId/result', authenticateToken, verifyPaymentWebhook, async (req, res, next) => {
  try {
    const { paymentStatus, transactionReference } = req.body || {};
    const result = await orderService.processPaymentCallback(req.params.paymentId, {
      status: paymentStatus,
      transactionReference,
    });
    const [payment, order] = await Promise.all([
      service.getPaymentById(req.params.paymentId),
      orderService.getOrder(result.orderId),
    ]);
    return res.json({
      success: true,
      data: {
        payment,
        orderStatus: order.status,
        changed: !result.idempotent,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
