const { AppError } = require('../products/product.errors');
const orderRepository = require('./order.repository');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS = new Set(['CASH', 'CARD', 'QR']);
const PAYMENT_RESULTS = new Set(['SUCCESS', 'FAILED', 'REFUNDED']);

function requireUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw new AppError(400, `${field} phải là UUID hợp lệ.`);
  }
  return value;
}

function conflict(message) {
  throw new AppError(409, message);
}

function requireQuantity(value) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new AppError(400, 'quantity phải là số nguyên dương.');
  }
  return value;
}

async function reserveOrderItems(client, orderItems, machineId) {
  const slotIds = orderItems.map((item) => item.slotId).sort();
  const inventoryResult = await client.query(
    `SELECT i.inventory_id, i.slot_id, i.product_id, i.quantity, i.reserved_quantity,
            p.product_name, p.unit_price, p.status AS product_status,
            ms.machine_id, ms.status AS slot_status
     FROM inventories i
     JOIN products p ON p.product_id = i.product_id
     JOIN machine_slots ms ON ms.slot_id = i.slot_id
     WHERE i.slot_id = ANY($1::uuid[])
     ORDER BY i.slot_id
     FOR UPDATE OF i, p, ms`,
    [slotIds],
  );
  const inventoryBySlot = new Map(inventoryResult.rows.map((row) => [row.slot_id, row]));

  for (const item of orderItems) {
    const inventory = inventoryBySlot.get(item.slotId);
    if (!inventory) throw new AppError(404, `Không tìm thấy tồn kho cho slot ${item.slotId}.`);
    if (inventory.product_id !== item.productId) {
      throw new AppError(400, `Slot ${item.slotId} không chứa sản phẩm ${item.productId}.`);
    }
    if (inventory.machine_id !== machineId) {
      throw new AppError(400, `Slot ${item.slotId} không thuộc máy của đơn hàng.`);
    }
    if (inventory.slot_status !== 'ACTIVE') {
      throw new AppError(409, `Slot ${inventory.slot_id} đang INACTIVE.`);
    }
    if (inventory.product_status !== 'ACTIVE') {
      throw new AppError(409, `Sản phẩm ${inventory.product_id} đang INACTIVE.`);
    }
    if (inventory.quantity - inventory.reserved_quantity < item.quantity) {
      throw new AppError(409, `Không đủ hàng khả dụng cho sản phẩm ${inventory.product_name}.`);
    }
    item.inventory = inventory;
  }

  return inventoryBySlot;
}

async function createOrder({ machineId: rawMachineId, items: rawItems }) {
  const machineId = requireUuid(rawMachineId, 'machineId');
  if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 50) {
    throw new AppError(400, 'Đơn hàng cần từ 1 đến 50 sản phẩm.');
  }

  const items = rawItems.map((item) => ({
    productId: requireUuid(item && item.productId, 'productId'),
    slotId: requireUuid(item && item.slotId, 'slotId'),
    quantity: requireQuantity(item && item.quantity),
  }));
  if (new Set(items.map((item) => item.productId)).size !== items.length) {
    throw new AppError(400, 'Mỗi sản phẩm chỉ được xuất hiện một lần trong đơn hàng.');
  }
  if (new Set(items.map((item) => item.slotId)).size !== items.length) {
    throw new AppError(400, 'Mỗi slot chỉ được xuất hiện một lần trong đơn hàng.');
  }

  return orderRepository.withTransaction(async (client) => {
    await orderRepository.expirePendingOrders(client);
    const machine = await client.query(
      'SELECT machine_id FROM machines WHERE machine_id = $1 FOR KEY SHARE',
      [machineId],
    );
    if (!machine.rowCount) throw new AppError(404, 'Không tìm thấy máy bán hàng.');

    await reserveOrderItems(client, items, machineId);
    const orderResult = await client.query(
      `INSERT INTO orders (machine_id, order_status, total_amount)
       VALUES ($1, 'PENDING', 0)
       RETURNING order_id`,
      [machineId],
    );
    const orderId = orderResult.rows[0].order_id;

    for (const item of items) {
      const unitPrice = Number(item.inventory.unit_price);
      const subtotal = (unitPrice * item.quantity).toFixed(2);
      const orderItemResult = await client.query(
        `INSERT INTO order_items (order_id, product_id, slot_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING order_item_id`,
        [orderId, item.productId, item.slotId, item.quantity, unitPrice, subtotal],
      );
      await client.query(
        `INSERT INTO inventory_reservations (order_item_id, inventory_id, quantity)
         VALUES ($1, $2, $3)`,
        [orderItemResult.rows[0].order_item_id, item.inventory.inventory_id, item.quantity],
      );
    }

    return orderRepository.findOrderDetails(client, orderId);
  });
}

