import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { REPORT_TEMPLATES } from '@dsk/shared';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { initials } from '../components/Layout.jsx';
import TableSkeleton from '../components/TableSkeleton.jsx';
import { IconChevron, IconSearch } from '../components/Icons.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Segmented from '../components/Segmented.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import { periodRange, rangeParams } from '../utils/period.js';
import { DuoList } from '../components/DuoIcons.jsx';
import { dateTime, timeAgo } from '../utils/format.js';

const STATUS_TABS = [
  ['', 'All'],
  ['draft', 'Drafts'],
  ['submitted', 'In review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
];
const PAGE_SIZES = [20, 50, 100];
// sort options (column headers on desktop, a select on phones); first click on a column uses its natural direction
const SORTS = {
  updated: { label: 'Recently updated', first: 'desc' },
  applicant: { label: 'Applicant (A–Z)', first: 'asc' },
  value: { label: 'Highest value', first: 'desc' },
};
const DEFAULTS = { sort: 'updated', dir: 'desc', limit: '20', page: '1', period: 'all' };

const fmv = (v) => (v.summary?.fairMarketValue > 0 ? inr(v.summary.fairMarketValue) : '—');

// compact page list: 1 … 4 5 6 … 16
function pageList(page, pages) {
  const out = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 1) out.push(p);
    else if (out[out.length - 1] !== '…') out.push('…');
  }
  return out;
}

