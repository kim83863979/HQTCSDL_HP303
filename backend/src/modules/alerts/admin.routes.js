const express = require('express');
const { pool } = require('../../config/db');
const httpError = require('../../shared/httpError');
const { authenticateToken, requirePermissions } = require('../auth/auth.middleware');

const router = express.Router();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALERT_STATUSES = new Set(['OPEN', 'ACKNOWLEDGED', 'RESOLVED']);
const ALERT_SEVERITIES = new Set(['INFO', 'WARNING', 'CRITICAL']);
const ALERT_SELECT = `
  SELECT a.alert_id AS "alertId", a.machine_id AS "machineId",
         m.machine_code AS "machineCode", m.machine_name AS "machineName",
         a.alert_type AS "alertType", a.severity, a.message, a.status,
         a.source_key AS "sourceKey", a.created_at AS "createdAt",
         a.updated_at AS "updatedAt", a.acknowledged_at AS "acknowledgedAt",
         a.acknowledged_by AS "acknowledgedBy",
         ack.fullname AS "acknowledgedByName",
         a.resolved_at AS "resolvedAt", a.resolved_by AS "resolvedBy",
         resolver.fullname AS "resolvedByName"
  FROM public.alerts a
  JOIN public.machines m ON m.machine_id = a.machine_id
  LEFT JOIN public.users ack ON ack.user_id = a.acknowledged_by
  LEFT JOIN public.users resolver ON resolver.user_id = a.resolved_by
`;

router.use('/alerts', authenticateToken, requirePermissions('MANAGE_ALERT'));

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

function validateAlertPayload(body) {
  validateUuid(body.machineId, 'machineId');
  if (typeof body.alertType !== 'string'
      || !/^[A-Z][A-Z0-9_]{1,49}$/.test(body.alertType)) {
    throw httpError(400, 'INVALID_ALERT_TYPE', 'alertType phải viết hoa, dùng chữ/số/gạch dưới và tối đa 50 ký tự.');
  }
  if (!ALERT_SEVERITIES.has(body.severity)) {
    throw httpError(400, 'INVALID_ALERT_SEVERITY', 'severity chỉ nhận INFO, WARNING hoặc CRITICAL.');
  }
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) {
    throw httpError(400, 'INVALID_ALERT_MESSAGE', 'message không được để trống và tối đa 2000 ký tự.');
  }
  if (body.sourceKey !== undefined
      && (typeof body.sourceKey !== 'string' || !body.sourceKey.trim() || body.sourceKey.length > 100)) {
    throw httpError(400, 'INVALID_SOURCE_KEY', 'sourceKey phải là chuỗi 1–100 ký tự.');
  }
}

