import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createOperatorApi } from './operator.js';

describe('Operator API adapter', () => {
  it('maps machine inventory and active products from backend responses', async () => {
    const calls = [];
    const api = createOperatorApi(async path => {
      calls.push(path);
      if (path === '/machines') {
        return {
          data: [{
            id: 'machine-1',
            machineCode: 'VM001',
            isOnline: true,
            operationStatus: 'IDLE',
            temperature: 4.5
          }]
        };
      }
      if (path.startsWith('/inventory/machines/')) {
        return {
          data: [
            {
              slot_id: 'slot-1',
              slot_code: 'A01',
              product_id: 'product-1',
              product_name: 'Apple',
              quantity: 2,
              available_quantity: 1
            },
            {
              slot_id: 'slot-2',
              slot_code: 'A02',
              product_id: null,
              product_name: null,
              quantity: null,
              available_quantity: null
            }
          ]
        };
      }
      if (path === '/products?page=1&limit=100') {
        return {
          data: [{ productId: 'product-1', productName: 'Apple' }],
          pagination: { totalPages: 1 }
        };
      }
      throw new Error(`Unexpected request: ${path}`);
    });

    assert.deepEqual(await api.listMachines(), [{
      id: 'machine-1',
      code: 'VM001',
      online: true,
      status: 'IDLE',
      temperature: 4.5
    }]);

    const detail = await api.getMachine('machine-1');
    assert.deepEqual(detail.slots, [
      {
        id: 'slot-1',
        code: 'A01',
        productId: 'product-1',
        product: 'Apple',
        quantity: 2,
        lowStock: true
      },
      {
        id: 'slot-2',
        code: 'A02',
        productId: null,
        product: 'Chưa phân bổ',
        quantity: 0,
        lowStock: false
      }
    ]);
    assert.deepEqual(detail.products, [{ id: 'product-1', label: 'Apple' }]);
    assert.equal(calls.includes('/machines'), true);
  });

  it('uses the operator inventory endpoints and their expected payloads', async () => {
    const calls = [];
    const api = createOperatorApi(async (path, options = {}) => {
      calls.push({ path, options });
      if (path.startsWith('/admin/alerts?')) {
        return {
          data: [{
            alertType: 'LOW_STOCK',
            createdAt: '2026-11-15T00:00:00.000Z',
            message: 'Tồn kho thấp'
          }]
        };
      }
      if (path.startsWith('/inventory/restocks?')) {
        return { data: [{ restockEventId: 'event-1' }] };
      }
      return { success: true };
    });

    assert.deepEqual(await api.listAlerts('machine-1'), [{
      type: 'LOW_STOCK',
      createdAt: '2026-11-15T00:00:00.000Z',
      reason: 'Tồn kho thấp'
    }]);
    assert.deepEqual(await api.listRestocks('machine-1'), [
      { restockEventId: 'event-1' }
    ]);
    await api.restock({
      machineId: 'machine-1',
      slotId: 'slot-1',
      quantity: 3,
      note: 'Bổ sung'
    });
    await api.assignProduct({
      slotId: 'slot-2',
      productId: 'product-1'
    });

    assert.equal(calls[0].path, '/admin/alerts?machineId=machine-1&page=1&limit=20&status=OPEN');
    assert.equal(calls[1].path, '/inventory/restocks?machineId=machine-1&page=1&limit=20');
    assert.deepEqual(JSON.parse(calls[2].options.body), {
      machineId: 'machine-1',
      items: [{ slotId: 'slot-1', quantity: 3 }],
      notes: 'Bổ sung'
    });
    assert.equal(calls[3].path, '/inventory/slots/slot-2/product');
    assert.deepEqual(JSON.parse(calls[3].options.body), {
      productId: 'product-1',
      quantity: 0
    });
  });
});
