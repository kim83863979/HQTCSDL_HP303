const { getClient, query } = require('../../config/db');
const httpError = require('../../shared/httpError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateOrder(body) {
  const { machineId, items } = body || {};
  if (!UUID.test(machineId || '')) {
    throw httpError(400, 'INVALID_MACHINE_ID', 'machineId phải là UUID hợp lệ.');
  }
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    throw httpError(400, 'INVALID_ORDER_ITEMS', 'Đơn hàng cần có từ 1 đến 50 sản phẩm.');
  }

  const quantities = new Map();
  for (const item of items) {
    if (!item || !UUID.test(item.productId || '')) {
      throw httpError(400, 'INVALID_PRODUCT_ID', 'Mỗi productId phải là UUID hợp lệ.');
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) {
      throw httpError(400, 'INVALID_QUANTITY', 'quantity phải là số nguyên từ 1 đến 999.');
    }
    const sum = (quantities.get(item.productId) || 0) + item.quantity;
    if (sum > 999) throw httpError(400, 'INVALID_QUANTITY', 'Tổng số lượng mỗi sản phẩm tối đa là 999.');
    quantities.set(item.productId, sum);
  }
  return {
    machineId,
    items: [...quantities].map(([productId, quantity]) => ({ productId, quantity }))
  };
}

function toCents(value) {
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2));
}

async function readOrder(executor, orderId) {
  const orderResult = await executor.query(
    `SELECT order_id AS "orderId", machine_id AS "machineId",
            order_status AS "orderStatus", total_amount AS "totalAmount",
            created_at AS "createdAt", updated_at AS "updatedAt"
       FROM orders WHERE order_id = $1`,
    [orderId]
  );
  if (!orderResult.rows[0]) return null;
  const items = await executor.query(
    `SELECT oi.order_item_id AS "orderItemId", oi.product_id AS "productId",
            p.product_name AS "productName", oi.quantity,
            oi.unit_price AS "unitPrice", oi.subtotal
       FROM order_items oi JOIN products p ON p.product_id = oi.product_id
      WHERE oi.order_id = $1 ORDER BY p.product_name, oi.order_item_id`,
    [orderId]
  );
  const payment = await executor.query(
    `SELECT payment_id AS "paymentId", payment_method AS "paymentMethod",
            payment_status AS "paymentStatus", amount,
            transaction_reference AS "transactionReference", paid_at AS "paidAt"
       FROM payments WHERE order_id = $1`,
    [orderId]
  );
  return { ...orderResult.rows[0], items: items.rows, payment: payment.rows[0] || null };
}

async function createOrder(body) {
  const { machineId, items } = validateOrder(body);
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const machineResult = await client.query(
      'SELECT lifecycle_status FROM machines WHERE machine_id = $1',
      [machineId]
    );
    if (!machineResult.rows[0]) throw httpError(404, 'MACHINE_NOT_FOUND', 'Không tìm thấy máy.');
    if (machineResult.rows[0].lifecycle_status !== 'ACTIVE') {
      throw httpError(409, 'MACHINE_UNAVAILABLE', 'Máy hiện không nhận đơn hàng.');
    }

    const productIds = items.map((item) => item.productId);
    const productResult = await client.query(
      `SELECT product_id, product_name, unit_price FROM products
        WHERE product_id = ANY($1::uuid[]) AND status = 'ACTIVE'`,
      [productIds]
    );
    const productMap = new Map(productResult.rows.map((p) => [p.product_id, p]));
    if (productIds.some((id) => !productMap.has(id))) {
      throw httpError(404, 'PRODUCT_NOT_SELLABLE', 'Có sản phẩm không tồn tại hoặc không được bán.');
    }

    // Pre-check tồn theo máy. Giữ/trừ tồn kho thuộc module Inventory; tích hợp
    // cần gộp bước này với reservation/decrement trong transaction chung.
    const stockResult = await client.query(
      `SELECT i.product_id, COALESCE(SUM(i.quantity), 0)::int AS quantity
         FROM inventories i JOIN machine_slots s ON s.slot_id = i.slot_id
        WHERE s.machine_id = $1 AND s.status = 'ACTIVE'
          AND i.product_id = ANY($2::uuid[])
        GROUP BY i.product_id`,
      [machineId, productIds]
    );
    const stockMap = new Map(stockResult.rows.map((r) => [r.product_id, r.quantity]));

    let totalCents = 0;
    const priced = items.map((item) => {
      const product = productMap.get(item.productId);
      if ((stockMap.get(item.productId) || 0) < item.quantity) {
        throw httpError(409, 'INSUFFICIENT_STOCK', `Không đủ hàng cho sản phẩm ${product.product_name}.`);
      }
      const unitPriceCents = toCents(product.unit_price);
      const subtotalCents = unitPriceCents * item.quantity;
      totalCents += subtotalCents;
      return { ...item, unitPriceCents, subtotalCents };
    });

    if (totalCents < 1 || totalCents > 9999999999) {
      throw httpError(400, 'ORDER_TOTAL_OUT_OF_RANGE', 'Tổng tiền đơn hàng vượt giới hạn database.');
    }

    const inserted = await client.query(
      `INSERT INTO orders (machine_id, order_status, total_amount)
       VALUES ($1, 'PENDING', 0) RETURNING order_id`,
      [machineId]
    );
    const orderId = inserted.rows[0].order_id;

    for (const item of priced) {
      await client.query(
        `INSERT INTO order_items (order_id, product_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.productId, item.quantity,
          (item.unitPriceCents / 100).toFixed(2),
          (item.subtotalCents / 100).toFixed(2)]
      );
    }
    await client.query(
      'UPDATE orders SET total_amount = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2',
      [(totalCents / 100).toFixed(2), orderId]
    );

    const order = await readOrder(client, orderId);
    await client.query('COMMIT');
    return order;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getOrderById(orderId) {
  if (!UUID.test(orderId || '')) throw httpError(400, 'INVALID_ORDER_ID', 'orderId phải là UUID hợp lệ.');
  const order = await readOrder({ query }, orderId);
  if (!order) throw httpError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
  return order;
}

module.exports = { createOrder, getOrderById };
