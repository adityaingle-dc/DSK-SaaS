// Period presets for filtering by the date a valuation was created.
// Ranges are computed in the browser's local time: `from` is inclusive, `to` is exclusive.

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
// Indian financial year starts on 1 April
const fyStart = (d) => new Date(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1, 3, 1);
const fyLabel = (start) => `FY ${start.getFullYear()}–${String(start.getFullYear() + 1).slice(2)}`;

export const PERIODS = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today', compare: 'yesterday' },
  { key: 'week', label: 'This week', compare: 'last week' },
  { key: 'month', label: 'This month', compare: 'last month' },
  { key: 'lastMonth', label: 'Last month', compare: 'the month before' },
  { key: 'quarter', label: 'This quarter', compare: 'last quarter' },
  { key: 'fy', label: 'This financial year', compare: 'last financial year' },
  { key: 'custom', label: 'Custom range', compare: 'the previous period' },
];

// returns { from, to, prevFrom, prevTo } as Date objects, or null for "all time"
export function periodRange(key, { start, end } = {}, now = new Date()) {
  const today = startOfDay(now);
  switch (key) {
    case 'today':
      return { from: today, to: addDays(today, 1), prevFrom: addDays(today, -1), prevTo: today };
    case 'week': {
      const monday = addDays(today, -((today.getDay() + 6) % 7));
      return { from: monday, to: addDays(monday, 7), prevFrom: addDays(monday, -7), prevTo: monday };
    }
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: first, to: addMonths(first, 1), prevFrom: addMonths(first, -1), prevTo: first };
    }
    case 'lastMonth': {
      const first = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), -1);
      return { from: first, to: addMonths(first, 1), prevFrom: addMonths(first, -1), prevTo: first };
    }
    case 'quarter': {
      const first = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
      return { from: first, to: addMonths(first, 3), prevFrom: addMonths(first, -3), prevTo: first };
    }
    case 'fy': {
      const first = fyStart(today);
      return { from: first, to: addMonths(first, 12), prevFrom: addMonths(first, -12), prevTo: first };
    }
    case 'custom': {
      if (!start && !end) return null;
      const from = start ? startOfDay(new Date(`${start}T00:00`)) : null;
      const to = end ? addDays(startOfDay(new Date(`${end}T00:00`)), 1) : null; // end date is inclusive
      if (from && to && to > from) {
        const days = Math.round((to - from) / 86400000);
        return { from, to, prevFrom: addDays(from, -days), prevTo: from };
      }
      return { from, to, prevFrom: null, prevTo: null };
    }
    default:
      return null;
  }
}

// API query params for a range
export const rangeParams = (r) => (r ? { from: r.from?.toISOString(), to: r.to?.toISOString() } : {});
export const prevParams = (r) => (r?.prevFrom ? { from: r.prevFrom.toISOString(), to: r.prevTo.toISOString() } : null);

const fmt = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// button label, e.g. "This month" or "1 Nov – 15 Nov 2026"
export function periodLabel(key, custom, now = new Date()) {
  if (key === 'custom') {
    const r = periodRange('custom', custom, now);
    if (!r) return 'Custom range';
    if (r.from && r.to) return `${fmt(r.from)} – ${fmt(addDays(r.to, -1))}`;
    return r.from ? `From ${fmt(r.from)}` : `Until ${fmt(addDays(r.to, -1))}`;
  }
  if (key === 'fy') return fyLabel(fyStart(startOfDay(now)));
  return PERIODS.find((p) => p.key === key)?.label || 'All time';
}

// small helper text under a preset, e.g. "1 Apr 2026 – 31 Mar 2027"
export function periodHint(key, now = new Date()) {
  const r = periodRange(key, {}, now);
  if (!r) return '';
  const last = addDays(r.to, -1);
  return +r.from === +last ? fmt(r.from) : `${fmt(r.from)} – ${fmt(last)}`;
}

export const compareLabel = (key) => PERIODS.find((p) => p.key === key)?.compare || '';
