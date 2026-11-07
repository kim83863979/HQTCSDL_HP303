const { getClient, query } = require('../../config/db');
const httpError = require('../../shared/httpError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TOTAL_CENTS = 9_999_999_999;

function validateOrder(body) {
  const machineId = typeof body?.machineId === 'string' ? body.machineId.toLowerCase() : '';
  if (!UUID.test(machineId)) {
    throw httpError(400, 'INVALID_MACHINE_ID', 'machineId phải là UUID hợp lệ.');
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
    throw httpError(400, 'INVALID_ORDER_ITEMS', 'Đơn hàng cần có từ 1 đến 50 dòng sản phẩm.');
  }

  const combined = new Map();
  for (const raw of body.items) {
    const productId = typeof raw?.productId === 'string' ? raw.productId.toLowerCase() : '';
    const slotId = typeof raw?.slotId === 'string' ? raw.slotId.toLowerCase() : '';
    if (!UUID.test(productId)) throw httpError(400, 'INVALID_PRODUCT_ID', 'productId phải là UUID hợp lệ.');
    if (!UUID.test(slotId)) throw httpError(400, 'INVALID_SLOT_ID', 'slotId là bắt buộc và phải là UUID hợp lệ.');
    if (!Number.isInteger(raw.quantity) || raw.quantity < 1 || raw.quantity > 999) {
      throw httpError(400, 'INVALID_QUANTITY', 'quantity phải là số nguyên từ 1 đến 999.');
    }
    const key = `${productId}:${slotId}`;
    const quantity = (combined.get(key)?.quantity || 0) + raw.quantity;
    if (quantity > 999) throw httpError(400, 'INVALID_QUANTITY', 'Tổng quantity cho một sản phẩm trong một slot tối đa là 999.');
    combined.set(key, { productId, slotId, quantity });
  }
  return { machineId, items: [...combined.values()] };
}

function toCents(value) {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw httpError(500, 'INVALID_DATABASE_PRICE', 'Đơn giá trong database không hợp lệ.');
  return Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
}

async function readOrder(executor, orderId) {
  const orderResult = await executor.query(
    `SELECT order_id AS "orderId", machine_id AS "machineId",
            order_status AS "orderStatus", total_amount AS "totalAmount",
            created_at AS "createdAt", updated_at AS "updatedAt", expires_at AS "expiresAt"
       FROM orders WHERE order_id = $1`,
    [orderId]
  );
  if (!orderResult.rows[0]) return null;

  const [itemResult, reservationResult, paymentResult] = await Promise.all([
    executor.query(
      `SELECT oi.order_item_id AS "orderItemId", oi.product_id AS "productId",
              p.product_name AS "productName", oi.slot_id AS "slotId", oi.quantity,
              oi.unit_price AS "unitPrice", oi.subtotal
         FROM order_items oi JOIN products p ON p.product_id = oi.product_id
        WHERE oi.order_id = $1 ORDER BY oi.order_item_id`,
      [orderId]
    ),
    executor.query(
      `SELECT r.reservation_id AS "reservationId", r.order_item_id AS "orderItemId",
              r.inventory_id AS "inventoryId", r.quantity, r.status,
              r.created_at AS "createdAt", r.resolved_at AS "resolvedAt"
         FROM inventory_reservations r JOIN order_items oi ON oi.order_item_id = r.order_item_id
        WHERE oi.order_id = $1 ORDER BY r.created_at, r.reservation_id`,
      [orderId]
    ),
    executor.query(
      `SELECT payment_id AS "paymentId", order_id AS "orderId",
              payment_method AS "paymentMethod", payment_status AS "paymentStatus",
              amount, transaction_reference AS "transactionReference",
              paid_at AS "paidAt", created_at AS "createdAt"
         FROM payments WHERE order_id = $1 ORDER BY created_at, payment_id`,
      [orderId]
    ),
  ]);

  return {
    ...orderResult.rows[0],
    items: itemResult.rows,
    reservations: reservationResult.rows,
    payments: paymentResult.rows,
    payment: paymentResult.rows.at(-1) || null,
  };
}

async function createOrder(body) {
  const { machineId, items } = validateOrder(body);
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const machineResult = await client.query(
      'SELECT lifecycle_status FROM machines WHERE machine_id = $1 FOR SHARE',
      [machineId]
    );
    if (!machineResult.rows[0]) throw httpError(404, 'MACHINE_NOT_FOUND', 'Không tìm thấy máy.');
    if (machineResult.rows[0].lifecycle_status !== 'ACTIVE') {
      throw httpError(409, 'MACHINE_UNAVAILABLE', 'Máy hiện không nhận đơn hàng.');
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const productResult = await client.query(
      `SELECT product_id, product_name, unit_price
         FROM products WHERE product_id = ANY($1::uuid[]) AND status = 'ACTIVE'`,
      [productIds]
    );
    const products = new Map(productResult.rows.map((product) => [product.product_id, product]));
    if (productIds.some((productId) => !products.has(productId))) {
      throw httpError(404, 'PRODUCT_NOT_SELLABLE', 'Có sản phẩm không tồn tại hoặc hiện không được bán.');
    }

    let totalCents = 0;
    const pricedItems = items.map((item) => {
      const product = products.get(item.productId);
      const unitPriceCents = toCents(product.unit_price);
      const subtotalCents = unitPriceCents * item.quantity;
      totalCents += subtotalCents;
      return { ...item, productName: product.product_name, unitPriceCents, subtotalCents };
    });
    if (totalCents < 1 || totalCents > MAX_TOTAL_CENTS) {
      throw httpError(400, 'ORDER_TOTAL_OUT_OF_RANGE', 'Tổng tiền đơn hàng vượt giới hạn database.');
    }

    // Lock inventories in a stable order so concurrent orders cannot oversell or deadlock.
    const lockedInventory = new Map();
    for (const item of [...pricedItems].sort((a, b) => a.slotId.localeCompare(b.slotId) || a.productId.localeCompare(b.productId))) {
      const result = await client.query(
        `SELECT i.inventory_id, i.quantity, i.reserved_quantity,
                s.machine_id, s.status AS slot_status
           FROM inventories i JOIN machine_slots s ON s.slot_id = i.slot_id
          WHERE i.slot_id = $1 AND i.product_id = $2
          FOR UPDATE OF i`,
        [item.slotId, item.productId]
      );
      const inventory = result.rows[0];
      if (!inventory) {
        throw httpError(404, 'SLOT_PRODUCT_NOT_FOUND', 'Slot không chứa sản phẩm được yêu cầu.');
      }
      if (inventory.machine_id !== machineId) {
        throw httpError(400, 'SLOT_MACHINE_MISMATCH', 'Slot phải thuộc máy được chọn cho đơn hàng.');
      }
      if (inventory.slot_status !== 'ACTIVE') {
        throw httpError(409, 'SLOT_UNAVAILABLE', 'Slot hiện không hoạt động.');
      }
      if (inventory.quantity - inventory.reserved_quantity < item.quantity) {
        throw httpError(409, 'INSUFFICIENT_STOCK', `Không đủ hàng cho sản phẩm ${item.productName}.`);
      }
      lockedInventory.set(`${item.productId}:${item.slotId}`, inventory);
    }

    const insertedOrder = await client.query(
      `INSERT INTO orders (machine_id, order_status, total_amount)
       VALUES ($1, 'PENDING', $2) RETURNING order_id`,
      [machineId, (totalCents / 100).toFixed(2)]
    );
    const orderId = insertedOrder.rows[0].order_id;

    for (const item of pricedItems) {
      const insertedItem = await client.query(
        `INSERT INTO order_items (order_id, product_id, slot_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING order_item_id`,
        [orderId, item.productId, item.slotId, item.quantity,
          (item.unitPriceCents / 100).toFixed(2), (item.subtotalCents / 100).toFixed(2)]
      );
      const inventory = lockedInventory.get(`${item.productId}:${item.slotId}`);
      await client.query(
        `INSERT INTO inventory_reservations (order_item_id, inventory_id, quantity)
         VALUES ($1, $2, $3)`,
        [insertedItem.rows[0].order_item_id, inventory.inventory_id, item.quantity]
      );
    }

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
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT order_status, expires_at FROM orders WHERE order_id = $1 FOR UPDATE',
      [orderId]
    );
    if (!current.rows[0]) throw httpError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
    if (current.rows[0].order_status === 'PENDING' && new Date(current.rows[0].expires_at) <= new Date()) {
      await client.query(
        `UPDATE orders SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
          WHERE order_id = $1 AND order_status = 'PENDING'`,
        [orderId]
      );
    }
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

async function cancelOrder(orderId) {
  if (!UUID.test(orderId || '')) throw httpError(400, 'INVALID_ORDER_ID', 'orderId phải là UUID hợp lệ.');
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT order_status, expires_at FROM orders WHERE order_id = $1 FOR UPDATE',
      [orderId]
    );
    const order = current.rows[0];
    if (!order) throw httpError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
    if (order.order_status === 'CANCELLED') {
      const cancelled = await readOrder(client, orderId);
      await client.query('COMMIT');
      return { order: cancelled, changed: false };
    }
    if (order.order_status !== 'PENDING') {
      throw httpError(409, 'ORDER_NOT_CANCELLABLE', 'Chỉ đơn PENDING mới được hủy.');
    }
    await client.query(
      `UPDATE orders SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP WHERE order_id = $1`,
      [orderId]
    );
    const cancelled = await readOrder(client, orderId);
    await client.query('COMMIT');
    return { order: cancelled, changed: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function expireOrders() {
  const result = await query(
    `WITH expired AS (
       SELECT order_id FROM orders
        WHERE order_status = 'PENDING' AND expires_at <= CURRENT_TIMESTAMP
        ORDER BY expires_at, order_id
        FOR UPDATE SKIP LOCKED
     )
     UPDATE orders o SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
       FROM expired e WHERE o.order_id = e.order_id
       RETURNING o.order_id AS "orderId"`
  );
  return { expiredCount: result.rowCount, orderIds: result.rows.map((row) => row.orderId) };
}

async function reportDispenseResult(orderId, body) {
  if (!UUID.test(orderId || '')) throw httpError(400, 'INVALID_ORDER_ID', 'orderId phải là UUID hợp lệ.');
  if (typeof body?.success !== 'boolean') {
    throw httpError(400, 'INVALID_DISPENSE_RESULT', 'success phải là boolean.');
  }
  if (body.errorMessage !== undefined && (typeof body.errorMessage !== 'string' || body.errorMessage.length > 1000)) {
    throw httpError(400, 'INVALID_ERROR_MESSAGE', 'errorMessage tối đa 1000 ký tự.');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      'SELECT order_status FROM orders WHERE order_id = $1 FOR UPDATE',
      [orderId]
    );
    if (!current.rows[0]) throw httpError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
    const status = current.rows[0].order_status;
    const expectedFinal = body.success ? 'COMPLETED' : 'FAILED';
    if (status === expectedFinal) {
      const unchanged = await readOrder(client, orderId);
      await client.query('COMMIT');
      return { order: unchanged, changed: false };
    }
    if (status !== 'PAID' && status !== 'DISPENSING') {
      throw httpError(409, 'ORDER_NOT_DISPENSABLE', 'Chỉ đơn PAID hoặc DISPENSING mới nhận kết quả xuất hàng.');
    }

    const reservationCounts = await client.query(
      `SELECT COUNT(*)::int AS items,
              COUNT(*) FILTER (WHERE r.status = 'CONSUMED')::int AS consumed
         FROM order_items oi
         LEFT JOIN inventory_reservations r ON r.order_item_id = oi.order_item_id
        WHERE oi.order_id = $1`,
      [orderId]
    );
    if (reservationCounts.rows[0].items < 1 || reservationCounts.rows[0].items !== reservationCounts.rows[0].consumed) {
      throw httpError(409, 'ORDER_INVENTORY_NOT_CONSUMED', 'Không thể báo kết quả xuất hàng khi giữ chỗ chưa được tiêu thụ đầy đủ.');
    }

    if (status === 'PAID') {
      await client.query(
        `UPDATE orders SET order_status = 'DISPENSING', updated_at = CURRENT_TIMESTAMP WHERE order_id = $1`,
        [orderId]
      );
    }
    const finalOrderStatus = body.success ? 'COMPLETED' : 'FAILED';
    await client.query(
      `UPDATE orders SET order_status = $1, updated_at = CURRENT_TIMESTAMP WHERE order_id = $2`,
      [finalOrderStatus, orderId]
    );
    const updated = await readOrder(client, orderId);
    await client.query('COMMIT');
    return { order: updated, changed: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { createOrder, getOrderById, cancelOrder, expireOrders, reportDispenseResult };