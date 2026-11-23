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
    `SELECT order_id, machine_id, order_status, total_amount, refund_due_amount,
            guest_access_token_hash, created_at, expires_at
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

  const items = await client.query(
    `SELECT oi.order_item_id, oi.product_id, p.product_name, oi.slot_id,
            ms.slot_code, oi.quantity, oi.unit_price, oi.subtotal,
            oi.dispensed_quantity, oi.dispense_status
     FROM order_items oi
     JOIN products p ON p.product_id = oi.product_id
     JOIN machine_slots ms ON ms.slot_id = oi.slot_id
     WHERE oi.order_id = $1
     ORDER BY oi.order_item_id`,
    [orderId],
  );
  const payments = await client.query(
    `SELECT payment_id, payment_method, payment_status, amount,
            transaction_reference, paid_at, created_at
     FROM payments
     WHERE order_id = $1
     ORDER BY created_at, payment_id`,
    [orderId],
  );
  const commands = await client.query(
    `SELECT command_id, status, attempts, last_error, created_at, updated_at, completed_at
     FROM public.dispense_commands
     WHERE order_id = $1`,
    [orderId],
  );

  return {
    id: order.order_id,
    machineId: order.machine_id,
    status: order.order_status,
    totalAmount: Number(order.total_amount),
    refundDueAmount: Number(order.refund_due_amount || 0),
    createdAt: order.created_at,
    expiresAt: order.expires_at,
    items: items.rows.map((item) => ({
      id: item.order_item_id,
      productId: item.product_id,
      productName: item.product_name,
      slotId: item.slot_id,
      slotCode: item.slot_code,
      quantity: item.quantity,
      dispensedQuantity: item.dispensed_quantity,
      dispenseStatus: item.dispense_status,
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
    dispenseCommand: commands.rows[0] ? {
      commandId: commands.rows[0].command_id,
      status: commands.rows[0].status,
      attempts: commands.rows[0].attempts,
      lastError: commands.rows[0].last_error,
      createdAt: commands.rows[0].created_at,
      updatedAt: commands.rows[0].updated_at,
      completedAt: commands.rows[0].completed_at,
    } : null,
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
