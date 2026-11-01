import { badRequest } from './errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value, name) {
  if (typeof value !== 'string' || !UUID_RE.test(value)) {
    throw badRequest(`Gia tri '${value}' khong hop le cho tham so '${name}'`);
  }
  return value;
}

export function parseIntInRange(value, name, { min, max, fallback }) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw badRequest(`Tham so '${name}' phai la so nguyen tu ${min} den ${max}`);
  }
  return n;
}
