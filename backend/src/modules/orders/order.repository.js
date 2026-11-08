const { pool } = require('../../config/db');

async function withTransaction(work) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[OrderRepository] rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function findOrder(client, orderId, { lock = false } = {}) {
  const result = await client.query(
    `SELECT order_id, machine_id, order_status, total_amount, created_at, expires_at
     FROM orders
     WHERE order_id = $1
     ${lock ? 'FOR UPDATE' : ''}`,
    [orderId],
  );
  return result.rows[0] || null;
}

async function findOrderDetails(client, orderId) {
  const order = await findOrder(client, orderId);
  if (!order) return null;

  const [items, payments] = await Promise.all([
    client.query(
      `SELECT oi.order_item_id, oi.product_id, p.product_name, oi.slot_id,
              ms.slot_code, oi.quantity, oi.unit_price, oi.subtotal
       FROM order_items oi
       JOIN products p ON p.product_id = oi.product_id
       JOIN machine_slots ms ON ms.slot_id = oi.slot_id
       WHERE oi.order_id = $1
       ORDER BY oi.order_item_id`,
      [orderId],
    ),
    client.query(
      `SELECT payment_id, payment_method, payment_status, amount,
              transaction_reference, paid_at, created_at
       FROM payments
       WHERE order_id = $1
       ORDER BY created_at, payment_id`,
      [orderId],
    ),
  ]);

  return {
    id: order.order_id,
    machineId: order.machine_id,
    status: order.order_status,
    totalAmount: Number(order.total_amount),
    createdAt: order.created_at,
    expiresAt: order.expires_at,
    items: items.rows.map((item) => ({
      id: item.order_item_id,
      productId: item.product_id,
      productName: item.product_name,
      slotId: item.slot_id,
      slotCode: item.slot_code,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      subtotal: Number(item.subtotal),
    })),
    payments: payments.rows.map((payment) => ({
      id: payment.payment_id,
      method: payment.payment_method,
      status: payment.payment_status,
      amount: Number(payment.amount),
      transactionReference: payment.transaction_reference,
      paidAt: payment.paid_at,
      createdAt: payment.created_at,
    })),
  };
}

async function expirePendingOrders(client) {
  const result = await client.query(
    `WITH expired AS (
       SELECT order_id
       FROM orders
       WHERE order_status = 'PENDING' AND expires_at <= CURRENT_TIMESTAMP
       ORDER BY expires_at, order_id
       FOR UPDATE SKIP LOCKED
     )
     UPDATE orders o
     SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
     FROM expired
     WHERE o.order_id = expired.order_id
     RETURNING o.order_id`,
  );
  return result.rowCount;
}

module.exports = { withTransaction, findOrder, findOrderDetails, expirePendingOrders };
