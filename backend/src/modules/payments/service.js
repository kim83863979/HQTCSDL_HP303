const { getClient, query } = require('../../config/db');
const httpError = require('../../shared/httpError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const METHODS = new Set(['CASH', 'CARD', 'QR']);
const CALLBACK_RESULTS = new Set(['SUCCESS', 'FAILED', 'REFUNDED']);

function mapPayment(row) {
  return {
    paymentId: row.payment_id,
    orderId: row.order_id,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    amount: row.amount,
    transactionReference: row.transaction_reference,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}

function validateCreate(body) {
  const orderId = typeof body?.orderId === 'string' ? body.orderId.toLowerCase() : '';
  if (!UUID.test(orderId)) throw httpError(400, 'INVALID_ORDER_ID', 'orderId phải là UUID hợp lệ.');
  if (!METHODS.has(body?.paymentMethod)) {
    throw httpError(400, 'INVALID_PAYMENT_METHOD', 'paymentMethod phải là CASH, CARD hoặc QR.');
  }
  return { orderId, paymentMethod: body.paymentMethod };
}

function validateCallback(paymentId, body) {
  const normalizedId = typeof paymentId === 'string' ? paymentId.toLowerCase() : '';
  if (!UUID.test(normalizedId)) throw httpError(400, 'INVALID_PAYMENT_ID', 'paymentId phải là UUID hợp lệ.');
  const paymentStatus = body?.paymentStatus;
  if (!CALLBACK_RESULTS.has(paymentStatus)) {
    throw httpError(400, 'INVALID_PAYMENT_STATUS', 'paymentStatus phải là SUCCESS, FAILED hoặc REFUNDED.');
  }
  let transactionReference = body.transactionReference;
  if (transactionReference !== undefined && transactionReference !== null) {
    if (typeof transactionReference !== 'string' || transactionReference.length > 255) {
      throw httpError(400, 'INVALID_TRANSACTION_REFERENCE', 'transactionReference tối đa 255 ký tự.');
    }
    transactionReference = transactionReference.trim() || null;
  } else {
    transactionReference = null;
  }
  return { paymentId: normalizedId, paymentStatus, transactionReference };
}

async function ensureReservations(client, orderId, machineId, { createMissing }) {
  const itemResult = await client.query(
    `SELECT order_item_id, product_id, slot_id, quantity
       FROM order_items WHERE order_id = $1 ORDER BY slot_id, product_id, order_item_id`,
    [orderId]
  );
  if (itemResult.rowCount < 1) throw httpError(409, 'ORDER_HAS_NO_ITEMS', 'Đơn hàng phải có ít nhất một dòng sản phẩm.');

  for (const item of itemResult.rows) {
    const inventoryResult = await client.query(
      `SELECT i.inventory_id, i.quantity, i.reserved_quantity,
              s.machine_id, s.status AS slot_status, p.status AS product_status
         FROM inventories i
         JOIN machine_slots s ON s.slot_id = i.slot_id
         JOIN products p ON p.product_id = i.product_id
        WHERE i.slot_id = $1 AND i.product_id = $2
        FOR UPDATE OF i`,
      [item.slot_id, item.product_id]
    );
    const inventory = inventoryResult.rows[0];
    if (!inventory) throw httpError(409, 'ORDER_INVENTORY_MISSING', 'Không còn inventory cho sản phẩm/slot trong đơn.');
    if (inventory.machine_id !== machineId) {
      throw httpError(409, 'SLOT_MACHINE_MISMATCH', 'Slot trong đơn không thuộc máy của đơn.');
    }
    if (inventory.slot_status !== 'ACTIVE' || inventory.product_status !== 'ACTIVE') {
      throw httpError(409, 'ORDER_ITEM_UNAVAILABLE', 'Slot hoặc sản phẩm trong đơn hiện không hoạt động.');
    }

    const heldResult = await client.query(
      `SELECT reservation_id, inventory_id, quantity
         FROM inventory_reservations
        WHERE order_item_id = $1 AND status = 'RESERVED'
        FOR UPDATE`,
      [item.order_item_id]
    );
    const held = heldResult.rows[0];
    if (held) {
      if (held.inventory_id !== inventory.inventory_id || held.quantity !== item.quantity) {
        throw httpError(409, 'RESERVATION_INCONSISTENT', 'Giữ chỗ hiện tại không khớp với dòng đơn hàng.');
      }
      continue;
    }
    if (!createMissing) {
      throw httpError(409, 'RESERVATION_MISSING', 'Payment đang chờ nhưng không còn giữ chỗ tương ứng.');
    }
    if (inventory.quantity - inventory.reserved_quantity < item.quantity) {
      throw httpError(409, 'INSUFFICIENT_STOCK', 'Không đủ hàng để giữ chỗ cho lần thanh toán mới.');
    }
    await client.query(
      `INSERT INTO inventory_reservations (order_item_id, inventory_id, quantity)
       VALUES ($1, $2, $3)`,
      [item.order_item_id, inventory.inventory_id, item.quantity]
    );
  }
  return itemResult.rowCount;
}

async function createPayment(body) {
  const { orderId, paymentMethod } = validateCreate(body);
  const client = await getClient();
  let expired = false;
  let result;
  let committed = false;
  try {
    await client.query('BEGIN');
    const orderResult = await client.query(
      `SELECT order_status, total_amount, machine_id, expires_at
         FROM orders WHERE order_id = $1 FOR UPDATE`,
      [orderId]
    );
    const order = orderResult.rows[0];
    if (!order) throw httpError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');

    if (order.order_status === 'PENDING' && new Date(order.expires_at) <= new Date()) {
      await client.query(
        `UPDATE orders SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
          WHERE order_id = $1 AND order_status = 'PENDING'`,
        [orderId]
      );
      await client.query('COMMIT');
      committed = true;
      expired = true;
    } else {
      if (order.order_status !== 'PENDING') {
        throw httpError(409, 'ORDER_NOT_PAYABLE', 'Đơn hàng không ở trạng thái chờ thanh toán.');
      }

      const paymentsResult = await client.query(
        `SELECT payment_id, order_id, payment_method, payment_status,
                amount, transaction_reference, paid_at, created_at
           FROM payments WHERE order_id = $1
          ORDER BY created_at DESC, payment_id DESC FOR UPDATE`,
        [orderId]
      );
      const pending = paymentsResult.rows.find((payment) => payment.payment_status === 'PENDING');
      if (pending) {
        if (pending.payment_method !== paymentMethod) {
          throw httpError(409, 'PAYMENT_IN_PROGRESS', 'Đơn hàng đang có một lần thanh toán PENDING bằng phương thức khác.');
        }
        await ensureReservations(client, orderId, order.machine_id, { createMissing: false });
        result = { payment: mapPayment(pending), created: false };
      } else {
        if (paymentsResult.rows.some((payment) => payment.payment_status === 'SUCCESS' || payment.payment_status === 'REFUNDED')) {
          throw httpError(409, 'PAYMENT_ALREADY_SUCCEEDED', 'Đơn hàng đã có thanh toán thành công.');
        }
        await ensureReservations(client, orderId, order.machine_id, { createMissing: true });
        const inserted = await client.query(
          `INSERT INTO payments (order_id, payment_method, payment_status, amount)
           VALUES ($1, $2, 'PENDING', $3)
           RETURNING payment_id, order_id, payment_method, payment_status,
                     amount, transaction_reference, paid_at, created_at`,
          [orderId, paymentMethod, order.total_amount]
        );
        result = { payment: mapPayment(inserted.rows[0]), created: true };
      }
      await client.query('COMMIT');
      committed = true;
    }
  } catch (error) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
    }
    throw error;
  } finally {
    client.release();
  }
  if (expired) throw httpError(409, 'ORDER_EXPIRED', 'Đơn hàng đã hết hạn và được chuyển sang CANCELLED.');
  return result;
}

