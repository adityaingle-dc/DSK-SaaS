import { useSearchParams } from 'react-router-dom';
import { periodRange, rangeParams } from './period.js';

// List state (search, filters, sort, page) kept in the URL so it survives Back/refresh and can be shared.
// defaults: { key: defaultValue } — every key the page uses; only non-default values are written to the URL.
export default function useListParams(defaults) {
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries(Object.entries(defaults).map(([k, d]) => [k, params.get(k) ?? String(d)]));

  // any change resets to page 1 unless the patch sets a page; typing / tab switches replace the history entry
  const update = (patch, { replace = false } = {}) => {
    const next = { ...query, page: String(defaults.page ?? '1'), ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v !== '' && v != null && String(v) !== String(defaults[k] ?? ''))), { replace });
  };

  // keys that are part of "the filters" (not sort / page / page size / view)
  const NON_FILTER = ['sort', 'dir', 'page', 'limit', 'view', 'tab'];
  const filtered = Object.keys(defaults).some((k) => !NON_FILTER.includes(k) && query[k] !== String(defaults[k]));
  const clear = () => {
    const keep = Object.fromEntries(Object.entries(query).filter(([k, v]) => ['view', 'tab'].includes(k) && v !== String(defaults[k])));
    setParams(keep, { replace: true });
  };

  // { from, to } for the API from period / start / end
  const range = () => rangeParams(periodRange(query.period || 'all', { start: query.start, end: query.end }));

  // the query to send to the API: no period keys, range expanded, empty values dropped
  const apiQuery = (omit = []) => {
    const { period, start, end, ...rest } = query;
    return Object.fromEntries(Object.entries({ ...rest, ...(period ? range() : {}) }).filter(([k, v]) => v !== '' && v != null && !omit.includes(k)));
  };

  return { params, query, update, filtered, clear, apiQuery };
}
