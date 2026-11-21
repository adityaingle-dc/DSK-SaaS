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
import SheetBoard from '../components/SheetBoard.jsx';
import ViewSwitch, { rememberView, storedView } from '../components/ViewSwitch.jsx';
import { sheetLink } from '../utils/sheetLink.js';

// status tabs follow the workflow (customer → site visit → drafting → approval), per role
const TABS = {
  // four tabs: all · site visit (incl. sent back to the evaluator) · drafting (in the queue, being drafted, sent back to
  // the drafter, report awaiting approval) · approved. Each row's badge says the exact status.
  office: [['', 'All'], ['draft,rejected', 'Site visit'], ['submitted,received,returned,pending', 'Drafting'], ['approved', 'Approved']],
  // the evaluator: to do (incl. sent back to them) → with the drafter (queue, drafting, approval) → approved
  evaluator: [['', 'All'], ['draft,rejected', 'To do'], ['submitted,received,pending,returned', 'With drafter'], ['approved', 'Approved']],
};
// statuses reached by a link (dashboard tiles) that are not a tab of their own
const OTHER_STATUS = { draft: 'Site visit in progress', rejected: 'Sent back to the evaluator', submitted: 'In the drafters\' queue', 'submitted,received,returned': 'With the drafters', 'received,returned': 'Being drafted', received: 'Being drafted', returned: 'Sent back to the drafter', pending: 'Reports awaiting approval' };
// sort options (column headers on desktop, a select on phones); first click on a column uses its natural direction
const SORTS = {
  updated: { label: 'Recently updated', first: 'desc' },
  applicant: { label: 'Applicant (A–Z)', first: 'asc' },
  value: { label: 'Highest value', first: 'desc' },
};
const DEFAULTS = { q: '', status: '', drafter: '', template: '', evaluator: '', bank: '', sort: 'updated', dir: 'desc', limit: '20', page: '1', period: 'all', start: '', end: '', view: '' };
const VIEW_KEY = 'dsk.sheets.view';

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

