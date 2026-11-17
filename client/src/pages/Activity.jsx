import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import ActivityItem from '../components/ActivityItem.jsx';
import { inr } from '../components/StatusBadge.jsx';
import { initials } from '../components/Layout.jsx';
import SearchBox from '../components/SearchBox.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Segmented from '../components/Segmented.jsx';
import { DuoPulse } from '../components/DuoIcons.jsx';
import { ROLE_LABELS } from '../context/AuthContext.jsx';
import { duration, timeAgo } from '../utils/format.js';
import { IconDownload, IconFilter } from '../components/Icons.jsx';
import CollapsibleSearch from '../components/CollapsibleSearch.jsx';
import { UserStatus } from './Team.jsx';

const GROUPS = [
  ['', 'All actions'],
  ['valuation', 'Valuations'],
  ['valuation.assigned', '— Assigned'],
  ['valuation.submitted', '— Submitted'],
  ['valuation.approved', '— Approved'],
  ['valuation.rejected', '— Rejected'],
  ['auth', 'Sign-ins & security'],
  ['auth.login_failed', '— Failed sign-ins'],
  ['customer', 'Customers'],
  ['report', 'Reports'],
  ['report.generated', '— Generated'],
  ['file', 'Files'],
  ['user', 'Team changes'],
];

const isoDay = (offsetDays = 0) => new Date(Date.now() - offsetDays * 864e5).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const PRESETS = [['Today', 0], ['7 days', 6], ['30 days', 29], ['90 days', 89]];