// sortable column header (keyboard-accessible button, aria-sort for screen readers)
function SortTh({ k, query, onSort, children, className = '' }) {
  const active = query.sort === k;
  return (
    <th className={className} aria-sort={active ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`th-sort${active ? ' on' : ''}`} onClick={() => onSort(k)}>
        {children}
        <span className="sort-arrow" aria-hidden="true">{active ? (query.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  );
}

export default function ValuationList() {
  const { isReviewer } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get('q') || '');
  const [error, setError] = useState('');

  const query = {
    q: params.get('q') || '',
    status: params.get('status') || '',
    template: params.get('template') || '',
    evaluator: params.get('evaluator') || '',
    sort: params.get('sort') || DEFAULTS.sort,
    dir: params.get('dir') || DEFAULTS.dir,
    limit: params.get('limit') || DEFAULTS.limit,
    page: params.get('page') || DEFAULTS.page,
    period: params.get('period') || DEFAULTS.period,
    start: params.get('start') || '',
    end: params.get('end') || '',
  };
  const filtered = Boolean(query.q || query.status || query.template || query.evaluator || query.period !== 'all');

  useEffect(() => {
    setLoading(true);
    const { period, start, end, ...rest } = query;
    api.listValuations({ ...rest, ...rangeParams(periodRange(period, { start, end })) })
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // keep only non-default values in the URL so links stay short and shareable
  const update = (patch) => {
    const next = { ...query, page: DEFAULTS.page, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && String(v) !== DEFAULTS[k])));
  };

  // search as you type (short pause), without waiting for Enter
  useEffect(() => {
    if (q === query.q) return undefined;
    const t = setTimeout(() => update({ q: q.trim() }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const sortBy = (key) => {
    const dir = query.sort === key ? (query.dir === 'asc' ? 'desc' : 'asc') : SORTS[key].first;
    update({ sort: key, dir });
  };
  const clearAll = () => { setQ(''); setParams({}); };
  const from = data && data.total ? (data.page - 1) * Number(query.limit) + 1 : 0;
  const to = data ? Math.min(data.total, data.page * Number(query.limit)) : 0;
  const cols = isReviewer ? 9 : 8;

  return (
    <div className="page">
      <PageHeader
        icon={DuoList}
        title="Valuations"
      />

      {query.evaluator && (
        <div className="filter-pill">
          Showing one evaluator's valuations
          <button type="button" className="linklike" onClick={() => update({ evaluator: '' })}>Show all</button>
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      <div className={`card flush list-card${loading && data ? ' is-loading' : ''}`}>
        <div className="card-toolbar">
          <div className="toolbar">
            <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}>
              <IconSearch size={17} />
              <input type="search" aria-label="Search valuations" placeholder="Search applicant, phone, reference, branch…" value={q} onChange={(e) => setQ(e.target.value)} />
              {q && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { setQ(''); update({ q: '' }); }}>✕</button>}
            </form>
            <PeriodPicker value={query} onChange={(p) => update({ period: p.period, start: p.start, end: p.end })} />
            <select className="select-pill" aria-label="Report type" value={query.template} onChange={(e) => update({ template: e.target.value })}>
              <option value="">All report types</option>
              {Object.entries(REPORT_TEMPLATES).map(([k, t]) => <option key={k} value={k}>{k} – {t.title}</option>)}
            </select>
            <select className="select-pill mobile-sort" aria-label="Sort by" value={`${query.sort}:${query.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); update({ sort, dir }); }}>
              <option value="updated:desc">Recently updated</option>
              <option value="updated:asc">Oldest first</option>
              <option value="applicant:asc">Applicant (A–Z)</option>
              <option value="applicant:desc">Applicant (Z–A)</option>
              <option value="value:desc">Highest value</option>
              <option value="value:asc">Lowest value</option>
            </select>
          </div>
          <div className="toolbar-row">
            <Segmented
              label="Status"
              options={STATUS_TABS.map(([value, label]) => ({ value, label }))}
              value={query.status}
              onChange={(status) => update({ status })}
            />
            {data && (
              <span className="result-count" aria-live="polite">
                <span>{data.total ? <>Showing <b>{from}–{to}</b> of <b>{data.total.toLocaleString('en-IN')}</b></> : 'No results'}</span>
                {filtered && <button type="button" className="linklike" onClick={clearAll}>Clear filters</button>}
              </span>
            )}
          </div>
        </div>

        {data && data.items.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><IconSearch size={22} /></div>
            {filtered ? (
              <>
                <strong>No valuations match these filters</strong>
                <p className="muted">Try a different search, status, period or report type.</p>
                <button type="button" className="btn" onClick={clearAll}>Clear filters</button>
              </>
            ) : (
              <>
                <strong>No valuations yet</strong>
                <p className="muted">Use <strong>New valuation</strong> to start the first input sheet.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {/* desktop / tablet table */}
            <div className="table-wrap desktop-only">
              <table className="table list-table">
                <thead>
                  <tr>
                    <SortTh k="applicant" query={query} onSort={sortBy}>Applicant</SortTh>
                    <th>Bank / branch</th>
                    <th className="col-opt">Property</th>
                    <th>Report</th>
                    <SortTh k="value" query={query} onSort={sortBy} className="num">Fair market value</SortTh>
                    <th>Status</th>
                    {isReviewer && <th className="col-opt">Evaluator</th>}
                    <SortTh k="updated" query={query} onSort={sortBy} className="col-opt">Updated</SortTh>
                    <th className="col-go"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!data && <TableSkeleton cols={cols} />}
                  {(data?.items || []).map((v) => (
                    <tr key={v._id} className="clickable" onClick={() => navigate(`/valuations/${v._id}`)}>
                      <td>
                        <div className="cell-person">
                          <span className="avatar soft sm">{initials(v.summary?.applicantName)}</span>
                          <span>
                            <Link to={`/valuations/${v._id}`} onClick={(e) => e.stopPropagation()}><strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong></Link>
                            <small className="muted block ref">{v.referenceNo}</small>
                          </span>
                        </div>
                      </td>
                      <td>{v.summary?.bankName || '—'}<small className="muted block">{v.summary?.branch}</small></td>
                      <td className="col-opt">{v.summary?.propertyType || '—'}<small className="muted block">{v.summary?.loanCategory}</small></td>
                      <td><span className="badge" title={REPORT_TEMPLATES[v.summary?.reportTemplate]?.title}>{v.summary?.reportTemplate || '—'}</span></td>
                      <td className="num"><strong>{fmv(v)}</strong></td>
                      <td><StatusBadge status={v.status} /></td>
                      {isReviewer && <td className="col-opt">{v.evaluator?.name || '—'}</td>}
                      <td className="muted nowrap col-opt" title={dateTime(v.updatedAt)}>{timeAgo(v.updatedAt)}</td>
                      <td className="col-go" aria-hidden="true"><IconChevron size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* phones */}
            <ul className="list mobile-only">
              {(data?.items || []).map((v) => (
                <li key={v._id}>
                  <Link to={`/valuations/${v._id}`} className="list-item">
                    <span className="avatar soft">{initials(v.summary?.applicantName)}</span>
                    <span className="list-main">
                      <strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong>
                      <small>{v.referenceNo} · {v.summary?.reportTemplate} · {timeAgo(v.updatedAt)}</small>
                    </span>
                    <span className="list-end">
                      <strong className="amount">{fmv(v)}</strong>
                      <StatusBadge status={v.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            {data && data.total > 0 && (
              <div className="pager">
                <label className="page-size">
                  Rows
                  <select value={query.limit} onChange={(e) => update({ limit: e.target.value })}>
                    {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
                {data.pages > 1 && (
                  <nav className="pages" aria-label="Pages">
                    <button type="button" className="btn" disabled={data.page <= 1} onClick={() => update({ page: String(data.page - 1) })} aria-label="Previous page">‹</button>
                    {pageList(data.page, data.pages).map((p, i) => (p === '…'
                      ? <span key={`gap${i}`} className="page-gap">…</span>
                      : <button key={p} type="button" className={`btn page-num${p === data.page ? ' on' : ''}`} aria-current={p === data.page ? 'page' : undefined} onClick={() => update({ page: String(p) })}>{p}</button>
                    ))}
                    <button type="button" className="btn" disabled={data.page >= data.pages} onClick={() => update({ page: String(data.page + 1) })} aria-label="Next page">›</button>
                  </nav>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
