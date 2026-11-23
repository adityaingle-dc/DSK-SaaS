const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'dsk_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

async function request(path, { method = 'GET', body, query } = {}) {
  const qs = query
    ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString()
    : '';
  const headers = { 'Content-Type': 'application/json' };
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}${qs}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) tokenStore.clear();
    const err = new Error(data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.errors = data.errors; // field-level validation errors [{ field, message }]
    err.data = data; // the whole answer (e.g. the open sheets behind a duplicate warning)
    throw err;
  }
  return data;
}

const authHeaders = () => (tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {});

// meta.gps: where/when a camera photo was taken ({ lat, lon, accuracy, takenAt })
async function uploadFile(file, meta = {}) {
  const form = new FormData();
  if (meta.gps) form.append('gps', JSON.stringify(meta.gps));
  form.append('file', file, file.name);
  const res = await fetch(`${BASE}/files`, { method: 'POST', headers: authHeaders(), body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Upload failed (${res.status})`);
  return data; // { id, name, type, size }
}

// Files need the Bearer token, so they are fetched as blobs (an <img src> can't send headers)
const blobCache = new Map();
async function fileUrl(id) {
  if (!blobCache.has(id)) {
    blobCache.set(
      id,
      fetch(`${BASE}/files/${id}`, { headers: authHeaders() }).then(async (res) => {
        if (!res.ok) throw new Error(`Could not load file (${res.status})`);
        return URL.createObjectURL(await res.blob());
      }).catch((e) => {
        blobCache.delete(id);
        throw e;
      })
    );
  }
  return blobCache.get(id);
}

export const api = {
  uploadFile,
  fileUrl,
  deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),
  login: (email, password) => request('/auth/login', { method: 'POST', body: { email, password } }),
  register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
  // email one-time codes (SendGrid)
  loginVerify: (challengeId, code) => request('/auth/login/verify', { method: 'POST', body: { challengeId, code } }),
  registerVerify: (challengeId, code) => request('/auth/register/verify', { method: 'POST', body: { challengeId, code } }),
  resendOtp: (challengeId) => request('/auth/otp/resend', { method: 'POST', body: { challengeId } }),
  forgotPassword: (email) => request('/auth/password/forgot', { method: 'POST', body: { email } }),
  resetPassword: (challengeId, code, password) => request('/auth/password/reset', { method: 'POST', body: { challengeId, code, password } }),
  me: () => request('/auth/me'),
  changePassword: (currentPassword, newPassword) => request('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),

  // superadmin – team & activity
  listUsers: (query) => request('/users', { query }),
  getUser: (id) => request(`/users/${id}`),
  createUser: (payload) => request('/users', { method: 'POST', body: payload }),
  updateUser: (id, patch) => request(`/users/${id}`, { method: 'PATCH', body: patch }),
  resetPassword: (id) => request(`/users/${id}/reset-password`, { method: 'POST' }),
  listActivity: (query) => request('/activity', { query }),
  teamReport: (query) => request('/activity/report', { query }),
  async downloadActivityCsv(query) {
    const qs = new URLSearchParams(Object.entries(query || {}).filter(([, v]) => v)).toString();
    const res = await fetch(`${BASE}/activity/export.csv${qs ? `?${qs}` : ''}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Export failed (${res.status})`);
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: `activity-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  // superadmin – reports module (generated, stored reports)
  reportTypes: () => request('/reports/types'),
  listReports: (query) => request('/reports', { query }),
  reportBoard: (query) => request('/reports/board', { query }),
  // the superadmin's decision: 'approved' or 'returned' (with a note for the drafter)
  setReportStatus: (id, status, note) => request(`/reports/${id}/status`, { method: 'PATCH', body: { status, note } }),
  getReport: (id) => request(`/reports/${id}`),
  generateReport: (valuation, type) => request('/reports', { method: 'POST', body: { valuation, type } }),
  saveStoredReportOverrides: (id, overrides) => request(`/reports/${id}/overrides`, { method: 'PUT', body: { overrides } }),
  deleteReport: (id) => request(`/reports/${id}`, { method: 'DELETE' }),

  // superadmin – customers (entry point of a valuation job)
  listCustomers: (query) => request('/customers', { query }),
  getCustomer: (id) => request(`/customers/${id}`),
  createCustomer: (payload) => request('/customers', { method: 'POST', body: payload }),
  updateCustomer: (id, patch) => request(`/customers/${id}`, { method: 'PATCH', body: patch }),
  deleteCustomer: (id) => request(`/customers/${id}`, { method: 'DELETE' }),
  // job: { evaluator, fromValuation, site, propertyType, purpose, bankName, branch, ifsc, allowDuplicate }
  startCustomerValuation: (id, job) => request(`/customers/${id}/valuations`, { method: 'POST', body: job }),
  importCustomers: () => request('/customers/import', { method: 'POST' }),
  listPocs: (q) => request('/customers/pocs', { query: q ? { q } : {} }),

  myTasks: () => request('/valuations/tasks'),
  draftingTasks: () => request('/valuations/drafting'),
  setDrafter: (id, drafter) => request(`/valuations/${id}/drafter`, { method: 'PATCH', body: { drafter } }),
  // a new drafting sheet from this sheet's site inspection, for another report
  reuseValuation: (id) => request(`/valuations/${id}/reuse`, { method: 'POST' }),
  // the field evaluator drafts their own site inspection (saves the sheet, skips the drafters' queue)
  startDrafting: (id, data) => request(`/valuations/${id}/start-drafting`, { method: 'POST', body: { data } }),
  stats: (query) => request('/valuations/stats', { query }),
  listValuations: (query) => request('/valuations', { query }),
  valuationBoard: (query) => request('/valuations/board', { query }),
  lookupIfsc: (code) => request(`/valuations/ifsc/${encodeURIComponent(code)}`),
  reverseGeocode: (lat, lon) => request(`/valuations/reverse-geocode?lat=${lat}&lon=${lon}`),
  // address → map point ({ result: { lat, lon, place } | null })
  geocode: (q) => request(`/valuations/geocode?q=${encodeURIComponent(q)}`),
  searchIfsc: (bank, q) => request(`/valuations/ifsc-search?bank=${encodeURIComponent(bank)}&q=${encodeURIComponent(q)}`),
  getValuation: (id) => request(`/valuations/${id}`),
  createValuation: (payload) => request('/valuations', { method: 'POST', body: payload }),
  updateValuation: (id, payload) => request(`/valuations/${id}`, { method: 'PUT', body: payload }),
  reviewValuation: (id, decision, note) => request(`/valuations/${id}/review`, { method: 'PATCH', body: { decision, note } }),
  deleteValuation: (id) => request(`/valuations/${id}`, { method: 'DELETE' }),
  saveReportOverrides: (id, overrides) => request(`/valuations/${id}/report`, { method: 'PUT', body: { overrides } }),
};