export default function Activity() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') || 'feed';
  const filters = {
    actor: params.get('actor') || '',
    action: params.get('action') || '',
    from: params.get('from') || '',
    to: params.get('to') || '',
    q: params.get('q') || '',
    page: params.get('page') || 1,
  };
  const [users, setUsers] = useState([]);
  const [feed, setFeed] = useState(null);
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  // phones: member / action / dates are tucked behind a Filters button
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.listUsers().then((r) => setUsers(r.items)).catch(() => {});
  }, []);

  useEffect(() => {
    setError('');
    if (view === 'feed') api.listActivity({ ...filters, limit: 50 }).then(setFeed).catch((e) => setError(e.message));
    else api.teamReport({ from: filters.from, to: filters.to }).then(setReport).catch((e) => setError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const update = (patch, { replace = false } = {}) => {
    const next = { view, ...filters, page: 1, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && v !== 1 && !(k === 'view' && v === 'feed'))), { replace });
  };

  const activeFilters = [filters.actor, filters.action, filters.from, filters.to].filter(Boolean).length;
  const exportCsv = () => api.downloadActivityCsv({ ...filters, page: undefined }).catch((e) => setError(e.message));

  return (
    <div className="page">
      <PageHeader
        icon={DuoPulse}
        title="Activity"
        actions={<button className="btn desktop-only" onClick={exportCsv}><IconDownload size={16} /> Export CSV</button>}
        corner={<button type="button" className="icon-btn head-icon-btn" onClick={exportCsv} aria-label="Export CSV" title="Export CSV"><IconDownload size={19} /></button>}
      />

      <Segmented
        label="View"
        options={[{ value: 'feed', label: 'Activity feed' }, { value: 'report', label: 'Team report' }]}
        value={view}
        onChange={(v) => update({ view: v }, { replace: true })}
      />

      <div className={`card filters-card${showFilters ? ' open' : ''}`}>
        <div className="filters-mobile-head">
          {view === 'feed' && (
            <CollapsibleSearch className="compact" value={filters.q} onSearch={(q) => update({ q }, { replace: true })} label="Search activity" placeholder="Search reference, applicant, user…" />
          )}
          <button type="button" className={`btn filters-toggle${activeFilters ? ' on' : ''}`} aria-expanded={showFilters} onClick={() => setShowFilters((o) => !o)}>
            <IconFilter size={16} /> Filters{activeFilters > 0 && <span className="tab-num">{activeFilters}</span>}
          </button>
        </div>
        <div className="filter-grid">
          {view === 'feed' && (
            <>
              <label>Team member
                <select value={filters.actor} onChange={(e) => update({ actor: e.target.value })}>
                  <option value="">Everyone</option>
                  {users.map((u) => <option key={u._id} value={u._id}>{u.name} · {ROLE_LABELS[u.role]}</option>)}
                </select>
              </label>
              <label>Action
                <select value={filters.action} onChange={(e) => update({ action: e.target.value })}>
                  {GROUPS.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
                </select>
              </label>
            </>
          )}
          <label>From<input type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => update({ from: e.target.value })} /></label>
          <label>To<input type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => update({ to: e.target.value })} /></label>
        </div>
        <div className="filter-foot">
          <div className="chips">
            {PRESETS.map(([label, days]) => {
              const on = filters.from === isoDay(days) && filters.to === isoDay(0);
              return <button key={label} type="button" className={`chip${on ? ' on' : ''}`} onClick={() => update({ from: isoDay(days), to: isoDay(0) })}>{label}</button>;
            })}
            {(filters.from || filters.to || filters.actor || filters.action || filters.q) && (
              <button type="button" className="chip" onClick={() => setParams(view === 'feed' ? {} : { view })}>Clear filters</button>
            )}
          </div>
          {view === 'feed' && (
            <SearchBox className="compact filters-desktop-search" value={filters.q} onSearch={(q) => update({ q }, { replace: true })} label="Search activity" placeholder="Search reference, applicant, user…" />
          )}
        </div>
      </div>

      {error && <div className="alert">{error}</div>}

      {view === 'feed' ? (
        <section className="card">
          <div className="card-head"><h2>{feed ? `${feed.total} events` : 'Loading…'}</h2></div>
          {feed && feed.items.length === 0 && <p className="muted">No activity matches these filters.</p>}
          <div className="act-list">{(feed?.items || []).map((a) => <ActivityItem key={a._id} item={a} />)}</div>
          {feed?.pages > 1 && (
            <div className="pager flat">
              <button className="btn ghost" disabled={feed.page <= 1} onClick={() => update({ page: feed.page - 1 })}>‹ Newer</button>
              <span className="muted">Page {feed.page} of {feed.pages}</span>
              <button className="btn ghost" disabled={feed.page >= feed.pages} onClick={() => update({ page: feed.page + 1 })}>Older ›</button>
            </div>
          )}
        </section>
      ) : (
        <TeamReport report={report} />
      )}
    </div>
  );
}

// Include days with no activity so gaps are visible (series comes back sparse from the API)
function fillDays(series) {
  if (!series.length) return [];
  const byDay = Object.fromEntries(series.map((d) => [d.day, d]));
  const out = [];
  const start = new Date(`${series[0].day}T00:00:00Z`);
  const end = new Date(`${series[series.length - 1].day}T00:00:00Z`);
  for (let d = start; d <= end && out.length < 366; d = new Date(d.getTime() + 864e5)) {
    const key = d.toISOString().slice(0, 10);
    out.push(byDay[key] || { day: key });
  }
  return out;
}

