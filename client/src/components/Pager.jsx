const PAGE_SIZES = [20, 50, 100];

// compact page list: 1 … 4 5 6 … 16
function pageList(page, pages) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}

// Footer for paged lists: rows per page + page numbers. data = { total, page, pages }
export default function Pager({ data, limit, onChange }) {
  if (!data || !data.total) return null;
  return (
    <div className="pager">
      <label className="page-size">
        Rows
        <select value={limit} onChange={(e) => onChange({ limit: e.target.value })}>
          {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      {data.pages > 1 && (
        <nav className="pages" aria-label="Pages">
          <button type="button" className="btn" disabled={data.page <= 1} onClick={() => onChange({ page: String(data.page - 1) })} aria-label="Previous page">‹</button>
          {pageList(data.page, data.pages).map((p, i) => (p === '…'
            ? <span key={`gap${i}`} className="page-gap">…</span>
            : <button key={p} type="button" className={`btn page-num${p === data.page ? ' on' : ''}`} aria-current={p === data.page ? 'page' : undefined} onClick={() => onChange({ page: String(p) })}>{p}</button>
          ))}
          <button type="button" className="btn" disabled={data.page >= data.pages} onClick={() => onChange({ page: String(data.page + 1) })} aria-label="Next page">›</button>
        </nav>
      )}
    </div>
  );
}

// "Showing 1–20 of 134 · Clear filters"
export function ResultCount({ data, limit, filtered, onClear, noun = 'results' }) {
  if (!data) return null;
  const from = data.total ? (data.page - 1) * Number(limit) + 1 : 0;
  const to = Math.min(data.total, data.page * Number(limit));
  return (
    <span className="result-count" aria-live="polite">
      <span>{data.total ? <>Showing <b>{from}–{to}</b> of <b>{data.total.toLocaleString('en-IN')}</b>{noun ? ` ${noun}` : ''}</> : 'No results'}</span>
      {filtered && <button type="button" className="linklike" onClick={onClear}>Clear filters</button>}
    </span>
  );
}
