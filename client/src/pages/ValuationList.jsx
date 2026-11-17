import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import SearchBox from '../components/SearchBox.jsx';
import MoreFilters from '../components/MoreFilters.jsx';
import Pager, { ResultCount } from '../components/Pager.jsx';
import useListParams from '../utils/useListParams.js';
import { DuoList } from '../components/DuoIcons.jsx';
import { NewValuationFlow } from '../components/CustomerDialogs.jsx';
import Fab from '../components/Fab.jsx';
import { IconPlus } from '../components/Icons.jsx';
import { dateTime, timeAgo } from '../utils/format.js';

const STATUS_TABS = [
  ['', 'All'],
  ['draft', 'Drafts'],
  ['submitted', 'In review'],
  ['approved', 'Approved'],
  ['rejected', 'Rejected'],
];
// sort options (column headers on desktop, a select on phones); first click on a column uses its natural direction
const SORTS = {
  updated: { label: 'Recently updated', first: 'desc' },
  applicant: { label: 'Applicant (A–Z)', first: 'asc' },
  value: { label: 'Highest value', first: 'desc' },
};
const DEFAULTS = { q: '', status: '', template: '', evaluator: '', bank: '', sort: 'updated', dir: 'desc', limit: '20', page: '1', period: 'all', start: '', end: '' };

const fmv = (v) => (v.summary?.fairMarketValue > 0 ? inr(v.summary.fairMarketValue) : '—');

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
  const { isReviewer, isSuperadmin } = useAuth();
  const navigate = useNavigate();
  const { params, query, update, filtered, clear, apiQuery } = useListParams(DEFAULTS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    setLoading(true);
    api.listValuations(apiQuery())
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, reload]);

  const sortBy = (key) => {
    const dir = query.sort === key ? (query.dir === 'asc' ? 'desc' : 'asc') : SORTS[key].first;
    update({ sort: key, dir });
  };
  const clearAll = clear;
  const facets = data?.facets || {};
  const cols = isReviewer ? 9 : 8;

  return (
    <div className="page">
      <PageHeader
        icon={DuoList}
        title="Input Sheets"
        actions={(
          <div className="lp-head">
            <SearchBox value={query.q} onSearch={(q) => update({ q }, { replace: true })} label="Search input sheets" placeholder="Search applicant, phone, reference, bank, village…" />
            {isSuperadmin && <button className="btn primary desktop-only" onClick={() => setCreating(true)}><IconPlus size={16} /> New input sheet</button>}
          </div>
        )}
      />
      {isSuperadmin && <Fab label="New input sheet" onClick={() => setCreating(true)} />}
      {notice && (
        <div className="alert success">
          {notice.text} <Link to={`/valuations/${notice.id}`}>Open the sheet</Link>
        </div>
      )}
      {creating && (
        <NewValuationFlow
          onClose={() => setCreating(false)}
          onAssigned={(r) => {
            setCreating(false);
            setNotice({ id: r._id, text: `Input sheet ${r.referenceNo} created and assigned to ${r.evaluator?.name || 'the evaluator'}.` });
            setReload((n) => n + 1);
          }}
        />
      )}

      {query.evaluator && !isReviewer && (
        <div className="filter-pill">
          Showing one evaluator's input sheets
          <button type="button" className="linklike" onClick={() => update({ evaluator: '' })}>Show all</button>
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      <div className={`card flush list-card lp-card${loading && data ? ' is-loading' : ''}`}>
        <div className="card-toolbar">
          <div className="toolbar lp-toolbar">
            <Segmented
              label="Status"
              className="lp-status"
              options={STATUS_TABS.map(([value, label]) => ({ value, label }))}
              value={query.status}
              onChange={(status) => update({ status }, { replace: true })}
            />
            <MoreFilters active={[query.period !== 'all', query.template, query.bank, query.evaluator].filter(Boolean).length}>
              <PeriodPicker value={query} onChange={(p) => update({ period: p.period, start: p.start, end: p.end })} />
              <select className="select-pill" aria-label="Report type" value={query.template} onChange={(e) => update({ template: e.target.value })}>
                <option value="">All report types</option>
                {Object.entries(REPORT_TEMPLATES).map(([k, t]) => <option key={k} value={k}>{k} – {t.title}</option>)}
              </select>
              {(facets.banks?.length > 1 || query.bank) && (
                <select className="select-pill" aria-label="Bank" value={query.bank} onChange={(e) => update({ bank: e.target.value })}>
                  <option value="">All banks</option>
                  {(facets.banks || []).map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              {isReviewer && (facets.evaluators?.length > 1 || query.evaluator) && (
                <select className="select-pill" aria-label="Evaluator" value={query.evaluator} onChange={(e) => update({ evaluator: e.target.value })}>
                  <option value="">All evaluators</option>
                  {(facets.evaluators || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>
              )}
            </MoreFilters>
            <select className="select-pill mobile-sort" aria-label="Sort by" value={`${query.sort}:${query.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); update({ sort, dir }); }}>
              <option value="updated:desc">Recently updated</option>
              <option value="updated:asc">Oldest first</option>
              <option value="applicant:asc">Applicant (A–Z)</option>
              <option value="applicant:desc">Applicant (Z–A)</option>
              <option value="value:desc">Highest value</option>
              <option value="value:asc">Lowest value</option>
            </select>
          </div>
        </div>

        {data && data.items.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><IconSearch size={22} /></div>
            {filtered ? (
              <>
                <strong>No input sheets match these filters</strong>
                <p className="muted">Try a different search, status, period, bank or report type.</p>
                <button type="button" className="btn" onClick={clearAll}>Clear filters</button>
              </>
            ) : (
              <>
                <strong>No input sheets yet</strong>
                <p className="muted">{isSuperadmin ? <>Use <strong>New input sheet</strong> to pick a customer and assign the job to an evaluator.</> : 'Input sheets assigned to you by the superadmin appear here.'}</p>
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
                    <th className="col-opt2">Bank / branch</th>
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
                      <td className="col-opt2">{v.summary?.bankName || '—'}<small className="muted block">{v.summary?.branch}</small></td>
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

            <Pager className="lp-pager" data={data} limit={query.limit} onChange={update} summary={<ResultCount data={data} limit={query.limit} filtered={filtered} onClear={clearAll} noun="" />} />
          </>
        )}
      </div>
    </div>
  );
}
