const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { createSubscriptions } = require('../src/modules/iot/mqtt.adapter');

describe('MQTT device subscriptions', () => {
  it('creates string topic filters with per-topic QoS options', () => {
    assert.deepEqual(createSubscriptions('freshvend'), {
      'freshvend/+/telemetry': { qos: 1 },
      'freshvend/+/status': { qos: 1 },
      'freshvend/+/events/dispense-result': { qos: 1 },
      'freshvend/+/events/alert': { qos: 1 },
      'freshvend/+/events/control-result': { qos: 1 },
    });
  });
});