async function setPaymentResult(paymentId, body) {
  const { paymentId: id, paymentStatus, transactionReference } = validateCallback(paymentId, body);
  const client = await getClient();
  let expired = false;
  let result;
  let committed = false;
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT p.payment_id, p.order_id, p.payment_method, p.payment_status,
              p.amount, p.transaction_reference, p.paid_at, p.created_at,
              o.order_status, o.machine_id, o.expires_at
         FROM payments p JOIN orders o ON o.order_id = p.order_id
        WHERE p.payment_id = $1 FOR UPDATE OF p, o`,
      [id]
    );
    const current = currentResult.rows[0];
    if (!current) throw httpError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy thanh toán.');

    if (current.payment_status === paymentStatus) {
      if (transactionReference && current.transaction_reference && transactionReference !== current.transaction_reference) {
        throw httpError(409, 'TRANSACTION_REFERENCE_MISMATCH', 'Callback lặp có transactionReference khác với giao dịch đã ghi.');
      }
      if (transactionReference && !current.transaction_reference) {
        const updatedReference = await client.query(
          `UPDATE payments SET transaction_reference = $1 WHERE payment_id = $2
           RETURNING payment_id, order_id, payment_method, payment_status,
                     amount, transaction_reference, paid_at, created_at`,
          [transactionReference, id]
        );
        result = { payment: mapPayment(updatedReference.rows[0]), orderStatus: current.order_status, changed: false };
      } else {
        result = { payment: mapPayment(current), orderStatus: current.order_status, changed: false };
      }
      await client.query('COMMIT');
      committed = true;
    } else if (paymentStatus === 'REFUNDED') {
      if (current.payment_status !== 'SUCCESS') {
        throw httpError(409, 'INVALID_PAYMENT_TRANSITION', 'Chỉ payment SUCCESS mới được chuyển sang REFUNDED.');
      }
      const updated = await client.query(
        `UPDATE payments
            SET payment_status = 'REFUNDED',
                transaction_reference = COALESCE($1, transaction_reference)
          WHERE payment_id = $2
          RETURNING payment_id, order_id, payment_method, payment_status,
                    amount, transaction_reference, paid_at, created_at`,
        [transactionReference, id]
      );
      result = { payment: mapPayment(updated.rows[0]), orderStatus: current.order_status, changed: true };
      await client.query('COMMIT');
      committed = true;
    } else if (current.payment_status !== 'PENDING') {
      throw httpError(409, 'INVALID_PAYMENT_TRANSITION', `Không thể chuyển payment ${current.payment_status} sang ${paymentStatus}.`);
    } else if (current.order_status !== 'PENDING') {
      throw httpError(409, 'ORDER_NOT_PENDING', 'Đơn không còn PENDING nên callback này bị từ chối.');
    } else if (new Date(current.expires_at) <= new Date()) {
      await client.query(
        `UPDATE orders SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
          WHERE order_id = $1 AND order_status = 'PENDING'`,
        [current.order_id]
      );
      await client.query('COMMIT');
      committed = true;
      expired = true;
    } else {
      const updated = await client.query(
        `UPDATE payments
            SET payment_status = $1::varchar,
                transaction_reference = COALESCE($2, transaction_reference),
                paid_at = CASE WHEN $1::varchar = 'SUCCESS'::varchar THEN CURRENT_TIMESTAMP ELSE NULL END
          WHERE payment_id = $3
          RETURNING payment_id, order_id, payment_method, payment_status,
                    amount, transaction_reference, paid_at, created_at`,
        [paymentStatus, transactionReference, id]
      );

      if (paymentStatus === 'SUCCESS') {
        const consumed = await client.query(
          `UPDATE inventory_reservations r
              SET status = 'CONSUMED', resolved_at = CURRENT_TIMESTAMP
             FROM order_items oi
            WHERE oi.order_id = $1
              AND r.order_item_id = oi.order_item_id
              AND r.status = 'RESERVED'
          RETURNING r.reservation_id`,
          [current.order_id]
        );
        const count = await client.query('SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1', [current.order_id]);
        if (count.rows[0].count < 1 || consumed.rowCount !== count.rows[0].count) {
          throw httpError(409, 'RESERVATION_MISSING', 'Không đủ giữ chỗ để xác nhận thanh toán.');
        }
        await client.query(
          `UPDATE orders SET order_status = 'PAID', updated_at = CURRENT_TIMESTAMP WHERE order_id = $1`,
          [current.order_id]
        );
      } else {
        const released = await client.query(
          `UPDATE inventory_reservations r
              SET status = 'RELEASED', resolved_at = CURRENT_TIMESTAMP
             FROM order_items oi
            WHERE oi.order_id = $1
              AND r.order_item_id = oi.order_item_id
              AND r.status = 'RESERVED'
          RETURNING r.reservation_id`,
          [current.order_id]
        );
        const count = await client.query('SELECT COUNT(*)::int AS count FROM order_items WHERE order_id = $1', [current.order_id]);
        if (count.rows[0].count < 1 || released.rowCount !== count.rows[0].count) {
          throw httpError(409, 'RESERVATION_MISSING', 'Không đủ giữ chỗ để giải phóng sau thanh toán thất bại.');
        }
        // Failed attempts leave the order PENDING, allowing another attempt before expires_at.
      }

      result = {
        payment: mapPayment(updated.rows[0]),
        orderStatus: paymentStatus === 'SUCCESS' ? 'PAID' : 'PENDING',
        changed: true,
      };
      await client.query('COMMIT');
      committed = true;
    }
  } catch (error) {
    if (!committed) {
      try { await client.query('ROLLBACK'); } catch { /* transaction may already be closed */ }
    }
    throw error;
  } finally {
    client.release();
  }
  if (expired) throw httpError(409, 'ORDER_EXPIRED', 'Callback đến sau khi đơn hết hạn; đơn đã được hủy.');
  return result;
}

async function getPaymentById(paymentId) {
  const id = typeof paymentId === 'string' ? paymentId.toLowerCase() : '';
  if (!UUID.test(id)) throw httpError(400, 'INVALID_PAYMENT_ID', 'paymentId phải là UUID hợp lệ.');
  const result = await query(
    `SELECT payment_id, order_id, payment_method, payment_status,
            amount, transaction_reference, paid_at, created_at
       FROM payments WHERE payment_id = $1`,
    [id]
  );
  if (!result.rows[0]) throw httpError(404, 'PAYMENT_NOT_FOUND', 'Không tìm thấy thanh toán.');
  return mapPayment(result.rows[0]);
}

module.exports = { createPayment, setPaymentResult, getPaymentById };