async function getOrder(orderId) {
  requireUuid(orderId, 'orderId');
  return orderRepository.withTransaction(async (client) => {
    let order = await orderRepository.findOrder(client, orderId, { lock: true });
    if (!order) throw new AppError(404, 'Không tìm thấy đơn hàng.');
    if (order.order_status === 'PENDING' && new Date(order.expires_at) <= new Date()) {
      await client.query(
        `UPDATE orders SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1`,
        [orderId],
      );
    }
    return orderRepository.findOrderDetails(client, orderId);
  });
}

async function createPaymentAttempt(orderId, rawMethod) {
  requireUuid(orderId, 'orderId');
  if (typeof rawMethod !== 'string' || !PAYMENT_METHODS.has(rawMethod)) {
    throw new AppError(400, 'paymentMethod chỉ nhận CASH, CARD hoặc QR.');
  }

  return orderRepository.withTransaction(async (client) => {
    await orderRepository.expirePendingOrders(client);
    const order = await orderRepository.findOrder(client, orderId, { lock: true });
    if (!order) throw new AppError(404, 'Không tìm thấy đơn hàng.');
    if (order.order_status !== 'PENDING') {
      conflict('Chỉ đơn PENDING mới được thanh toán.');
    }
    if (new Date(order.expires_at) <= new Date()) {
      await client.query(
        `UPDATE orders SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1`,
        [orderId],
      );
      conflict('Đơn hàng đã hết thời gian thanh toán.');
    }

    const pending = await client.query(
      `SELECT payment_id FROM payments
       WHERE order_id = $1 AND payment_status = 'PENDING'`,
      [orderId],
    );
    if (pending.rowCount) conflict('Đơn hàng đã có lần thanh toán đang chờ xử lý.');

    const orderItems = await client.query(
      `SELECT oi.order_item_id, oi.product_id, oi.slot_id, oi.quantity
       FROM order_items oi
       WHERE oi.order_id = $1
       ORDER BY oi.slot_id
       FOR UPDATE`,
      [orderId],
    );
    if (!orderItems.rowCount) throw new AppError(409, 'Đơn hàng không có sản phẩm.');

    const activeReservations = await client.query(
      `SELECT oi.order_item_id
       FROM inventory_reservations ir
       JOIN order_items oi ON oi.order_item_id = ir.order_item_id
       WHERE oi.order_id = $1 AND ir.status = 'RESERVED'`,
      [orderId],
    );

    const activeItemIds = new Set(activeReservations.rows.map((item) => item.order_item_id));
    const itemsToReserve = orderItems.rows
      .filter((item) => !activeItemIds.has(item.order_item_id))
      .map((item) => ({
        productId: item.product_id,
        slotId: item.slot_id,
        quantity: item.quantity,
      }));
    if (itemsToReserve.length) {
      const machine = await client.query(
        'SELECT machine_id FROM orders WHERE order_id = $1',
        [orderId],
      );
      const inventories = await reserveOrderItems(
        client,
        itemsToReserve,
        machine.rows[0].machine_id,
      );
      for (const item of itemsToReserve) {
        const orderItem = orderItems.rows.find((row) => row.product_id === item.productId);
        const inventory = inventories.get(item.slotId);
        await client.query(
          `INSERT INTO inventory_reservations (order_item_id, inventory_id, quantity)
           VALUES ($1, $2, $3)`,
          [orderItem.order_item_id, inventory.inventory_id, item.quantity],
        );
      }
    }

    const result = await client.query(
      `INSERT INTO payments (order_id, payment_method, payment_status, amount)
       VALUES ($1, $2, 'PENDING', $3)
       RETURNING payment_id, order_id, payment_method, payment_status, amount, created_at`,
      [orderId, rawMethod, order.total_amount],
    );
    const payment = result.rows[0];
    return {
      id: payment.payment_id,
      orderId: payment.order_id,
      method: payment.payment_method,
      status: payment.payment_status,
      amount: Number(payment.amount),
      createdAt: payment.created_at,
    };
  });
}

