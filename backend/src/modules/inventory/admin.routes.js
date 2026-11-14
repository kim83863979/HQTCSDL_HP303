const express = require('express');
const { pool } = require('../../config/db');
const httpError = require('../../shared/httpError');
const { authenticateToken, requirePermissions } = require('../auth/auth.middleware');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_RESTOCK_ITEMS = 100;

router.use(authenticateToken, requirePermissions('MANAGE_INVENTORY'));

function validateUuid(value, field) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw httpError(400, `INVALID_${field.toUpperCase()}`, `${field} phải là UUID hợp lệ.`);
  }
}

function parsePagination(query) {
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (!Number.isInteger(page) || page < 1
      || !Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw httpError(400, 'INVALID_PAGINATION', 'page phải >= 1; limit phải từ 1 đến 100.');
  }
  return { page, limit };
}

function parseDate(value, field) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw httpError(400, 'INVALID_DATE', `${field} phải là ngày ISO hợp lệ.`);
  }
  return new Date(value).toISOString();
}

router.put('/slots/:slotId/product', async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    validateUuid(req.params.slotId, 'slotId');
    const body = req.body || {};
    validateUuid(body.productId, 'productId');
    const quantity = body.quantity === undefined ? 0 : body.quantity;
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      throw httpError(400, 'INVALID_INITIAL_QUANTITY', 'quantity phải là số nguyên không âm.');
    }

    await client.query('BEGIN');
    transactionStarted = true;
    const slotResult = await client.query(
      `SELECT machine_id, slot_code, capacity, status
       FROM public.machine_slots WHERE slot_id = $1 FOR UPDATE`,
      [req.params.slotId],
    );
    const slot = slotResult.rows[0];
    if (!slot) throw httpError(404, 'SLOT_NOT_FOUND', 'Không tìm thấy khe hàng.');
    if (slot.status !== 'ACTIVE') {
      throw httpError(409, 'INACTIVE_SLOT', 'Chỉ có thể gán sản phẩm vào khe đang hoạt động.');
    }
    if (quantity > slot.capacity) {
      throw httpError(409, 'INITIAL_STOCK_EXCEEDS_CAPACITY', `Số lượng ban đầu vượt sức chứa ${slot.capacity}.`);
    }

    const productResult = await client.query(
      `SELECT product_id, product_name, status
       FROM public.products WHERE product_id = $1 FOR KEY SHARE`,
      [body.productId],
    );
    const product = productResult.rows[0];
    if (!product) throw httpError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm.');
    if (product.status !== 'ACTIVE') {
      throw httpError(409, 'INACTIVE_PRODUCT', 'Không thể gán sản phẩm đang ngừng bán.');
    }

    const currentResult = await client.query(
      `SELECT inventory_id, product_id, quantity, reserved_quantity
       FROM public.inventories WHERE slot_id = $1 FOR UPDATE`,
      [req.params.slotId],
    );
    const current = currentResult.rows[0];
    if (current && current.product_id === body.productId) {
      throw httpError(409, 'SLOT_ALREADY_ASSIGNED', 'Khe đã được gán sản phẩm này; dùng API restock để bổ sung số lượng.');
    }
    if (current) {
      if (current.quantity !== 0 || current.reserved_quantity !== 0) {
        throw httpError(409, 'SLOT_HAS_STOCK', 'Chỉ có thể đổi sản phẩm khi tồn kho và lượng đang giữ đều bằng 0.');
      }
      const history = await client.query(
        `SELECT 1
         FROM public.order_items
         WHERE slot_id = $1
         LIMIT 1`,
        [req.params.slotId],
      );
      if (history.rowCount) {
        throw httpError(409, 'SLOT_HAS_ORDER_HISTORY', 'Không thể đổi sản phẩm của khe đã có lịch sử đơn hàng.');
      }
    }

    const inventoryResult = current
      ? await client.query(
        `UPDATE public.inventories
         SET product_id = $2, quantity = $3, updated_at = CURRENT_TIMESTAMP
         WHERE inventory_id = $1
         RETURNING inventory_id`,
        [current.inventory_id, body.productId, quantity],
      )
      : await client.query(
        `INSERT INTO public.inventories (slot_id, product_id, quantity)
         VALUES ($1, $2, $3)
         RETURNING inventory_id`,
        [req.params.slotId, body.productId, quantity],
      );

    let restockEventId = null;
    if (quantity > 0) {
      const event = await client.query(
        `INSERT INTO public.restock_events (machine_id, user_id, notes)
         VALUES ($1, $2, $3)
         RETURNING restock_event_id`,
        [slot.machine_id, req.auth.userId, `Tồn ban đầu khi gán sản phẩm vào khe ${slot.slot_code}`],
      );
      restockEventId = event.rows[0].restock_event_id;
      await client.query(
        `INSERT INTO public.restock_event_items
           (restock_event_id, inventory_id, previous_quantity, added_quantity, new_quantity)
         VALUES ($1, $2, 0, $3, $3)`,
        [restockEventId, inventoryResult.rows[0].inventory_id, quantity],
      );
    }

    await client.query('COMMIT');
    transactionStarted = false;
    return res.status(current ? 200 : 201).json({
      success: true,
      data: {
        inventoryId: inventoryResult.rows[0].inventory_id,
        machineId: slot.machine_id,
        slotId: req.params.slotId,
        slotCode: slot.slot_code,
        productId: product.product_id,
        productName: product.product_name,
        quantity,
        capacity: slot.capacity,
        restockEventId,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[Inventory assignment] Rollback failed:', rollbackError.message);
      }
    }
    if (error.code === '23503') {
      return next(httpError(404, 'RESOURCE_NOT_FOUND', 'Máy, khe hoặc sản phẩm được tham chiếu không tồn tại.'));
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.post('/restocks', async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    const body = req.body || {};
    validateUuid(body.machineId, 'machineId');
    if (!Array.isArray(body.items) || body.items.length === 0
        || body.items.length > MAX_RESTOCK_ITEMS) {
      throw httpError(400, 'INVALID_RESTOCK_ITEMS', `items phải có từ 1 đến ${MAX_RESTOCK_ITEMS} khe hàng.`);
    }
    if (body.notes !== undefined
        && (typeof body.notes !== 'string' || body.notes.length > 2000)) {
      throw httpError(400, 'INVALID_NOTES', 'notes phải là chuỗi tối đa 2000 ký tự.');
    }
    const items = body.items.map((item, index) => {
      validateUuid(item?.slotId, `items[${index}].slotId`);
      if (!Number.isSafeInteger(item?.quantity) || item.quantity <= 0) {
        throw httpError(400, 'INVALID_RESTOCK_QUANTITY', `items[${index}].quantity phải là số nguyên dương.`);
      }
      return { slotId: item.slotId, quantity: item.quantity };
    });
    if (new Set(items.map((item) => item.slotId)).size !== items.length) {
      throw httpError(400, 'DUPLICATE_RESTOCK_SLOT', 'Mỗi khe chỉ được xuất hiện một lần trong một lần nhập hàng.');
    }

    await client.query('BEGIN');
    transactionStarted = true;
    const machine = await client.query(
      'SELECT machine_id FROM public.machines WHERE machine_id = $1 FOR KEY SHARE',
      [body.machineId],
    );
    if (!machine.rowCount) throw httpError(404, 'MACHINE_NOT_FOUND', 'Không tìm thấy máy.');

    const slots = await client.query(
      `SELECT i.inventory_id, i.slot_id, i.quantity, ms.slot_code, ms.capacity,
              ms.status AS slot_status, p.status AS product_status, p.product_name
       FROM public.inventories i
       JOIN public.machine_slots ms ON ms.slot_id = i.slot_id
       JOIN public.products p ON p.product_id = i.product_id
       WHERE ms.machine_id = $1 AND i.slot_id = ANY($2::uuid[])
       ORDER BY i.slot_id
       FOR UPDATE OF i, ms`,
      [body.machineId, items.map((item) => item.slotId)],
    );
    const slotsById = new Map(slots.rows.map((slot) => [slot.slot_id, slot]));
    for (const item of items) {
      const slot = slotsById.get(item.slotId);
      if (!slot) {
        throw httpError(404, 'INVENTORY_NOT_FOUND', `Khe ${item.slotId} không tồn tại hoặc chưa được gán tồn kho trên máy.`);
      }
      if (slot.slot_status !== 'ACTIVE' || slot.product_status !== 'ACTIVE') {
        throw httpError(409, 'INACTIVE_RESTOCK_TARGET', `Khe ${item.slotId} hoặc sản phẩm của khe đang ngừng hoạt động.`);
      }
      if (slot.quantity + item.quantity > slot.capacity) {
        throw httpError(409, 'RESTOCK_EXCEEDS_CAPACITY', `Nhập hàng cho khe ${item.slotId} sẽ vượt sức chứa ${slot.capacity}.`);
      }
      item.inventory = slot;
    }

    const eventResult = await client.query(
      `INSERT INTO public.restock_events (machine_id, user_id, notes)
       VALUES ($1, $2, $3)
       RETURNING restock_event_id, machine_id, user_id, restock_date, notes`,
      [body.machineId, req.auth.userId, body.notes?.trim() || null],
    );
    const event = eventResult.rows[0];
    const eventItems = [];
    for (const item of items) {
      const previousQuantity = Number(item.inventory.quantity);
      const newQuantity = previousQuantity + item.quantity;
      const inventory = await client.query(
        `UPDATE public.inventories
         SET quantity = $2, updated_at = CURRENT_TIMESTAMP
         WHERE inventory_id = $1
         RETURNING inventory_id`,
        [item.inventory.inventory_id, newQuantity],
      );
      if (!inventory.rowCount) throw httpError(409, 'INVENTORY_CHANGED', 'Tồn kho đã thay đổi; vui lòng tải lại và thử lại.');

      const detail = await client.query(
        `INSERT INTO public.restock_event_items
           (restock_event_id, inventory_id, previous_quantity, added_quantity, new_quantity)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING restock_event_item_id, inventory_id, previous_quantity, added_quantity, new_quantity`,
        [event.restock_event_id, item.inventory.inventory_id, previousQuantity, item.quantity, newQuantity],
      );
      eventItems.push({
        restockEventItemId: detail.rows[0].restock_event_item_id,
        inventoryId: detail.rows[0].inventory_id,
        previousQuantity: detail.rows[0].previous_quantity,
        addedQuantity: detail.rows[0].added_quantity,
        newQuantity: detail.rows[0].new_quantity,
        slotId: item.slotId,
        slotCode: item.inventory.slot_code,
        productName: item.inventory.product_name,
      });
    }

    await client.query('COMMIT');
    transactionStarted = false;
    return res.status(201).json({
      success: true,
      data: {
        restockEventId: event.restock_event_id,
        machineId: event.machine_id,
        userId: event.user_id,
        restockDate: event.restock_date,
        notes: event.notes,
        items: eventItems,
      },
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[Restock] Rollback failed:', rollbackError.message);
      }
    }
    return next(error);
  } finally {
    client.release();
  }
});

