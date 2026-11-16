// Shared helpers for list endpoints: search, date ranges, paging, sorting.

export const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// case-insensitive "contains" regex for a search box value, or null when empty
export const searchRx = (q) => {
  const s = String(q ?? '').trim();
  return s ? new RegExp(escapeRx(s), 'i') : null;
};

// digits typed into a search box (phone numbers are stored as plain digits); null if too short to be useful
export const searchDigits = (q, min = 3) => {
  const d = String(q ?? '').replace(/\D/g, '');
  return d.length >= min ? d : null;
};

// ?from=ISO&to=ISO → { [field]: { $gte, $lt } }  (to is exclusive, as sent by the client's period picker)
export function dateRange(query, field = 'createdAt') {
  const range = {};
  const from = query.from ? new Date(String(query.from)) : null;
  const to = query.to ? new Date(String(query.to)) : null;
  if (from && !Number.isNaN(from.getTime())) range.$gte = from;
  if (to && !Number.isNaN(to.getTime())) range.$lt = to;
  return Object.keys(range).length ? { [field]: range } : {};
}

export function paging(query, { def = 20, max = 100 } = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(max, Math.max(1, Number(query.limit) || def));
  return { page, limit, skip: (page - 1) * limit };
}

// whitelisted sort: sorts = { key: 'field' }; falls back to the first key
export function sorting(query, sorts, defDir = 'desc') {
  const key = sorts[query.sort] ? query.sort : Object.keys(sorts)[0];
  const dir = query.dir === 'asc' ? 1 : query.dir === 'desc' ? -1 : defDir === 'asc' ? 1 : -1;
  return { [sorts[key]]: dir, _id: -1 };
}

// distinct, non-empty, sorted values for a filter dropdown
export const options = (values) => [...new Set(values.filter((v) => v != null && String(v).trim()).map((v) => String(v).trim()))].sort((a, b) => a.localeCompare(b));
