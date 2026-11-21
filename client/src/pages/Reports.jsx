import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { REPORT_TEMPLATES } from '@dsk/shared';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import { initials } from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import TableSkeleton from '../components/TableSkeleton.jsx';
import { DuoSheet } from '../components/DuoIcons.jsx';
import { IconChevron, IconPlus } from '../components/Icons.jsx';
import SearchBox from '../components/SearchBox.jsx';
import MoreFilters from '../components/MoreFilters.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import Pager, { ResultCount } from '../components/Pager.jsx';
import useListParams from '../utils/useListParams.js';
import Fab from '../components/Fab.jsx';
import { dateTime, timeAgo } from '../utils/format.js';
import Segmented from '../components/Segmented.jsx';
import ReportBoard from '../components/ReportBoard.jsx';
import ViewSwitch, { rememberView, storedView } from '../components/ViewSwitch.jsx';

const VIEW_KEY = 'dsk.reports.view';
// four tabs, the flow: drafting → awaiting approval → approved (versions sent back to the drafter are listed under All)
const STATUS_TABS = [['', 'All'], ['draft', 'Drafting'], ['review', 'Awaiting approval'], ['approved', 'Approved']];
// "drafting" rows are sheets with a drafter, not generated yet (or sent back for a new version): they open the
// drafting screen (sheet + report)
export const reportHref = (r) => (r.kind === 'draft' ? `/valuations/${r.valuation}/edit?view=report` : `/reports/${r._id}`);
// Drafting · Awaiting approval (with the superadmin) · Sent back (to the drafter; a newer version follows) · Approved
export function ReportStatus({ r }) {
  if (r.kind === 'draft') return <StatusBadge status={r.sheetStatus === 'returned' ? 'returned' : 'received'} label={r.sheetStatus === 'returned' ? 'Back to drafter' : r.sheetStatus === 'submitted' ? 'In queue' : 'Drafting'} />;
  if (r.status === 'approved') return <StatusBadge status="approved" label="Approved" />;
  if (r.status === 'returned') return <StatusBadge status="returned" label="Back to drafter" />;
  return <StatusBadge status="pending" label="Awaiting approval" />;
}

const DEFAULTS = { q: '', status: '', template: '', type: '', generatedBy: '', bank: '', period: 'all', start: '', end: '', sort: 'created', dir: 'desc', limit: '20', page: '1', view: '' };
const SORT_OPTIONS = [['created:desc', 'Newest first'], ['created:asc', 'Oldest first'], ['value:desc', 'Highest value'], ['value:asc', 'Lowest value'], ['customer:asc', 'Customer (A–Z)'], ['reportNo:desc', 'Report no.']];

