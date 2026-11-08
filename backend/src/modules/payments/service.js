const { getClient, query } = require('../../config/db');
const httpError = require('../../shared/httpError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = new Set(['CASH', 'CARD', 'QR']);
const RESULTS = new Set(['SUCCESS', 'FAILED']);

function mapPayment(row) {
  return {
    paymentId: row.payment_id,
    orderId: row.order_id,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    amount: row.amount,
    transactionReference: row.transaction_reference,
    paidAt: row.paid_at,
    createdAt: row.created_at
  };
}

function validateCreate(body) {
  const { orderId, paymentMethod } = body || {};
  if (!UUID.test(orderId || '')) throw httpError(400, 'INVALID_ORDER_ID', 'orderId phải là UUID hợp lệ.');
  if (!METHODS.has(paymentMethod)) {
    throw httpError(400, 'INVALID_PAYMENT_METHOD', 'paymentMethod phải là CASH, CARD hoặc QR.');
  }
  return { orderId, paymentMethod };
}

async function createPayment(body) {
  const { orderId, paymentMethod } = validateCreate(body);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      'SELECT order_status, total_amount FROM orders WHERE order_id = $1 FOR UPDATE',
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) throw httpError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
    if (order.order_status !== 'PENDING') {
      throw httpError(409, 'ORDER_NOT_PAYABLE', 'Đơn hàng không ở trạng thái chờ thanh toán.');
    }

    const existingResult = await client.query(
      `SELECT payment_id, order_id, payment_method, payment_status,
              amount, transaction_reference, paid_at, created_at
         FROM payments WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    if (existingResult.rows[0]) {
      const existing = mapPayment(existingResult.rows[0]);
      if (existing.paymentStatus === 'PENDING') {
        await client.query('COMMIT');
        return { payment: existing, created: false };
      }
      throw httpError(409, 'PAYMENT_ALREADY_FINALIZED', 'Đơn hàng đã có giao dịch thanh toán kết thúc.');
    }

    const inserted = await client.query(
      `INSERT INTO payments (order_id, payment_method, payment_status, amount)
       VALUES ($1, $2, 'PENDING', $3)
       RETURNING payment_id, order_id, payment_method, payment_status,
                 amount, transaction_reference, paid_at, created_at`,
      [orderId, paymentMethod, order.total_amount]
    );
    await client.query('COMMIT');
    return { payment: mapPayment(inserted.rows[0]), created: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function setPaymentResult(paymentId, body) {
  if (!UUID.test(paymentId || '')) throw httpError(400, 'INVALID_PAYMENT_ID', 'paymentId phải là UUID hợp lệ.');
  const { paymentStatus, transactionReference } = body || {};
  if (!RESULTS.has(paymentStatus)) {
    throw httpError(400, 'INVALID_PAYMENT_STATUS', 'paymentStatus phải là SUCCESS hoặc FAILED.');
  }
  if (transactionReference !== undefined && transactionReference !== null &&
      (typeof transactionReference !== 'string' || transactionReference.length > 255)) {
    throw httpError(400, 'INVALID_TRANSACTION_REFERENCE', 'transactionReference tối đa 255 ký tự.');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT p.payment_id, p.order_id, p.payment_method, p.payment_status,
              p.amount, p.transaction_reference, p.paid_at, p.created_at,
              o.order_status
         FROM payments p JOIN orders o ON o.order_id = p.order_id
        WHERE p.payment_id = $1 FOR UPDATE OF p, o`,
      [paymentId]
    );
    const current = currentResult.rows[0];
    if (!current) throw httpError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy thanh toán.');

    if (current.payment_status === paymentStatus) {
      await client.query('COMMIT');
      return { payment: mapPayment(current), orderStatus: current.order_status, changed: false };
    }
    if (current.payment_status !== 'PENDING' || current.order_status !== 'PENDING') {
      throw httpError(409, 'PAYMENT_ALREADY_FINALIZED', 'Thanh toán hoặc đơn hàng đã được xử lý.');
    }

    const updated = await client.query(
      `UPDATE payments
          SET payment_status = $1,
              transaction_reference = COALESCE($2, transaction_reference),
              paid_at = CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE NULL END
        WHERE payment_id = $3
        RETURNING payment_id, order_id, payment_method, payment_status,
                  amount, transaction_reference, paid_at, created_at`,
      [paymentStatus, transactionReference || null, paymentId, paymentStatus === 'SUCCESS']
    );
    const orderStatus = paymentStatus === 'SUCCESS' ? 'PAID' : 'FAILED';
    await client.query(
      `UPDATE orders SET order_status = $1, updated_at = CURRENT_TIMESTAMP
        WHERE order_id = $2 AND order_status = 'PENDING'`,
      [orderStatus, current.order_id]
    );
    await client.query('COMMIT');
    return { payment: mapPayment(updated.rows[0]), orderStatus, changed: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getPaymentById(paymentId) {
  if (!UUID.test(paymentId || '')) throw httpError(400, 'INVALID_PAYMENT_ID', 'paymentId phải là UUID hợp lệ.');
  const result = await query(
    `SELECT payment_id, order_id, payment_method, payment_status,
            amount, transaction_reference, paid_at, created_at
       FROM payments WHERE payment_id = $1`,
    [paymentId]
  );
  if (!result.rows[0]) throw httpError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy thanh toán.');
  return mapPayment(result.rows[0]);
}

module.exports = { createPayment, setPaymentResult, getPaymentById };
