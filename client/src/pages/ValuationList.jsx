import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { REPORT_TEMPLATES } from '@dsk/shared';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { initials } from '../components/Layout.jsx';
import { IconPlus, IconSearch } from '../components/Icons.jsx';

const STATUS_TABS = [
  ['', 'All'],
  ['draft', 'Drafts'],
  ['submitted', 'In review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
];

export default function ValuationList() {
  const { isReviewer } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [q, setQ] = useState(params.get('q') || '');
  const [error, setError] = useState('');

  const query = { q: params.get('q') || '', status: params.get('status') || '', template: params.get('template') || '', evaluator: params.get('evaluator') || '', page: params.get('page') || 1 };

  useEffect(() => {
    api.listValuations(query).then(setData).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = (patch) => {
    const next = { ...query, page: 1, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v && v !== 1)));
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Valuations</h1>
          <p className="muted">{data ? `${data.total} ${data.total === 1 ? 'record' : 'records'}` : 'Loading…'}</p>
        </div>
        <Link className="btn primary desktop-only" to="/valuations/new"><IconPlus size={18} /> New valuation</Link>
      </div>

      <div className="toolbar">
        <form className="search" onSubmit={(e) => { e.preventDefault(); update({ q }); }}>
          <IconSearch size={18} />
          <input placeholder="Search applicant, phone, reference, branch…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={() => q !== query.q && update({ q })} />
        </form>
        <select className="select-pill" value={query.template} onChange={(e) => update({ template: e.target.value })}>
          <option value="">All report types</option>
          {Object.entries(REPORT_TEMPLATES).map(([k, t]) => <option key={k} value={k}>{k} – {t.title}</option>)}
        </select>
      </div>

      <div className="segmented" role="tablist">
        {STATUS_TABS.map(([value, label]) => (
          <button key={label} role="tab" aria-selected={query.status === value} className={query.status === value ? 'on' : ''} onClick={() => update({ status: value })}>
            {label}
          </button>
        ))}
      </div>

      {query.evaluator && (
        <div className="filter-pill">
          Showing one evaluator's valuations
          <button type="button" className="linklike" onClick={() => update({ evaluator: '' })}>Show all</button>
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      {data && data.items.length === 0 ? (
        <div className="card empty">
          <strong>No valuations found</strong>
          <p className="muted">Try a different search or filter.</p>
        </div>
      ) : (
        <div className="card flush">
          {/* Desktop table */}
          <div className="table-wrap desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Applicant</th><th>Bank / branch</th><th>Property</th><th>Report</th>
                  <th className="num">Fair market value</th><th>Status</th>{isReviewer && <th>Evaluator</th>}<th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {(data?.items || []).map((v) => (
                  <tr key={v._id} className="clickable" onClick={() => navigate(`/valuations/${v._id}`)}>
                    <td>
                      <div className="cell-person">
                        <span className="avatar soft sm">{initials(v.summary?.applicantName)}</span>
                        <span>
                          <Link to={`/valuations/${v._id}`} onClick={(e) => e.stopPropagation()}><strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong></Link>
                          <small className="muted block">{v.referenceNo}</small>
                        </span>
                      </div>
                    </td>
                    <td>{v.summary?.bankName || '—'}<small className="muted block">{v.summary?.branch}</small></td>
                    <td>{v.summary?.propertyType || '—'}<small className="muted block">{v.summary?.loanCategory}</small></td>
                    <td><span className="badge">{v.summary?.reportTemplate}</span></td>
                    <td className="num"><strong>{inr(v.summary?.fairMarketValue)}</strong></td>
                    <td><StatusBadge status={v.status} /></td>
                    {isReviewer && <td>{v.evaluator?.name}</td>}
                    <td className="muted">{new Date(v.updatedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile list */}
          <ul className="list mobile-only">
            {(data?.items || []).map((v) => (
              <li key={v._id}>
                <Link to={`/valuations/${v._id}`} className="list-item">
                  <span className="avatar soft">{initials(v.summary?.applicantName)}</span>
                  <span className="list-main">
                    <strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong>
                    <small>{v.summary?.branch || v.referenceNo} · {v.summary?.reportTemplate}</small>
                  </span>
                  <span className="list-end">
                    <strong className="amount">{inr(v.summary?.fairMarketValue)}</strong>
                    <StatusBadge status={v.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>

          {data?.pages > 1 && (
            <div className="pager">
              <button className="btn ghost" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })}>‹ Prev</button>
              <span className="muted">Page {data.page} of {data.pages}</span>
              <button className="btn ghost" disabled={data.page >= data.pages} onClick={() => update({ page: data.page + 1 })}>Next ›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