// Every generated (stored) report, newest first
export default function Reports() {
  const { isSuperadmin } = useAuth();
  const navigate = useNavigate();
  const { params, query, update, filtered, clear, apiQuery } = useListParams(DEFAULTS);
  const view = query.view === 'board' || query.view === 'list' ? query.view : storedView(VIEW_KEY) === 'board' ? 'board' : 'list';
  const setView = (v) => { rememberView(VIEW_KEY, v); update({ view: v, page: '1' }, { replace: true }); };
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // customers matching the search, so a customer without a stored report can still be found
  const [people, setPeople] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.listReports(apiQuery())
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    if (query.q) api.listCustomers({ q: query.q, limit: 5 }).then((r) => setPeople(r.items || [])).catch(() => setPeople([]));
    else setPeople([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const items = data?.items || [];
  const facets = data?.facets || {};
  const types = data?.types || [];
  const searchText = query.q;
  return (
    <div className="page">
      <PageHeader
        icon={DuoSheet}
        title="Reports"
        actions={(
          <div className="lp-head">
            <ViewSwitch view={view} onChange={setView} />
            <SearchBox value={query.q} onSearch={(q) => update({ q }, { replace: true })} label="Search reports" placeholder="Search report no., customer, phone, sheet reference…" />
            {isSuperadmin
              ? <Link className="btn primary desktop-only" to="/reports/new"><IconPlus size={16} /> Generate report</Link>
              : <Link className="btn primary desktop-only" to="/valuations?drafter=me&status=received,returned">My drafting</Link>}
          </div>
        )}
      />
      {isSuperadmin && <Fab label="Generate report" to="/reports/new" />}
      {error && <div className="alert">{error}</div>}

      <div className={`card flush list-card lp-card${loading && data ? ' is-loading' : ''}`}>
        <div className="card-toolbar">
          <div className="toolbar lp-toolbar">
            {view === 'list' && (
              <Segmented label="Status" className="lp-status" options={STATUS_TABS.map(([value, label]) => ({ value, label }))} value={query.status} onChange={(status) => update({ status }, { replace: true })} />
            )}
            {/* filters + sort: one group, kept on the slider's line on computers */}
            <div className="lp-filters">
              <MoreFilters active={[query.period !== 'all', query.type, query.template, query.bank, query.generatedBy].filter(Boolean).length}>
                <PeriodPicker value={query} onChange={(p) => update({ period: p.period, start: p.start, end: p.end })} />
                {types.length > 1 && (
                  <select className="select-pill" aria-label="Report type" value={query.type} onChange={(e) => update({ type: e.target.value })}>
                    <option value="">All report types</option>
                    {types.map((t) => <option key={t.key} value={t.key}>{t.title}</option>)}
                  </select>
                )}
                {(facets.templates?.length > 1 || query.template) && (
                  <select className="select-pill" aria-label="Report template" value={query.template} onChange={(e) => update({ template: e.target.value })}>
                    <option value="">All templates</option>
                    {(facets.templates || []).map((k) => <option key={k} value={k}>{k}{REPORT_TEMPLATES[k] ? ` – ${REPORT_TEMPLATES[k].title}` : ''}</option>)}
                  </select>
                )}
                {/* shown as soon as reports name a bank (with one bank it simply confirms which one) */}
                {(facets.banks?.length > 0 || query.bank) && (
                  <select className="select-pill" aria-label="Bank" value={query.bank} onChange={(e) => update({ bank: e.target.value })}>
                    <option value="">All banks</option>
                    {(facets.banks || []).map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                )}
                {(facets.generatedBy?.length > 1 || query.generatedBy) && (
                  <select className="select-pill" aria-label="Generated by" value={query.generatedBy} onChange={(e) => update({ generatedBy: e.target.value })}>
                    <option value="">Generated by anyone</option>
                    {(facets.generatedBy || []).map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                  </select>
                )}
              </MoreFilters>
              {view === 'list' && <select className="select-pill" aria-label="Sort by" value={`${query.sort}:${query.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); update({ sort, dir }); }}>
                {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>}
            </div>
          </div>
        </div>

        {view === 'board' ? (
          <div className="kb-wrap"><ReportBoard query={apiQuery(['status'])} /></div>
        ) : data && items.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><DuoSheet size={24} /></div>
            {filtered ? (
              <>
                <strong>{searchText ? <>No stored reports match “{searchText}”</> : 'No stored reports match these filters'}</strong>
                <p className="muted">{people.length ? 'Matching customers without a report are listed below.' : 'Try a report number, customer name, phone or sheet reference.'}</p>
                <button type="button" className="btn" onClick={clear}>Clear filters</button>
              </>
            ) : (
              <>
                <strong>No reports generated yet</strong>
                <p className="muted">Pick a customer, one of their approved input sheets and a report type. The generated report is stored here.</p>
                <Link className="btn primary" to="/reports/new"><IconPlus size={16} /> Generate report</Link>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap desktop-only">
              <table className="table list-table">
                <thead>
                  <tr>
                    <th>Report</th><th>Customer</th><th className="col-opt2">Input sheet</th><th>Type</th>
                    <th className="num">Fair market value</th><th>Status</th><th className="col-opt">Generated</th><th className="col-go"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!data && <TableSkeleton cols={8} />}
                  {items.map((r) => (
                    <tr key={r._id} className={`clickable${r.kind === 'draft' ? ' is-draft' : ''}`} onClick={() => navigate(reportHref(r))}>
                      <td>
                        {r.kind === 'draft' ? (
                          <><Link to={reportHref(r)} onClick={(e) => e.stopPropagation()}><strong>Not generated</strong></Link><small className="muted block">Will be version {r.version}</small></>
                        ) : (
                          <><Link to={reportHref(r)} onClick={(e) => e.stopPropagation()}><strong>{r.reportNo}</strong></Link><small className="muted block">Version {r.version}</small></>
                        )}
                      </td>
                      <td>
                        <div className="cell-person">
                          <span className="avatar soft sm">{initials(r.customer?.name || r.applicantName)}</span>
                          <span><strong>{r.customer?.name || r.applicantName}</strong><small className="muted block">{r.customer?.phone1}</small></span>
                        </div>
                      </td>
                      <td className="col-opt2">{r.snapshot?.referenceNo}<small className="muted block property-cell">{r.propertyAddress}</small></td>
                      <td><span className="badge" title={r.templateTitle}>{r.reportTemplate}</span>{(data.types || []).length > 1 && <small className="muted block">{(data.types || []).find((t) => t.key === r.type)?.title}</small>}</td>
                      <td className="num"><strong>{r.fairMarketValue > 0 ? inr(r.fairMarketValue) : '—'}</strong></td>
                      <td><ReportStatus r={r} /></td>
                      {r.kind === 'draft'
                        ? <td className="muted nowrap col-opt" title={dateTime(r.editedAt)}>Edited {timeAgo(r.editedAt)}<small className="block">{r.editedBy?.name}</small></td>
                        : <td className="muted nowrap col-opt" title={dateTime(r.createdAt)}>{timeAgo(r.createdAt)}<small className="block">{r.generatedBy?.name}</small></td>}
                      <td className="col-go" aria-hidden="true"><IconChevron size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="list mobile-only">
              {items.map((r) => (
                <li key={r._id}>
                  <Link to={reportHref(r)} className="list-item">
                    <span className="avatar soft">{initials(r.customer?.name || r.applicantName)}</span>
                    <span className="list-main">
                      <strong>{r.customer?.name || r.applicantName}</strong>
                      <small>{r.kind === 'draft' ? `Not generated · ${r.snapshot?.referenceNo} · edited ${timeAgo(r.editedAt)}` : `${r.reportNo} · v${r.version} · ${timeAgo(r.createdAt)}`}</small>
                    </span>
                    <span className="list-end"><strong className="amount">{r.fairMarketValue > 0 ? inr(r.fairMarketValue) : '—'}</strong><ReportStatus r={r} /></span>
                  </Link>
                </li>
              ))}
            </ul>
            <Pager className="lp-pager" data={data} limit={query.limit} onChange={update} summary={<ResultCount data={data} limit={query.limit} filtered={filtered} onClear={clear} noun={data?.total === 1 ? 'stored report' : 'stored reports'} />} />
          </>
        )}
      </div>

      {searchText && data && people.filter((c) => !items.some((r) => String(r.customer?._id) === String(c._id))).length > 0 && (
        <section className="card flush">
          <div className="card-head">
            <div>
              <h2>Customers matching “{searchText}”</h2>
              <p className="muted small">No stored report yet. Generate one from an approved input sheet.</p>
            </div>
          </div>
          <ul className="list">
            {people.filter((c) => !items.some((r) => String(r.customer?._id) === String(c._id))).map((c) => (
              <li key={c._id} className="list-item suggest-row">
                <span className="avatar soft sm">{initials(c.name)}</span>
                <span className="list-main">
                  <strong>{c.name}</strong>
                  <small>{[c.phone1, c.district, `${c.stats?.approved || 0} approved sheet${c.stats?.approved === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small>
                </span>
                {c.stats?.approved > 0 ? (
                  <Link className="btn small primary" style={{ marginTop: 0 }} to={`/reports/new?customer=${c._id}`}><IconPlus size={14} /> Generate report</Link>
                ) : (
                  <Link className="btn small" style={{ marginTop: 0 }} to={`/customers/${c._id}`}>No approved sheet · open customer</Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