router.get('/restocks', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const { machineId } = req.query;
    if (machineId !== undefined) validateUuid(machineId, 'machineId');
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    if (from && to && new Date(from) >= new Date(to)) {
      throw httpError(400, 'INVALID_DATE_RANGE', 'from phải nhỏ hơn to.');
    }

    const conditions = [];
    const values = [];
    if (machineId) {
      values.push(machineId);
      conditions.push(`re.machine_id = $${values.length}`);
    }
    if (from) {
      values.push(from);
      conditions.push(`re.restock_date >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      conditions.push(`re.restock_date < $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM public.restock_events re ${where}`,
      values,
    );
    const total = count.rows[0].total;
    const result = await pool.query(
      `SELECT re.restock_event_id AS "restockEventId", re.machine_id AS "machineId",
              m.machine_code AS "machineCode", m.machine_name AS "machineName",
              re.user_id AS "userId", u.fullname AS "operatorName",
              re.restock_date AS "restockDate", re.notes,
              COUNT(ri.restock_event_item_id)::int AS "itemCount",
              COALESCE(SUM(ri.added_quantity), 0)::int AS "totalAdded"
       FROM public.restock_events re
       JOIN public.machines m ON m.machine_id = re.machine_id
       JOIN public.users u ON u.user_id = re.user_id
       LEFT JOIN public.restock_event_items ri ON ri.restock_event_id = re.restock_event_id
       ${where}
       GROUP BY re.restock_event_id, m.machine_code, m.machine_name, u.fullname
       ORDER BY re.restock_date DESC, re.restock_event_id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit],
    );
    return res.json({
      success: true,
      data: result.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/restocks/:restockEventId', async (req, res, next) => {
  try {
    validateUuid(req.params.restockEventId, 'restockEventId');
    const eventResult = await pool.query(
      `SELECT re.restock_event_id AS "restockEventId", re.machine_id AS "machineId",
              m.machine_code AS "machineCode", m.machine_name AS "machineName",
              re.user_id AS "userId", u.fullname AS "operatorName",
              re.restock_date AS "restockDate", re.notes
       FROM public.restock_events re
       JOIN public.machines m ON m.machine_id = re.machine_id
       JOIN public.users u ON u.user_id = re.user_id
       WHERE re.restock_event_id = $1`,
      [req.params.restockEventId],
    );
    if (!eventResult.rows[0]) throw httpError(404, 'RESTOCK_NOT_FOUND', 'Không tìm thấy lịch sử nhập hàng.');
    const items = await pool.query(
      `SELECT ri.restock_event_item_id AS "restockEventItemId",
              i.inventory_id AS "inventoryId", i.slot_id AS "slotId",
              ms.slot_code AS "slotCode", p.product_id AS "productId",
              p.product_name AS "productName", ri.previous_quantity AS "previousQuantity",
              ri.added_quantity AS "addedQuantity", ri.new_quantity AS "newQuantity"
       FROM public.restock_event_items ri
       JOIN public.inventories i ON i.inventory_id = ri.inventory_id
       JOIN public.machine_slots ms ON ms.slot_id = i.slot_id
       JOIN public.products p ON p.product_id = i.product_id
       WHERE ri.restock_event_id = $1
       ORDER BY ms.slot_code, ri.restock_event_item_id`,
      [req.params.restockEventId],
    );
    return res.json({ success: true, data: { ...eventResult.rows[0], items: items.rows } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
