const orderService = require('./order.service');

const handle = (action) => async (req, res, next) => {
  try {
    const result = await action(req);
    return res.status(result && result._created ? 201 : 200).json({
      success: true,
      data: result && result._created ? result.data : result,
    });
  } catch (error) {
    return next(error);
  }
};

const createOrder = handle(async (req) => ({
  _created: true,
  data: await orderService.createOrder(req.body),
}));

const getOrder = handle((req) => orderService.getOrder(req.params.orderId));

const createPaymentAttempt = handle(async (req) => ({
  _created: true,
  data: await orderService.createPaymentAttempt(req.params.orderId, req.body?.paymentMethod),
}));

const processPaymentCallback = handle((req) => (
  orderService.processPaymentCallback(req.params.paymentId, req.body || {})
));

const cancelOrder = handle((req) => orderService.cancelOrder(req.params.orderId));

const recordDispenseResult = handle((req) => (
  orderService.recordDispenseResult(req.params.orderId, req.body?.success)
));

const expireOrders = handle(async () => ({
  expiredCount: await orderService.expireOrders(),
}));

module.exports = {
  createOrder,
  getOrder,
  createPaymentAttempt,
  processPaymentCallback,
  cancelOrder,
  recordDispenseResult,
  expireOrders,
};