// Site Inspections: every job's sheet. Evaluators see theirs; drafters every sheet handed in (the shared queue);
// the superadmin all of them.
export default function ValuationList() {
  const auth = useAuth();
  const { isReviewer, isSuperadmin, isOffice } = auth;
  const tabs = isOffice ? TABS.office : TABS.evaluator;
  // with the drafters: the drafting screen; with the evaluator: their sheet; otherwise the sheet's page
  const sheetUrl = (v) => sheetLink(v, auth);
  const navigate = useNavigate();
  const { params, query, update, filtered, clear, apiQuery } = useListParams(DEFAULTS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [reload, setReload] = useState(0);
  const view = query.view === 'board' || query.view === 'list' ? query.view : storedView(VIEW_KEY) === 'board' ? 'board' : 'list';
  const setView = (v) => {
    rememberView(VIEW_KEY, v);
    update({ view: v, page: '1' }, { replace: true });
  };

  useEffect(() => {
    // the board loads its own cards; this request still supplies the filter options (banks, evaluators)
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
  const cols = isOffice ? 10 : 8;

  return (
    <div className="page">
      <PageHeader
        icon={DuoList}
        title="Site Inspections"
        actions={(
          <div className="lp-head">
            {isReviewer && <ViewSwitch view={view} onChange={setView} />}
            <SearchBox value={query.q} onSearch={(q) => update({ q }, { replace: true })} label="Search site inspections" placeholder="Search applicant, phone, reference, bank, village…" />
            {isSuperadmin && <button className="btn primary desktop-only" onClick={() => setCreating(true)}><IconPlus size={16} /> New inspection</button>}
          </div>
        )}
      />
      {isSuperadmin && <Fab label="New inspection" onClick={() => setCreating(true)} />}
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
            setNotice({ id: r._id, text: `Site inspection ${r.referenceNo} created for ${r.evaluator?.name || 'the evaluator'}.` });
            setReload((n) => n + 1);
          }}
        />
      )}

      {OTHER_STATUS[query.status] && (
        <div className="filter-pill">
          Showing: {OTHER_STATUS[query.status]}
          <button type="button" className="linklike" onClick={() => update({ status: '' }, { replace: true })}>Show all</button>
        </div>
      )}
      {query.drafter === 'me' && (
        <div className="filter-pill">
          Showing the sheets you are drafting
          <button type="button" className="linklike" onClick={() => update({ drafter: '' }, { replace: true })}>Show all</button>
        </div>
      )}
      {query.evaluator && !isReviewer && (
        <div className="filter-pill">
          Showing one evaluator's input sheets
          <button type="button" className="linklike" onClick={() => update({ evaluator: '' })}>Show all</button>
        </div>
      )}

      {error && <div className="alert">{error}</div>}

      <div className={`card flush list-card lp-card${loading && data ? ' is-loading' : ''}${view === 'board' ? ' kb-card-wrap' : ''}`}>
        <div className="card-toolbar">
          <div className="toolbar lp-toolbar">
            {view === 'board' && <span className="kb-toolbar-note">Where each job stands, from the site visit to the approved report.</span>}
            {view === 'list' && (
              <Segmented label="Status" className="lp-status" options={tabs.map(([value, label]) => ({ value, label }))} value={tabs.some(([v]) => v === query.status) ? query.status : ''} onChange={(status) => update({ status }, { replace: true })} />
            )}
            {/* filters + sort: one group, kept on the slider's line on computers */}
            <div className="lp-filters">
              <MoreFilters active={[query.period !== 'all', query.template, query.bank, query.evaluator, query.drafter].filter(Boolean).length}>
                <PeriodPicker value={query} onChange={(p) => update({ period: p.period, start: p.start, end: p.end })} />
                <select className="select-pill" aria-label="Report type" value={query.template} onChange={(e) => update({ template: e.target.value })}>
                  <option value="">All types</option>
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
                {isOffice && (
                  <select className="select-pill" aria-label="Drafter" value={query.drafter === 'me' ? 'me' : ''} onChange={(e) => update({ drafter: e.target.value })}>
                    <option value="">Any drafter</option>
                    <option value="me">Drafted by me</option>
                  </select>
                )}
              </MoreFilters>
              {view === 'list' && <select className="select-pill mobile-sort" aria-label="Sort by" value={`${query.sort}:${query.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); update({ sort, dir }); }}>
                <option value="updated:desc">Recently updated</option>
                <option value="updated:asc">Oldest first</option>
                <option value="applicant:asc">Applicant (A–Z)</option>
                <option value="applicant:desc">Applicant (Z–A)</option>
                <option value="value:desc">Highest value</option>
                <option value="value:asc">Lowest value</option>
              </select>}
            </div>
          </div>
        </div>

        {view === 'board' ? (
          <div className="kb-wrap"><SheetBoard query={apiQuery()} reloadKey={reload} /></div>
        ) : data && data.items.length === 0 ? (
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
                <p className="muted">{isSuperadmin ? <>Add a customer with the service they need (<strong>New inspection</strong>): the site inspection sheet is created for the evaluator you choose.</> : isOffice ? 'Site inspections appear here once the field evaluators submit them.' : 'Site inspections assigned to you, or for the customers you add, appear here.'}</p>
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
                    {isOffice && <th className="col-opt">Evaluator</th>}
                    {isOffice && <th className="col-opt">Drafter</th>}
                    <SortTh k="updated" query={query} onSort={sortBy} className="col-opt">Updated</SortTh>
                    <th className="col-go"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!data && <TableSkeleton cols={cols} />}
                  {(data?.items || []).map((v) => (
                    <tr key={v._id} className="clickable" onClick={() => navigate(sheetUrl(v))}>
                      <td>
                        <div className="cell-person">
                          <span className="avatar soft sm">{initials(v.summary?.applicantName)}</span>
                          <span>
                            <Link to={sheetUrl(v)} onClick={(e) => e.stopPropagation()}><strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong></Link>
                            {isOffice && v.status === 'submitted' && <span className="new-tag" title="Submitted, no drafter has taken it yet">New</span>}
                            <small className="muted block ref">{v.referenceNo}</small>
                          </span>
                        </div>
                      </td>
                      <td className="col-opt2">{v.summary?.bankName || '—'}<small className="muted block">{v.summary?.branch}</small></td>
                      <td className="col-opt">{v.summary?.propertyType || '—'}<small className="muted block">{v.summary?.loanCategory}</small></td>
                      <td><span className="badge" title={REPORT_TEMPLATES[v.summary?.reportTemplate]?.title}>{v.summary?.reportTemplate || '—'}</span></td>
                      <td className="num"><strong>{fmv(v)}</strong></td>
                      <td><StatusBadge status={v.status} />{isOffice && ['received', 'returned'].includes(v.status) && <small className="muted block">{v.draftReady ? 'Ready to generate' : `${v.draftMissing || 0} to fill`}</small>}</td>
                      {isOffice && <td className="col-opt">{v.evaluator?.name || '—'}</td>}
                      {isOffice && <td className="col-opt">{v.drafter?.name || (v.status === 'submitted' ? <span className="muted">In queue</span> : '—')}</td>}
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
                  <Link to={sheetUrl(v)} className="list-item">
                    <span className="avatar soft">{initials(v.summary?.applicantName)}</span>
                    <span className="list-main">
                      <strong>{v.summary?.applicantName || 'Unnamed applicant'}{isOffice && v.status === 'submitted' && <span className="new-tag" title="Submitted, no drafter has taken it yet">New</span>}</strong>
                      <small>{[v.referenceNo, v.summary?.reportTemplate, v.drafter?.name && `drafter ${v.drafter.name}`, timeAgo(v.updatedAt)].filter(Boolean).join(' · ')}</small>
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
