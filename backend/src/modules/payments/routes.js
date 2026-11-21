const express = require('express');
const orderService = require('../orders/order.service');
const paymentService = require('./service');
const verifySharedSecret = require('../../middleware/verifySharedSecret');

const router = express.Router();
const verifyPaymentWebhook = verifySharedSecret({
  environmentVariable: 'PAYMENT_WEBHOOK_SECRET',
  headerName: 'x-payment-key',
  errorCode: 'UNAUTHORIZED_PAYMENT_WEBHOOK',
});

// Keep the legacy alias on the same transactional order/payment lifecycle.
router.post('/', async (req, res, next) => {
  try {
    const { orderId, paymentMethod } = req.body || {};
    const payment = await orderService.createPaymentAttempt(
      orderId,
      paymentMethod,
      req.get('x-guest-order-token'),
    );
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

router.get('/:paymentId', async (req, res, next) => {
  try {
    await orderService.assertGuestPaymentAccess(
      req.params.paymentId,
      req.get('x-guest-order-token'),
    );
    const payment = await paymentService.getPaymentById(req.params.paymentId);
    return res.json({ success: true, data: payment });
  } catch (error) {
    return next(error);
  }
});

router.post('/:paymentId/demo-result', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production' || process.env.PAYMENT_DEMO_ENABLED === 'false') {
    return res.status(404).json({ message: 'Không tìm thấy route.' });
  }
  try {
    const guestToken = req.get('x-guest-order-token');
    await orderService.assertGuestPaymentAccess(req.params.paymentId, guestToken);
    const { paymentStatus, transactionReference } = req.body || {};
    if (!['SUCCESS', 'FAILED'].includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_PAYMENT_STATUS',
        message: 'paymentStatus phải là SUCCESS hoặc FAILED.',
      });
    }
    const demoReference = transactionReference || `DEMO-${req.params.paymentId}`;
    const result = await orderService.processPaymentCallback(req.params.paymentId, {
      status: paymentStatus,
      transactionReference: demoReference,
    });
    const payment = await paymentService.getPaymentById(req.params.paymentId);
    return res.json({
      success: true,
      data: {
        payment,
        orderStatus: result.orderStatus,
        changed: !result.idempotent,
      },
    });
  } catch (error) {
    return next(error);
  }
});

// Demo payment-provider callback. The shared key authenticates the callback;
// a user JWT is not a substitute for the provider secret.
router.post('/:paymentId/result', verifyPaymentWebhook, async (req, res, next) => {
  try {
    const { paymentStatus, transactionReference } = req.body || {};
    const result = await orderService.processPaymentCallback(req.params.paymentId, {
      status: paymentStatus,
      transactionReference,
    });
    const payment = await paymentService.getPaymentById(req.params.paymentId);
    return res.json({
      success: true,
      data: {
        payment,
        orderStatus: result.orderStatus,
        changed: !result.idempotent,
      },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