router.get('/alerts', async (req, res, next) => {
  try {
    const { page, limit } = parsePagination(req.query);
    const conditions = [];
    const values = [];
    const { status, severity, machineId } = req.query;
    if (status !== undefined) {
      if (!ALERT_STATUSES.has(status)) throw httpError(400, 'INVALID_ALERT_STATUS', 'status không hợp lệ.');
      values.push(status);
      conditions.push(`a.status = $${values.length}`);
    }
    if (severity !== undefined) {
      if (!ALERT_SEVERITIES.has(severity)) throw httpError(400, 'INVALID_ALERT_SEVERITY', 'severity không hợp lệ.');
      values.push(severity);
      conditions.push(`a.severity = $${values.length}`);
    }
    if (machineId !== undefined) {
      validateUuid(machineId, 'machineId');
      values.push(machineId);
      conditions.push(`a.machine_id = $${values.length}`);
    }
    const from = parseDate(req.query.from, 'from');
    const to = parseDate(req.query.to, 'to');
    if (from && to && new Date(from) >= new Date(to)) {
      throw httpError(400, 'INVALID_DATE_RANGE', 'from phải nhỏ hơn to.');
    }
    if (from) {
      values.push(from);
      conditions.push(`a.created_at >= $${values.length}`);
    }
    if (to) {
      values.push(to);
      conditions.push(`a.created_at < $${values.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const count = await pool.query(
      `SELECT COUNT(*)::int AS total FROM public.alerts a ${where}`,
      values,
    );
    const total = count.rows[0].total;
    const result = await pool.query(
      `${ALERT_SELECT} ${where}
       ORDER BY CASE a.severity WHEN 'CRITICAL' THEN 0 WHEN 'WARNING' THEN 1 ELSE 2 END,
                a.created_at DESC, a.alert_id
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

router.post('/alerts', async (req, res, next) => {
  try {
    const body = req.body || {};
    validateAlertPayload(body);
    const result = await pool.query(
      `INSERT INTO public.alerts (machine_id, alert_type, severity, message, source_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (source_key) WHERE source_key IS NOT NULL DO NOTHING
       RETURNING alert_id`,
      [body.machineId, body.alertType, body.severity, body.message.trim(), body.sourceKey?.trim() || null],
    );
    if (!result.rowCount) {
      const existing = await pool.query(
        `SELECT alert_id, machine_id, alert_type, severity, message
         FROM public.alerts WHERE source_key = $1`,
        [body.sourceKey.trim()],
      );
      const alert = existing.rows[0];
      if (!alert || alert.machine_id !== body.machineId
          || alert.alert_type !== body.alertType || alert.severity !== body.severity
          || alert.message !== body.message.trim()) {
        throw httpError(409, 'SOURCE_KEY_CONFLICT', 'sourceKey đã được dùng cho một cảnh báo khác.');
      }
      const detail = await pool.query(
        `${ALERT_SELECT} WHERE a.alert_id = $1`,
        [alert.alert_id],
      );
      return res.status(200).json({ success: true, idempotent: true, data: detail.rows[0] });
    }
    const detail = await pool.query(
      `${ALERT_SELECT} WHERE a.alert_id = $1`,
      [result.rows[0].alert_id],
    );
    return res.status(201).json({ success: true, idempotent: false, data: detail.rows[0] });
  } catch (error) {
    if (error.code === '23503') {
      return next(httpError(404, 'MACHINE_NOT_FOUND', 'Không tìm thấy máy của cảnh báo.'));
    }
    return next(error);
  }
});

router.get('/alerts/:alertId', async (req, res, next) => {
  try {
    validateUuid(req.params.alertId, 'alertId');
    const result = await pool.query(
      `${ALERT_SELECT} WHERE a.alert_id = $1`,
      [req.params.alertId],
    );
    if (!result.rows[0]) throw httpError(404, 'ALERT_NOT_FOUND', 'Không tìm thấy cảnh báo.');
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    return next(error);
  }
});

router.patch('/alerts/:alertId/status', async (req, res, next) => {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    validateUuid(req.params.alertId, 'alertId');
    const { status } = req.body || {};
    if (!ALERT_STATUSES.has(status)) {
      throw httpError(400, 'INVALID_ALERT_STATUS', 'status chỉ nhận OPEN, ACKNOWLEDGED hoặc RESOLVED.');
    }
    await client.query('BEGIN');
    transactionStarted = true;
    const currentResult = await client.query(
      `SELECT alert_id, status FROM public.alerts WHERE alert_id = $1 FOR UPDATE`,
      [req.params.alertId],
    );
    const current = currentResult.rows[0];
    if (!current) throw httpError(404, 'ALERT_NOT_FOUND', 'Không tìm thấy cảnh báo.');
    const allowed = {
      OPEN: ['ACKNOWLEDGED', 'RESOLVED'],
      ACKNOWLEDGED: ['RESOLVED'],
      RESOLVED: [],
    };
    if (current.status !== status && !allowed[current.status]?.includes(status)) {
      throw httpError(409, 'INVALID_ALERT_TRANSITION', `Không thể chuyển cảnh báo từ ${current.status} sang ${status}.`);
    }
    if (current.status !== status) {
      if (status === 'ACKNOWLEDGED') {
        await client.query(
          `UPDATE public.alerts
           SET status = 'ACKNOWLEDGED', updated_at = CURRENT_TIMESTAMP,
               acknowledged_at = CURRENT_TIMESTAMP, acknowledged_by = $2
           WHERE alert_id = $1`,
          [req.params.alertId, req.auth.userId],
        );
      } else {
        await client.query(
          `UPDATE public.alerts
           SET status = 'RESOLVED', updated_at = CURRENT_TIMESTAMP,
               resolved_at = CURRENT_TIMESTAMP, resolved_by = $2
           WHERE alert_id = $1`,
          [req.params.alertId, req.auth.userId],
        );
      }
    }
    const result = await client.query(
      `${ALERT_SELECT} WHERE a.alert_id = $1`,
      [req.params.alertId],
    );
    await client.query('COMMIT');
    transactionStarted = false;
    return res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('[Alert] Rollback failed:', rollbackError.message);
      }
    }
    return next(error);
  } finally {
    client.release();
  }
});

module.exports = router;
