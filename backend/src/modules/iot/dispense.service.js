const { randomUUID } = require('node:crypto');
const { pool } = require('../../config/db');
const machineService = require('../machines/machine.service');
const { AppError } = require('../products/product.errors');

const PREFIX = (process.env.MQTT_TOPIC_PREFIX || 'freshvend').replace(/^\/+|\/+$/g, '');
const MAX_ATTEMPTS = Math.max(1, Number.parseInt(process.env.MQTT_DISPENSE_MAX_ATTEMPTS || '10', 10));
const RESULT_TIMEOUT_SECONDS = Math.max(5, Number.parseInt(process.env.MQTT_DISPENSE_RESULT_TIMEOUT_SECONDS || '30', 10));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ITEM_STATUSES = new Set(['SUCCESS', 'FAILED', 'REJECTED', 'SKIPPED']);
let timer = null;
let activeAdapter = null;
let pollRunning = false;

function assertMachineCode(code) {
  if (typeof code !== 'string' || !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code)) {
    throw new Error('Invalid machineCode in database.');
  }
}

async function enqueuePaidOrder(client, orderId) {
  const existing = await client.query(
    'SELECT command_id FROM public.dispense_commands WHERE order_id = $1',
    [orderId],
  );
  if (existing.rowCount) return existing.rows[0].command_id;

  const orderResult = await client.query(
    `SELECT o.order_id, o.machine_id, o.order_status, m.machine_code
     FROM public.orders o
     JOIN public.machines m ON m.machine_id = o.machine_id
     WHERE o.order_id = $1
     FOR UPDATE OF o`,
    [orderId],
  );
  const order = orderResult.rows[0];
  if (!order || order.order_status !== 'PAID') return null;
  assertMachineCode(order.machine_code);

  const itemResult = await client.query(
    `SELECT oi.order_item_id, oi.product_id, oi.slot_id, oi.quantity,
            ms.slot_code, ir.status AS reservation_status
     FROM public.order_items oi
     JOIN public.machine_slots ms ON ms.slot_id = oi.slot_id
     LEFT JOIN public.inventory_reservations ir
       ON ir.order_item_id = oi.order_item_id AND ir.status = 'CONSUMED'
     WHERE oi.order_id = $1
     ORDER BY oi.order_item_id
     FOR SHARE OF oi, ms`,
    [orderId],
  );
  if (!itemResult.rowCount
      || itemResult.rows.some((item) => item.reservation_status !== 'CONSUMED')) {
    throw new Error(`Paid order ${orderId} does not have a consumed reservation for every item.`);
  }

  const commandId = randomUUID();
  const topic = `${PREFIX}/${order.machine_code}/commands/dispense`;
  const payload = {
    commandId,
    orderId,
    machineId: order.machine_id,
    machineCode: order.machine_code,
    timestamp: new Date().toISOString(),
    items: itemResult.rows.map((item) => ({
      columnId: item.slot_code,
      slotId: item.slot_id,
      productId: item.product_id,
      quantity: item.quantity,
    })),
  };
  await client.query(
    `INSERT INTO public.dispense_commands
       (command_id, order_id, machine_id, machine_code, topic, payload)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     ON CONFLICT (order_id) DO NOTHING`,
    [commandId, orderId, order.machine_id, order.machine_code, topic, JSON.stringify(payload)],
  );
  const saved = await client.query(
    'SELECT command_id FROM public.dispense_commands WHERE order_id = $1',
    [orderId],
  );
  return saved.rows[0].command_id;
}

