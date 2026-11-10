const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(API_BASE + path, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('Không kết nối được Backend. Hãy kiểm tra Backend đang chạy ở cổng 3000.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === 'object'
      ? payload.message || payload.error || 'Yêu cầu không thành công.'
      : payload || 'Yêu cầu không thành công.';
    throw new Error(message);
  }
  return payload;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, {
    method: 'POST',
    body: JSON.stringify(body),
  }),
};

export function unwrap(payload) {
  return payload && typeof payload === 'object' && 'data' in payload
    ? payload.data
    : payload;
}
