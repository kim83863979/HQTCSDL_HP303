const express = require('express');
const orderController = require('./order.controller');
const verifySharedSecret = require('../../middleware/verifySharedSecret');

const router = express.Router();
const verifyPaymentWebhook = verifySharedSecret({
  environmentVariable: 'PAYMENT_WEBHOOK_SECRET',
  headerName: 'x-payment-key',
  errorCode: 'UNAUTHORIZED_PAYMENT_WEBHOOK',
});
const verifyOrderMaintenance = verifySharedSecret({
  environmentVariable: 'ORDER_MAINTENANCE_SECRET',
  headerName: 'x-order-maintenance-key',
  errorCode: 'UNAUTHORIZED_ORDER_MAINTENANCE',
});

router.post('/', orderController.createOrder);
router.get('/:orderId', orderController.getOrder);
router.post('/:orderId/payments', orderController.createPaymentAttempt);
router.post('/:orderId/cancel', orderController.cancelOrder);
router.post('/:orderId/dispense-result', orderController.recordDispenseResult);
router.post('/expire', verifyOrderMaintenance, orderController.expireOrders);
router.post('/payments/:paymentId/callback', verifyPaymentWebhook, orderController.processPaymentCallback);

module.exports = router;
