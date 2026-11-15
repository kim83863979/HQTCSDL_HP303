const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const AUTH_STORAGE_KEY = 'freshvend.admin.session';

export function readSession() {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

export function saveSession(session) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

async function fetchAllPages(path, query, token) {
  const rows = [];
  let page = 1;
  let totalPages = 1;
  do {
    const params = new URLSearchParams({ ...query, page: String(page), limit: '100' });
    const response = await apiRequest(`${path}?${params}`, { token });
    rows.push(...(response?.data || []));
    totalPages = response?.pagination?.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return rows;
}

export async function apiRequest(path, { token, ...options } = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error('Không thể kết nối máy chủ. Hãy kiểm tra backend và thử lại.');
  }

  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof body === 'object' && body
      ? body.message || body.error || 'Yêu cầu không thành công.'
      : body || 'Yêu cầu không thành công.';
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body;
}

export const authApi = {
  login: (email, password) => apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }),
  profile: (token) => apiRequest('/auth/me', { token }),
};

export const dashboardApi = {
  machines: (token) => apiRequest('/machines', { token }),
  machine: (id, token) => apiRequest(`/machines/${encodeURIComponent(id)}`, { token }),
  slots: (id, token) => apiRequest(`/machines/${encodeURIComponent(id)}/slots?includeInventory=true`, { token }),
  inventory: (id, token) => apiRequest(`/inventory/machines/${encodeURIComponent(id)}`, { token }),
  activeProducts: async () => {
    const products = await fetchAllPages('/products', {}, undefined);
    return products.map((product) => ({
      ...product,
      id: product.productId,
      name: product.productName,
      category: { id: product.categoryId, name: product.categoryName },
    }));
  },
  products: async (token) => {
    const products = await fetchAllPages('/admin/products', { status: 'ALL' }, token);
    return products.map((product) => ({
      ...product,
      id: product.productId,
      name: product.productName,
      category: { id: product.categoryId, name: product.categoryName },
    }));
  },
  categories: async (token) => {
    const response = await apiRequest('/admin/categories', { token });
    return (response?.data || []).map((category) => ({
      ...category,
      id: category.categoryId,
      name: category.categoryName,
    }));
  },
  createProduct: (payload, token) => apiRequest('/admin/products', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  }),
  updateProduct: (id, payload, token) => apiRequest(`/admin/products/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  }),
  createCategory: (payload, token) => apiRequest('/admin/categories', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  }),
  updateCategory: (id, payload, token) => apiRequest(`/admin/categories/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  }),
  deleteCategory: (id, token) => apiRequest(`/admin/categories/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    token,
  }),
  assignProduct: (slotId, payload, token) => apiRequest(`/inventory/slots/${encodeURIComponent(slotId)}/product`, {
    method: 'PUT',
    token,
    body: JSON.stringify(payload),
  }),
  restock: (payload, token) => apiRequest('/inventory/restocks', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  }),
  restocks: (query, token) => apiRequest(`/inventory/restocks?${new URLSearchParams(query)}`, { token }),
  restockDetail: (id, token) => apiRequest(`/inventory/restocks/${encodeURIComponent(id)}`, { token }),
  alerts: (query, token) => apiRequest(`/admin/alerts?${new URLSearchParams(query)}`, { token }),
  activeAlerts: async (token) => {
    const [open, acknowledged] = await Promise.all([
      apiRequest('/admin/alerts?page=1&limit=100&status=OPEN', { token }),
      apiRequest('/admin/alerts?page=1&limit=100&status=ACKNOWLEDGED', { token }),
    ]);
    return { data: [...(open.data || []), ...(acknowledged.data || [])] };
  },
  createAlert: (payload, token) => apiRequest('/admin/alerts', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  }),
  updateAlertStatus: (id, status, token) => apiRequest(`/admin/alerts/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ status }),
  }),
  reportSummary: (query, token) => apiRequest(`/admin/reports/summary?${new URLSearchParams(query)}`, { token }),
  salesReport: (query, token) => apiRequest(`/admin/reports/sales?${new URLSearchParams(query)}`, { token }),
  orders: (query, token) => apiRequest(`/admin/orders?${new URLSearchParams(query)}`, { token }),
  order: (id, token) => apiRequest(`/admin/orders/${encodeURIComponent(id)}`, { token }),
  payments: (query, token) => apiRequest(`/admin/payments?${new URLSearchParams(query)}`, { token }),
  users: (token) => apiRequest('/admin/users', { token }),
  createUser: (payload, token) => apiRequest('/admin/users', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  }),
  changeRole: (id, role, token) => apiRequest(`/admin/users/${encodeURIComponent(id)}/role`, {
    method: 'PATCH',
    token,
    body: JSON.stringify({ role }),
  }),
};

export function exportCsv(filename, rows) {
  if (!rows.length) throw new Error('Không có dữ liệu để xuất.');
  const escapeCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatDate(value) {
  if (!value) return 'Chưa có dữ liệu';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Chưa có dữ liệu'
    : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function formatMoney(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value) || 0);
}
