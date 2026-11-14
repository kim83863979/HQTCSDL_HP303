const express = require('express');
const { pool } = require('../../config/db');
const httpError = require('../../shared/httpError');
const { authenticateToken, requirePermissions } = require('../auth/auth.middleware');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORDER_STATUSES = new Set([
  'PENDING', 'PAID', 'DISPENSING', 'COMPLETED', 'FAILED', 'CANCELLED',
]);
const PAYMENT_STATUSES = new Set(['PENDING', 'SUCCESS', 'FAILED', 'REFUNDED']);
const PAYMENT_METHODS = new Set(['CASH', 'CARD', 'QR']);

router.use('/orders', authenticateToken, requirePermissions('VIEW_REPORT'));
router.use('/payments', authenticateToken, requirePermissions('VIEW_REPORT'));
router.use('/reports', authenticateToken, requirePermissions('VIEW_REPORT'));

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

function dateRange(query) {
  const to = parseDate(query.to, 'to') || new Date().toISOString();
  const from = parseDate(query.from, 'from')
    || new Date(new Date(to).getTime() - (30 * 24 * 60 * 60 * 1000)).toISOString();
  if (new Date(from) >= new Date(to)) {
    throw httpError(400, 'INVALID_DATE_RANGE', 'from phải nhỏ hơn to.');
  }
  return { from, to };
}

function addFilter(filters, values, column, value) {
  if (value === undefined) return;
  values.push(value);
  filters.push(`${column} = $${values.length}`);
}