function TeamReport({ report }) {
  if (!report) return <div className="skeleton" style={{ height: 320 }} />;
  const { rows, totals } = report;
  const daily = fillDays(report.daily);
  const maxDay = Math.max(1, ...daily.map((d) => (d.created || 0) + (d.submitted || 0)));
  return (
    <>
      <div className="kpis">
        <div className="kpi"><div className="kpi-value">{totals.total}</div><div className="kpi-label">Valuations started</div></div>
        <div className="kpi"><div className="kpi-value">{totals.submitted}</div><div className="kpi-label">Awaiting review</div></div>
        <div className="kpi tone-green"><div className="kpi-value">{totals.approved}</div><div className="kpi-label">Approved</div></div>
        <div className="kpi tone-red"><div className="kpi-value">{totals.rejected}</div><div className="kpi-label">Rejected</div></div>
        <div className="kpi"><div className="kpi-value">{inr(totals.value)}</div><div className="kpi-label">Value handled</div></div>
      </div>

      {daily.length > 0 && (
        <section className="card">
          <div className="card-head">
            <h2>Daily throughput</h2>
            <span className="legend"><i className="lg-created" /> created <i className="lg-submitted" /> submitted</span>
          </div>
          <div className="spark tall">
            {daily.map((d) => (
              <span key={d.day} className="stack-bar" title={`${d.day}: ${d.created || 0} created, ${d.submitted || 0} submitted, ${d.approved || 0} approved, ${d.rejected || 0} rejected`}>
                <i className="seg-submitted" style={{ height: `${((d.submitted || 0) / maxDay) * 100}%` }} />
                <i className="seg-created" style={{ height: `${((d.created || 0) / maxDay) * 100}%` }} />
              </span>
            ))}
          </div>
          <div className="spark-axis"><span>{daily[0].day}</span><span>{daily[daily.length - 1].day}</span></div>
        </section>
      )}

      <section className="card flush">
        <div className="card-head"><h2>Team performance</h2></div>
        <div className="table-wrap desktop-only">
          <table className="table dense">
            <thead>
              <tr>
                <th>Member</th><th className="num">Started</th><th className="num">Submitted</th><th className="num">Approved</th><th className="num">Rejected</th>
                <th className="num">Approval</th><th className="num col-opt">Avg. submit</th><th className="num">Value</th><th className="num col-opt">Sign-ins</th><th className="col-opt">Last active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td>
                    <div className="cell-person">
                      <span className="avatar soft sm">{initials(r.name)}</span>
                      <span><Link to={`/team/${r._id}`}><strong>{r.name}</strong></Link><small className="muted block">{ROLE_LABELS[r.role]}{r.branch && ` · ${r.branch}`}</small></span>
                    </div>
                  </td>
                  <td className="num"><strong>{r.stats.total}</strong></td>
                  <td className="num">{r.actions['valuation.submitted'] || 0}</td>
                  <td className="num">{r.stats.approved}</td>
                  <td className="num">{r.stats.rejected}</td>
                  <td className="num">{r.stats.approvalRate == null ? '—' : `${r.stats.approvalRate}%`}</td>
                  <td className="num col-opt">{duration(r.stats.avgSubmitHours)}</td>
                  <td className="num">{inr(r.stats.totalValue)}</td>
                  <td className="num col-opt">{r.actions['auth.login'] || 0}{r.actions['auth.login_failed'] ? <small className="warn block">{r.actions['auth.login_failed']} failed</small> : null}</td>
                  <td className="nowrap col-opt">{timeAgo(r.lastActiveAt)}{r.status !== 'active' && <div><UserStatus status={r.status} /></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* phones: one card per member */}
        <ul className="list mobile-only">
          {rows.map((r) => (
            <li key={r._id}>
              <Link to={`/team/${r._id}`} className="list-item report-item">
                <span className="avatar soft">{initials(r.name)}</span>
                <span className="list-main">
                  <strong>{r.name}</strong>
                  <small>{ROLE_LABELS[r.role]}{r.branch && ` · ${r.branch}`} · active {timeAgo(r.lastActiveAt)}</small>
                  <span className="report-stats">
                    <span><b>{r.stats.total}</b> started</span>
                    <span><b>{r.stats.approved}</b> approved</span>
                    <span><b>{r.stats.rejected}</b> rejected</span>
                    <span><b>{r.stats.approvalRate == null ? '—' : `${r.stats.approvalRate}%`}</b> approval</span>
                  </span>
                </span>
                <span className="list-end"><strong className="amount">{inr(r.stats.totalValue)}</strong></span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