async function claimNextCommand() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT dc.command_id, dc.order_id, dc.machine_code, dc.topic, dc.payload,
              dc.status, dc.attempts, dc.last_attempt_at,
              ms.connection_status, ms.last_seen_at
       FROM public.dispense_commands dc
       LEFT JOIN public.machine_statuses ms ON ms.machine_id = dc.machine_id
       WHERE (dc.status = 'QUEUED' AND dc.next_attempt_at <= CURRENT_TIMESTAMP)
          OR (dc.status IN ('PUBLISHING', 'AWAITING_RESULT')
              AND dc.last_attempt_at <= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 second'))
       ORDER BY dc.created_at, dc.command_id
       FOR UPDATE OF dc SKIP LOCKED
       LIMIT 1`,
      [RESULT_TIMEOUT_SECONDS],
    );
    const command = result.rows[0];
    if (!command) {
      await client.query('COMMIT');
      return null;
    }

    const isResponseTimeout = ['PUBLISHING', 'AWAITING_RESULT'].includes(command.status);
    if (command.attempts >= MAX_ATTEMPTS) {
      await client.query(
        `UPDATE public.dispense_commands
         SET status = 'DEAD_LETTER',
             last_error = CASE WHEN $2 THEN 'No valid device result after retry limit'
                               ELSE 'Publish retry limit reached' END,
             updated_at = CURRENT_TIMESTAMP
         WHERE command_id = $1`,
        [command.command_id, isResponseTimeout],
      );
      await client.query('COMMIT');
      console.error(`[DISPENSE] Command ${command.command_id} moved to DEAD_LETTER after retry limit.`);
      return null;
    }
    if (isResponseTimeout) {
      await client.query(
        `UPDATE public.dispense_commands
         SET status = 'QUEUED', next_attempt_at = CURRENT_TIMESTAMP,
             last_error = 'Timed out waiting for device result', updated_at = CURRENT_TIMESTAMP
         WHERE command_id = $1`,
        [command.command_id],
      );
      await client.query('COMMIT');
      return null;
    }

    const machineOnline = command.connection_status === 'ONLINE'
      && command.last_seen_at
      && Date.now() - new Date(command.last_seen_at).getTime() <= 60_000;
    if (!machineOnline) {
      await client.query(
        `UPDATE public.dispense_commands
         SET next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '3 seconds',
             last_error = 'Waiting for a fresh ONLINE device status',
             updated_at = CURRENT_TIMESTAMP
         WHERE command_id = $1`,
        [command.command_id],
      );
      await client.query('COMMIT');
      return null;
    }

    const claimed = await client.query(
      `UPDATE public.dispense_commands
       SET status = 'PUBLISHING', attempts = attempts + 1,
           last_attempt_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE command_id = $1
       RETURNING command_id, order_id, machine_code, topic, payload`,
      [command.command_id],
    );
    await client.query('COMMIT');
    return claimed.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function dispatchOne(adapter) {
  const command = await claimNextCommand();
  if (!command) return;
  try {
    await adapter.publish(command.topic, command.payload);
    await pool.query(
      `UPDATE public.dispense_commands
       SET status = 'AWAITING_RESULT', last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE command_id = $1 AND status = 'PUBLISHING'`,
      [command.command_id],
    );
    console.info(`[DISPENSE] Published command ${command.command_id} for order ${command.order_id}.`);
  } catch (error) {
    const backoffSeconds = Math.min(60, 2 ** Math.min(5, Number(command.attempts || 0)));
    await pool.query(
      `UPDATE public.dispense_commands
       SET status = CASE WHEN attempts >= $2 THEN 'DEAD_LETTER' ELSE 'QUEUED' END,
           next_attempt_at = CURRENT_TIMESTAMP + ($3::int * INTERVAL '1 second'),
           last_error = $4, updated_at = CURRENT_TIMESTAMP
       WHERE command_id = $1 AND status = 'PUBLISHING'`,
      [command.command_id, MAX_ATTEMPTS, backoffSeconds, error.message],
    );
    console.error(`[DISPENSE] Publish failed for ${command.command_id}:`, error.message);
  }
}

function start(adapter) {
  if (timer) return;
  activeAdapter = adapter;
  timer = setInterval(() => {
    if (pollRunning || !activeAdapter.isConnected()) return;
    pollRunning = true;
    void dispatchOne(activeAdapter)
      .catch((error) => console.error('[DISPENSE] Outbox worker failed:', error.message))
      .finally(() => { pollRunning = false; });
  }, 500);
  timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  activeAdapter = null;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableJson(value[key])]));
  }
  return value;
}

function validateResult(result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new AppError(400, 'Dispense result must be a JSON object.');
  }
  if (!UUID.test(result.commandId || '') || !UUID.test(result.orderId || '')) {
    throw new AppError(400, 'Dispense result must include UUID commandId and orderId.');
  }
  if (typeof result.machineCode !== 'string' || !Array.isArray(result.items)) {
    throw new AppError(400, 'Dispense result is missing machineCode or items.');
  }
}

function resultOutcome(result) {
  return stableJson({
    commandId: result.commandId,
    orderId: result.orderId,
    machineCode: result.machineCode,
    machineId: result.machineId || null,
    eventCode: result.eventCode,
    status: result.status,
    items: result.items.map((item) => ({
      columnId: item.columnId,
      slotId: item.slotId,
      productId: item.productId,
      quantity: item.quantity,
      dispensedQuantity: item.dispensedQuantity,
      status: item.status,
      errorCode: item.errorCode || null,
    })),
  });
}

async function processDispenseResult(result) {
  validateResult(result);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const commandResult = await client.query(
      `SELECT command_id, order_id, machine_id, machine_code, status, result
       FROM public.dispense_commands WHERE command_id = $1 FOR UPDATE`,
      [result.commandId],
    );
    const command = commandResult.rows[0];
    if (!command) throw new AppError(404, `Unknown dispense command ${result.commandId}.`);
    if (command.order_id !== result.orderId
        || command.machine_code !== result.machineCode.toUpperCase()
        || result.machineId !== command.machine_id) {
      throw new AppError(409, 'Dispense result does not match the stored order and machine.');
    }

    const priorResult = command.result;
    if (['COMPLETED', 'FAILED'].includes(command.status)) {
      if (JSON.stringify(resultOutcome(priorResult)) !== JSON.stringify(resultOutcome(result))) {
        throw new AppError(409, `Conflicting duplicate result for command ${result.commandId}.`);
      }
      await client.query('COMMIT');
      return {
        idempotent: true,
        orderId: command.order_id,
        status: command.status,
        items: resultOutcome(priorResult).items,
      };
    }

    const orderResult = await client.query(
      `SELECT order_id, machine_id, order_status
       FROM public.orders WHERE order_id = $1 FOR UPDATE`,
      [command.order_id],
    );
    const order = orderResult.rows[0];
    if (!order || order.machine_id !== command.machine_id
        || !['PAID', 'DISPENSING'].includes(order.order_status)) {
      throw new AppError(409, 'Order is not eligible to receive a dispense result.');
    }

    const itemResult = await client.query(
      `SELECT oi.order_item_id, oi.product_id, oi.slot_id, oi.quantity,
              oi.unit_price, ms.slot_code
       FROM public.order_items oi
       JOIN public.machine_slots ms ON ms.slot_id = oi.slot_id
       WHERE oi.order_id = $1
       ORDER BY oi.order_item_id`,
      [order.order_id],
    );
    if (result.items.length !== itemResult.rowCount) {
      throw new AppError(400, 'Dispense result item count does not match the order.');
    }
    const itemsBySlot = new Map(itemResult.rows.map((item) => [item.slot_id, item]));
    const normalizedItems = [];
    const seenSlots = new Set();
    for (const reported of result.items) {
      const expected = itemsBySlot.get(reported.slotId);
      if (!expected || seenSlots.has(reported.slotId)
          || expected.product_id !== reported.productId
          || expected.slot_code !== reported.columnId
          || expected.quantity !== reported.quantity
          || !ITEM_STATUSES.has(reported.status)
          || !Number.isInteger(reported.dispensedQuantity)
          || reported.dispensedQuantity < 0
          || reported.dispensedQuantity > expected.quantity
          || (reported.status === 'SUCCESS' && reported.dispensedQuantity !== expected.quantity)
          || (['REJECTED', 'SKIPPED'].includes(reported.status) && reported.dispensedQuantity !== 0)) {
        throw new AppError(400, 'Dispense result contains an item that does not match the order.');
      }
      seenSlots.add(reported.slotId);
      normalizedItems.push({ expected, reported });
    }

    const allSucceeded = normalizedItems.every(({ reported }) => (
      reported.status === 'SUCCESS' && reported.dispensedQuantity === reported.quantity
    ));
    if ((result.status === 'SUCCESS') !== allSucceeded
        || result.eventCode !== (allSucceeded ? 'DISPENSE_SUCCESS' : 'DISPENSE_FAILED')) {
      throw new AppError(400, 'Dispense result status does not agree with its item-level results.');
    }

    let refundDueAmount = 0;
    for (const { expected, reported } of normalizedItems) {
      refundDueAmount += (expected.quantity - reported.dispensedQuantity) * Number(expected.unit_price);
      await client.query(
        `UPDATE public.order_items
         SET dispensed_quantity = $2, dispense_status = $3
         WHERE order_item_id = $1`,
        [expected.order_item_id, reported.dispensedQuantity, reported.status],
      );
    }
    refundDueAmount = Number(refundDueAmount.toFixed(2));

    if (order.order_status === 'PAID') {
      await client.query(
        `UPDATE public.orders SET order_status = 'DISPENSING', updated_at = CURRENT_TIMESTAMP
         WHERE order_id = $1`,
        [order.order_id],
      );
    }
    const orderStatus = allSucceeded ? 'COMPLETED' : 'FAILED';
    await client.query(
      `UPDATE public.orders
       SET order_status = $2, refund_due_amount = $3, updated_at = CURRENT_TIMESTAMP
       WHERE order_id = $1`,
      [order.order_id, orderStatus, refundDueAmount],
    );

    if (!allSucceeded) {
      for (const { expected, reported } of normalizedItems) {
        if (reported.dispensedQuantity > 0) {
          const adjusted = await client.query(
            `UPDATE public.inventories
             SET quantity = quantity - $2, updated_at = CURRENT_TIMESTAMP
             WHERE slot_id = $1 AND quantity >= $2`,
            [expected.slot_id, reported.dispensedQuantity],
          );
          if (!adjusted.rowCount) throw new AppError(409, 'Could not reconcile dispensed inventory.');
        }
      }
    }

    await client.query(
      `UPDATE public.dispense_commands
       SET status = $2, result = $3::jsonb, completed_at = CURRENT_TIMESTAMP,
           last_error = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE command_id = $1`,
      [command.command_id, allSucceeded ? 'COMPLETED' : 'FAILED', JSON.stringify(result)],
    );
    await client.query('COMMIT');
    return {
      idempotent: false,
      orderId: order.order_id,
      status: orderStatus,
      refundDueAmount,
      items: normalizedItems.map(({ expected, reported }) => ({
        slotId: expected.slot_id,
        columnId: expected.slot_code,
        productId: expected.product_id,
        quantity: expected.quantity,
        dispensedQuantity: reported.dispensedQuantity,
        status: reported.status,
        errorCode: reported.errorCode || null,
      })),
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[DISPENSE] Result rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

async function publishControl(machineId, action, columnId) {
  if (!activeAdapter || !activeAdapter.isConnected()) {
    const error = new Error('MQTT broker is unavailable.');
    error.statusCode = 503;
    throw error;
  }
  if (action !== 'CLEAR_FAULT') {
    const error = new Error('Only CLEAR_FAULT is supported.');
    error.statusCode = 400;
    throw error;
  }
  const result = await pool.query(
    `SELECT m.machine_code, ms.connection_status, ms.last_seen_at
     FROM public.machines m
     LEFT JOIN public.machine_statuses ms ON ms.machine_id = m.machine_id
     WHERE m.machine_id = $1`,
    [machineId],
  );
  const machine = result.rows[0];
  if (!machine) {
    const error = new Error('Machine not found.');
    error.statusCode = 404;
    throw error;
  }
  assertMachineCode(machine.machine_code);
  if (machine.connection_status !== 'ONLINE' || !machine.last_seen_at
      || Date.now() - new Date(machine.last_seen_at).getTime() > 60_000) {
    const error = new Error('Machine is offline.');
    error.statusCode = 409;
    throw error;
  }
  const requestId = randomUUID();
  if (columnId !== undefined
      && (typeof columnId !== 'string' || !/^[A-Z][0-9]{1,3}$/i.test(columnId))) {
    const error = new Error('columnId must be a valid slot code.');
    error.statusCode = 400;
    throw error;
  }
  await activeAdapter.publish(`${PREFIX}/${machine.machine_code}/commands/control`, {
    requestId,
    action,
    ...(columnId ? { columnId } : {}),
    machineCode: machine.machine_code,
  });
  return { requestId, machineCode: machine.machine_code, status: 'PUBLISHED' };
}

async function receiveTelemetry(payload) {
  return machineService.receiveSimulatorStatus(payload);
}

async function receiveConnectionStatus(payload) {
  return machineService.receiveSimulatorConnectionStatus(payload);
}

async function receiveAlert(payload) {
  return machineService.receiveSimulatorAlert(payload);
}

function receiveControlResult(payload) {
  if (!payload || typeof payload.requestId !== 'string'
      || payload.action !== 'CLEAR_FAULT'
      || !['OK', 'REJECTED'].includes(payload.status)) {
    throw new Error('Invalid CLEAR_FAULT result message.');
  }
  console.info(`[MQTT] CLEAR_FAULT ${payload.requestId} ${payload.status} (${payload.machineCode}).`);
}

module.exports = {
  enqueuePaidOrder,
  processDispenseResult,
  publishControl,
  receiveTelemetry,
  receiveConnectionStatus,
  receiveAlert,
  receiveControlResult,
  start,
  stop,
};