router.get('/orders', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const filters = [];
    const values = [];
    if (req.query.status !== undefined) {
      if (!ORDER_STATUSES.has(req.query.status)) {
        throw httpError(400, 'INVALID_ORDER_STATUS', 'status đơn hàng không hợp lệ.');
      }
      addFilter(filters, values, 'o.order_status', req.query.status);
    }
    if (req.query.machineId !== undefined) {
      validateUuid(req.query.machineId, 'machineId');
      addFilter(filters, values, 'o.machine_id', req.query.machineId);
    }
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    if (from && to && new Date(from) >= new Date(to)) {
      throw httpError(400, 'INVALID_DATE_RANGE', 'from phải nhỏ hơn to.');
    }
    if (from) {
      values.push(from);
      filters.push(`o.created_at >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      filters.push(`o.created_at < $${values.length}`);
    }
    if (req.query.search !== undefined) {
      if (typeof req.query.search !== 'string' || req.query.search.length > 100) {
        throw httpError(400, 'INVALID_SEARCH', 'search tối đa 100 ký tự.');
      }
      values.push(`%${req.query.search.trim()}%`);
      filters.push(`(o.order_id::text ILIKE $${values.length} OR m.machine_code ILIKE $${values.length})`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM public.orders o
       JOIN public.machines m ON m.machine_id = o.machine_id
       ${where}`,
      values,
    );
    const total = count.rows[0].total;
    const result = await pool.query(
      `SELECT o.order_id AS "orderId", o.machine_id AS "machineId",
              m.machine_code AS "machineCode", m.machine_name AS "machineName",
              o.order_status AS status, o.total_amount AS "totalAmount",
              o.created_at AS "createdAt", o.updated_at AS "updatedAt",
              o.expires_at AS "expiresAt",
              (SELECT COUNT(*)::int FROM public.order_items oi WHERE oi.order_id = o.order_id) AS "itemCount",
              (SELECT COUNT(*)::int FROM public.payments p WHERE p.order_id = o.order_id) AS "paymentAttemptCount",
              (SELECT p.payment_status FROM public.payments p
               WHERE p.order_id = o.order_id ORDER BY p.created_at DESC, p.payment_id DESC LIMIT 1) AS "latestPaymentStatus"
       FROM public.orders o
       JOIN public.machines m ON m.machine_id = o.machine_id
       ${where}
       ORDER BY o.created_at DESC, o.order_id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit],
    );
    return res.json({
      success: true,
      data: result.rows.map((order) => ({ ...order, totalAmount: Number(order.totalAmount) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/orders/:orderId', async (req, res, next) => {
  try {
    validateUuid(req.params.orderId, 'orderId');
    const orderResult = await pool.query(
      `SELECT o.order_id AS "orderId", o.machine_id AS "machineId",
              m.machine_code AS "machineCode", m.machine_name AS "machineName",
              o.order_status AS status, o.total_amount AS "totalAmount",
              o.created_at AS "createdAt", o.updated_at AS "updatedAt",
              o.expires_at AS "expiresAt"
       FROM public.orders o
       JOIN public.machines m ON m.machine_id = o.machine_id
       WHERE o.order_id = $1`,
      [req.params.orderId],
    );
    if (!orderResult.rows[0]) throw httpError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
    const [items, payments] = await Promise.all([
      pool.query(
        `SELECT oi.order_item_id AS "orderItemId", oi.product_id AS "productId",
                p.product_name AS "productName", oi.slot_id AS "slotId",
                ms.slot_code AS "slotCode", oi.quantity, oi.unit_price AS "unitPrice",
                oi.subtotal
         FROM public.order_items oi
         JOIN public.products p ON p.product_id = oi.product_id
         JOIN public.machine_slots ms ON ms.slot_id = oi.slot_id
         WHERE oi.order_id = $1
         ORDER BY oi.order_item_id`,
        [req.params.orderId],
      ),
      pool.query(
        `SELECT payment_id AS "paymentId", payment_method AS "paymentMethod",
                payment_status AS status, amount, transaction_reference AS "transactionReference",
                paid_at AS "paidAt", created_at AS "createdAt"
         FROM public.payments
         WHERE order_id = $1
         ORDER BY created_at, payment_id`,
        [req.params.orderId],
      ),
    ]);
    return res.json({
      success: true,
      data: {
        ...orderResult.rows[0],
        totalAmount: Number(orderResult.rows[0].totalAmount),
        items: items.rows.map((item) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
          subtotal: Number(item.subtotal),
        })),
        payments: payments.rows.map((payment) => ({
          ...payment,
          amount: Number(payment.amount),
        })),
      },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const filters = [];
    const values = [];
    if (req.query.status !== undefined) {
      if (!PAYMENT_STATUSES.has(req.query.status)) {
        throw httpError(400, 'INVALID_PAYMENT_STATUS', 'status thanh toán không hợp lệ.');
      }
      addFilter(filters, values, 'p.payment_status', req.query.status);
    }
    if (req.query.paymentMethod !== undefined) {
      if (!PAYMENT_METHODS.has(req.query.paymentMethod)) {
        throw httpError(400, 'INVALID_PAYMENT_METHOD', 'paymentMethod không hợp lệ.');
      }
      addFilter(filters, values, 'p.payment_method', req.query.paymentMethod);
    }
    if (req.query.machineId !== undefined) {
      validateUuid(req.query.machineId, 'machineId');
      addFilter(filters, values, 'o.machine_id', req.query.machineId);
    }
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    if (from && to && new Date(from) >= new Date(to)) {
      throw httpError(400, 'INVALID_DATE_RANGE', 'from phải nhỏ hơn to.');
    }
    if (from) {
      values.push(from);
      filters.push(`p.created_at >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      filters.push(`p.created_at < $${values.length}`);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const fromSql = `FROM public.payments p
       JOIN public.orders o ON o.order_id = p.order_id
       JOIN public.machines m ON m.machine_id = o.machine_id
       ${where}`;
    const count = await pool.query(`SELECT COUNT(*)::int AS total ${fromSql}`, values);
    const total = count.rows[0].total;
    const result = await pool.query(
      `SELECT p.payment_id AS "paymentId", p.order_id AS "orderId",
              m.machine_id AS "machineId", m.machine_code AS "machineCode",
              p.payment_method AS "paymentMethod", p.payment_status AS status,
              p.amount, p.transaction_reference AS "transactionReference",
              p.paid_at AS "paidAt", p.created_at AS "createdAt"
       ${fromSql}
       ORDER BY p.created_at DESC, p.payment_id
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, (page - 1) * limit],
    );
    return res.json({
      success: true,
      data: result.rows.map((payment) => ({ ...payment, amount: Number(payment.amount) })),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/reports/summary', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const values = [from, to];
    let machineFilter = '';
    if (req.query.machineId !== undefined) {
      validateUuid(req.query.machineId, 'machineId');
      values.push(req.query.machineId);
      machineFilter = ` AND machine_id = $${values.length}`;
    }
    const result = await pool.query(
      `WITH order_totals AS (
         SELECT COUNT(*)::int AS total_orders,
                COUNT(*) FILTER (WHERE order_status = 'PENDING')::int AS pending_orders,
                COUNT(*) FILTER (WHERE order_status IN ('PAID', 'DISPENSING', 'COMPLETED'))::int AS paid_orders,
                COUNT(*) FILTER (WHERE order_status = 'COMPLETED')::int AS completed_orders,
                COUNT(*) FILTER (WHERE order_status = 'FAILED')::int AS failed_orders,
                COUNT(*) FILTER (WHERE order_status = 'CANCELLED')::int AS cancelled_orders
         FROM public.orders
         WHERE created_at >= $1 AND created_at < $2${machineFilter}
       ),
       payment_totals AS (
         SELECT COUNT(*) FILTER (WHERE p.payment_status = 'SUCCESS')::int AS successful_payments,
                COUNT(*) FILTER (WHERE p.payment_status = 'REFUNDED')::int AS refunded_payments,
                COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'SUCCESS'), 0)::numeric(14,2) AS gross_revenue,
                COALESCE(SUM(p.amount) FILTER (WHERE p.payment_status = 'REFUNDED'), 0)::numeric(14,2) AS refunded_amount
         FROM public.payments p
         JOIN public.orders o ON o.order_id = p.order_id
         WHERE p.paid_at >= $1 AND p.paid_at < $2
           AND p.payment_status IN ('SUCCESS', 'REFUNDED')${machineFilter.replaceAll('machine_id', 'o.machine_id')}
       )
       SELECT $1::timestamptz AS "from", $2::timestamptz AS "to",
              o.total_orders AS "totalOrders", o.pending_orders AS "pendingOrders",
              o.paid_orders AS "paidOrders", o.completed_orders AS "completedOrders",
              o.failed_orders AS "failedOrders", o.cancelled_orders AS "cancelledOrders",
              p.successful_payments AS "successfulPayments",
              p.refunded_payments AS "refundedPayments",
              p.gross_revenue AS "grossRevenue", p.refunded_amount AS "refundedAmount",
              (p.gross_revenue - p.refunded_amount)::numeric(14,2) AS "netRevenue"
       FROM order_totals o CROSS JOIN payment_totals p`,
      values,
    );
    const summary = result.rows[0];
    for (const key of ['grossRevenue', 'refundedAmount', 'netRevenue']) {
      summary[key] = Number(summary[key]);
    }
    return res.json({ success: true, data: summary });
  } catch (error) {
    return next(error);
  }
});

router.get('/reports/sales', async (req, res, next) => {
  try {
    const { from, to } = dateRange(req.query);
    const groupBy = req.query.groupBy === undefined ? 'day' : req.query.groupBy;
    if (!['day', 'product', 'machine'].includes(groupBy)) {
      throw httpError(400, 'INVALID_GROUP_BY', 'groupBy chỉ nhận day, product hoặc machine.');
    }
    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw httpError(400, 'INVALID_LIMIT', 'limit phải từ 1 đến 500.');
    }
    const values = [from, to];
    let machineFilter = '';
    if (req.query.machineId !== undefined) {
      validateUuid(req.query.machineId, 'machineId');
      values.push(req.query.machineId);
      machineFilter = ` AND o.machine_id = $${values.length}`;
    }
    const groupColumns = {
      day: `DATE_TRUNC('day', paid_at) AS bucket,
            TO_CHAR(DATE_TRUNC('day', paid_at), 'YYYY-MM-DD') AS label`,
      product: `p.product_id AS bucket, p.product_name AS label`,
      machine: `m.machine_id AS bucket, m.machine_code AS label`,
    };
    const joins = groupBy === 'product'
      ? 'JOIN public.orders o ON o.order_id = paid.order_id JOIN public.order_items oi ON oi.order_id = paid.order_id JOIN public.products p ON p.product_id = oi.product_id'
      : 'JOIN public.orders o ON o.order_id = paid.order_id JOIN public.machines m ON m.machine_id = o.machine_id';
    const group = groupBy === 'day'
      ? 'bucket, label'
      : groupBy === 'product'
        ? 'p.product_id, p.product_name'
        : 'm.machine_id, m.machine_code';
    const revenueMetric = groupBy === 'product'
      ? `SUM(oi.subtotal)::numeric(14,2)`
      : 'SUM(paid.revenue)::numeric(14,2)';
    const rowMetrics = groupBy === 'product'
      ? `SUM(oi.quantity)::int AS quantity, SUM(oi.subtotal)::numeric(14,2) AS "itemSales"`
      : `NULL::int AS quantity, NULL::numeric(14,2) AS "itemSales"`;
    const result = await pool.query(
      `WITH paid AS (
         SELECT p.order_id, MAX(p.paid_at) AS paid_at, SUM(p.amount)::numeric(14,2) AS revenue
         FROM public.payments p
         WHERE p.payment_status = 'SUCCESS' AND p.paid_at >= $1 AND p.paid_at < $2
         GROUP BY p.order_id
       )
       SELECT ${groupColumns[groupBy]}, COUNT(DISTINCT paid.order_id)::int AS "orderCount",
              ${revenueMetric} AS revenue,
              ${rowMetrics}
       FROM paid
       ${joins}
       WHERE TRUE${machineFilter}
       GROUP BY ${group}
       ORDER BY ${groupBy === 'day' ? 'bucket ASC' : 'revenue DESC, label'}
       LIMIT $${values.length + 1}`,
      [...values, limit],
    );
    return res.json({
      success: true,
      data: result.rows.map((row) => ({
        ...row,
        revenue: Number(row.revenue),
        itemSales: row.itemSales === null ? null : Number(row.itemSales),
      })),
      meta: { from, to, groupBy },
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
