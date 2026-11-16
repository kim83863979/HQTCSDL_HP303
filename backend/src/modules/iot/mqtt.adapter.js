const crypto = require('node:crypto');
const mqtt = require('mqtt');

const MAX_MESSAGE_BYTES = 64 * 1024;
const SUBSCRIPTION_SUFFIXES = [
  'telemetry',
  'status',
  'events/dispense-result',
  'events/alert',
  'events/control-result',
];

function createSubscriptions(prefix) {
  const topics = SUBSCRIPTION_SUFFIXES.map((suffix) => `${prefix}/+/${suffix}`);
  if (topics.some((topic) => typeof topic !== 'string' || topic.length === 0)) {
    throw new TypeError('MQTT subscription topics must be non-empty strings.');
  }
  return Object.fromEntries(topics.map((topic) => [topic, { qos: 1 }]));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function signPayload(payload, secret) {
  if (!secret) return payload;
  const unsigned = { ...payload };
  delete unsigned.signature;
  const canonical = JSON.stringify(stableValue(unsigned));
  const signature = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
  return { ...unsigned, signature };
}

function verifyPayload(payload, secret) {
  if (!secret) return true;
  if (typeof payload.signature !== 'string' || !/^[a-f0-9]{64}$/i.test(payload.signature)) return false;
  const expected = Buffer.from(signPayload(payload, secret).signature, 'hex');
  const actual = Buffer.from(payload.signature, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

class MqttAdapter {
  constructor() {
    this.prefix = (process.env.MQTT_TOPIC_PREFIX || 'freshvend').replace(/^\/+|\/+$/g, '');
    this.host = process.env.MQTT_HOST || 'localhost';
    this.port = Number(process.env.MQTT_PORT || 1883);
    this.username = process.env.MQTT_USERNAME || undefined;
    this.password = process.env.MQTT_PASSWORD || undefined;
    this.tls = process.env.MQTT_TLS === 'true';
    this.secret = process.env.IOT_DEVICE_SECRET || '';
    this.client = null;
    this.handlers = {};
    this.subscriptionInProgress = false;
    this.subscriptionGeneration = 0;

    if (!/^[\w-]+(?:\/[\w-]+)*$/.test(this.prefix)) {
      throw new Error('MQTT_TOPIC_PREFIX contains unsupported topic characters.');
    }
    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65535) {
      throw new Error('MQTT_PORT must be an integer from 1 to 65535.');
    }
    if (process.env.NODE_ENV === 'production'
        && (Buffer.byteLength(this.secret, 'utf8') < 32
          || !this.username || !this.password || !this.tls)) {
      throw new Error('Production MQTT requires IOT_DEVICE_SECRET, MQTT_USERNAME, MQTT_PASSWORD, and MQTT_TLS=true.');
    }
  }

  start(handlers) {
    if (this.client) return;
    this.handlers = handlers;
    const protocol = this.tls ? 'mqtts' : 'mqtt';
    this.client = mqtt.connect(`${protocol}://${this.host}:${this.port}`, {
      clientId: process.env.MQTT_CLIENT_ID || `freshvend-backend-${process.pid}`,
      username: this.username,
      password: this.password,
      clean: true,
      resubscribe: false,
      connectTimeout: 5000,
      reconnectPeriod: 1000,
      keepalive: 30,
      rejectUnauthorized: true,
    });

    this.client.on('connect', () => {
      this.subscriptionGeneration += 1;
      this._subscribeToDeviceTopics();
    });
    this.client.on('reconnect', () => console.warn('[MQTT] Broker unavailable; reconnecting.'));
    this.client.on('offline', () => {
      this.subscriptionGeneration += 1;
      this.subscriptionInProgress = false;
      console.warn('[MQTT] Client is offline.');
    });
    this.client.on('error', (error) => console.error('[MQTT] Client error:', error.message));
    this.client.on('message', (topic, raw) => {
      void this._handleMessage(topic, raw);
    });
  }

  isConnected() {
    return Boolean(this.client && this.client.connected);
  }

  _subscribeToDeviceTopics() {
    if (!this.isConnected() || this.subscriptionInProgress) return;

    let subscriptions;
    try {
      subscriptions = createSubscriptions(this.prefix);
    } catch (error) {
      console.error('[MQTT] Could not build device subscriptions:', error.message);
      return;
    }

    this.subscriptionInProgress = true;
    const generation = this.subscriptionGeneration;
    const client = this.client;
    try {
      client.subscribe(subscriptions, (error, granted = []) => {
        if (generation !== this.subscriptionGeneration) return;
        this.subscriptionInProgress = false;
        if (error) {
          console.error('[MQTT] Subscription failed:', error.message);
          return;
        }
        const rejected = granted.filter((entry) => entry.qos === 128);
        if (rejected.length) {
          console.error('[MQTT] Broker rejected subscriptions:', rejected.map((entry) => entry.topic).join(', '));
          return;
        }
        console.info(`[MQTT] Subscribed to ${granted.length} device topic filters at QoS 1.`);
      });
    } catch (error) {
      this.subscriptionInProgress = false;
      console.error('[MQTT] Subscription failed:', error.message);
    }
  }

  async publish(topic, payload) {
    if (!this.isConnected()) throw new Error('MQTT broker is not connected.');
    const body = signPayload(payload, this.secret);
    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(body), { qos: 1, retain: false }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async _handleMessage(topic, raw) {
    try {
      if (raw.length > MAX_MESSAGE_BYTES) throw new Error('MQTT payload exceeds the size limit.');
      const payload = JSON.parse(raw.toString('utf8'));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error('MQTT payload must be a JSON object.');
      }
      if (!verifyPayload(payload, this.secret)) throw new Error('Invalid MQTT message signature.');

      const match = topic.match(new RegExp(
        `^${this.prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/([A-Z0-9_-]+)/(.+)$`,
      ));
      if (!match) throw new Error('Unexpected MQTT topic.');
      const [, topicMachineCode, suffix] = match;
      if (payload.machineCode
          && String(payload.machineCode).toUpperCase() !== topicMachineCode) {
        throw new Error('Payload machineCode does not match the MQTT topic.');
      }

      if (suffix === 'telemetry') await this.handlers.onTelemetry(payload);
      else if (suffix === 'status') await this.handlers.onStatus(payload);
      else if (suffix === 'events/dispense-result') await this.handlers.onDispenseResult(payload);
      else if (suffix === 'events/alert') await this.handlers.onAlert(payload);
      else if (suffix === 'events/control-result') await this.handlers.onControlResult(payload);
      else throw new Error(`Unsupported MQTT topic suffix: ${suffix}`);
    } catch (error) {
      console.error(`[MQTT] Rejected message on ${topic}:`, error.message);
    }
  }

  async stop() {
    if (!this.client) return;
    const client = this.client;
    this.client = null;
    this.subscriptionGeneration += 1;
    this.subscriptionInProgress = false;
    await new Promise((resolve) => client.end(false, {}, resolve));
  }
}

module.exports = { MqttAdapter, createSubscriptions, signPayload, verifyPayload };