async function processPaymentCallback(paymentId, { status: rawStatus, transactionReference }) {
  requireUuid(paymentId, 'paymentId');
  if (typeof rawStatus !== 'string' || !PAYMENT_RESULTS.has(rawStatus)) {
    throw new AppError(400, 'status chỉ nhận SUCCESS, FAILED hoặc REFUNDED.');
  }
  if (transactionReference !== undefined
      && (typeof transactionReference !== 'string' || transactionReference.length > 255)) {
    throw new AppError(400, 'transactionReference phải là chuỗi tối đa 255 ký tự.');
  }

  return orderRepository.withTransaction(async (client) => {
    const paymentLookup = await client.query(
      'SELECT order_id FROM payments WHERE payment_id = $1',
      [paymentId],
    );
    if (!paymentLookup.rowCount) throw new AppError(404, 'Không tìm thấy lần thanh toán.');

    const order = await orderRepository.findOrder(client, paymentLookup.rows[0].order_id, { lock: true });
    const paymentResult = await client.query(
      `SELECT payment_id, order_id, payment_status, transaction_reference
       FROM payments WHERE payment_id = $1 FOR UPDATE`,
      [paymentId],
    );
    const payment = paymentResult.rows[0];

    if (payment.payment_status === rawStatus) {
      if (transactionReference
          && payment.transaction_reference
          && payment.transaction_reference !== transactionReference) {
        conflict('transactionReference không khớp với callback đã xử lý.');
      }
      if (transactionReference && !payment.transaction_reference) {
        await client.query(
          'UPDATE payments SET transaction_reference = $2 WHERE payment_id = $1',
          [paymentId, transactionReference],
        );
      }
      return { id: paymentId, orderId: order.order_id, status: payment.payment_status, idempotent: true };
    }

    if (payment.payment_status !== 'PENDING'
        && !(payment.payment_status === 'SUCCESS' && rawStatus === 'REFUNDED')) {
      conflict(`Không thể chuyển payment ${payment.payment_status} sang ${rawStatus}.`);
    }
    if (rawStatus === 'SUCCESS' && order.order_status !== 'PENDING') {
      conflict('Không thể thanh toán một đơn không còn ở trạng thái PENDING.');
    }

    const result = await client.query(
      `UPDATE payments
       SET payment_status = $2::character varying,
           transaction_reference = COALESCE(transaction_reference, $3),
           paid_at = CASE WHEN $2::character varying = 'SUCCESS' THEN CURRENT_TIMESTAMP ELSE paid_at END
       WHERE payment_id = $1
       RETURNING payment_id, order_id, payment_status, transaction_reference`,
      [paymentId, rawStatus, transactionReference || null],
    );
    return {
      id: result.rows[0].payment_id,
      orderId: result.rows[0].order_id,
      status: result.rows[0].payment_status,
      transactionReference: result.rows[0].transaction_reference,
      idempotent: false,
    };
  });
}

async function cancelOrder(orderId) {
  requireUuid(orderId, 'orderId');
  return orderRepository.withTransaction(async (client) => {
    const order = await orderRepository.findOrder(client, orderId, { lock: true });
    if (!order) throw new AppError(404, 'Không tìm thấy đơn hàng.');
    if (order.order_status === 'CANCELLED') return orderRepository.findOrderDetails(client, orderId);
    if (order.order_status !== 'PENDING') conflict('Chỉ đơn PENDING mới được hủy.');
    await client.query(
      `UPDATE orders SET order_status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1`,
      [orderId],
    );
    return orderRepository.findOrderDetails(client, orderId);
  });
}

async function recordDispenseResult(orderId, succeeded) {
  requireUuid(orderId, 'orderId');
  if (typeof succeeded !== 'boolean') throw new AppError(400, 'success phải là boolean.');
  return orderRepository.withTransaction(async (client) => {
    const order = await orderRepository.findOrder(client, orderId, { lock: true });
    if (!order) throw new AppError(404, 'Không tìm thấy đơn hàng.');
    const targetStatus = succeeded ? 'COMPLETED' : 'FAILED';
    if (order.order_status === targetStatus) {
      return orderRepository.findOrderDetails(client, orderId);
    }
    if (order.order_status !== 'PAID' && order.order_status !== 'DISPENSING') {
      conflict('Chỉ đơn PAID hoặc DISPENSING mới nhận kết quả xuất hàng.');
    }
    if (order.order_status === 'PAID') {
      await client.query(
        `UPDATE orders SET order_status = 'DISPENSING', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1`,
        [orderId],
      );
    }
    await client.query(
      'UPDATE orders SET order_status = $2, updated_at = CURRENT_TIMESTAMP WHERE order_id = $1',
      [orderId, targetStatus],
    );
    return orderRepository.findOrderDetails(client, orderId);
  });
}

async function expireOrders() {
  return orderRepository.withTransaction((client) => orderRepository.expirePendingOrders(client));
}

module.exports = {
  createOrder,
  getOrder,
  createPaymentAttempt,
  processPaymentCallback,
  cancelOrder,
  recordDispenseResult,
  expireOrders,
};
