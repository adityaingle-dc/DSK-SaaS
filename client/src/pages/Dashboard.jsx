import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { initials, UserMenu } from '../components/Layout.jsx';
import ActivityItem from '../components/ActivityItem.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { SearchTrigger } from '../components/GlobalSearch.jsx';
import EvaluatorDashboard from './EvaluatorDashboard.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import { compareLabel, periodLabel, periodRange, prevParams, rangeParams } from '../utils/period.js';
import { DuoHome } from '../components/DuoIcons.jsx';
import { IconCheck, IconChevron, IconClock, IconDraft, IconEye } from '../components/Icons.jsx';

// change vs the previous period: "▲ 3" / "▼ 12%" / "No change"
// invert: for figures where going down is good (e.g. rejections)
function Delta({ cur, prev, pct = false, vs, invert = false }) {
  if (prev == null) return null;
  const diff = (cur || 0) - (prev || 0);
  if (!diff) return <span className="delta flat" title={`Same as ${vs}`}>No change</span>;
  const text = pct
    ? (prev ? `${Math.abs(Math.round((diff / prev) * 1000) / 10)}%` : 'new')
    : Math.abs(diff).toLocaleString('en-IN');
  return (
    <span className={`delta ${(diff > 0) !== invert ? 'up' : 'down'}`} title={`vs ${vs}`}>
      {diff > 0 ? '▲' : '▼'} {text}
    </span>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

function OverviewDashboard() {
  const { user, logout, isReviewer, isSuperadmin } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [team, setTeam] = useState(null);
  const [stats, setStats] = useState(null);
  const [prev, setPrev] = useState(null);
  const [recent, setRecent] = useState([]);
  const [mine, setMine] = useState([]); // superadmin: sheets they are filling in themselves
  // the superadmin goes straight to editing a sheet; others open its page
  const sheetUrl = (id) => (isSuperadmin ? `/valuations/${id}/edit` : `/valuations/${id}`);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // period filter lives in the URL (?period=month, or ?period=custom&start=…&end=…)
  const period = { period: params.get('period') || 'all', start: params.get('start') || '', end: params.get('end') || '' };
  const range = periodRange(period.period, period);
  const periodQS = period.period === 'all' ? '' : new URLSearchParams(Object.fromEntries(Object.entries(period).filter(([, v]) => v))).toString();
  const setPeriod = (p) => setParams(p.period === 'all' ? {} : Object.fromEntries(Object.entries(p).filter(([, v]) => v)));
  const vs = compareLabel(period.period);

  useEffect(() => {
    setLoading(true);
    const cur = rangeParams(range);
    const before = prevParams(range);
    Promise.all([api.stats(cur), api.listValuations({ limit: 6, ...cur }), before ? api.stats(before) : Promise.resolve(null)])
      .then(([st, r, pv]) => {
        setStats(st);
        setRecent(r.items);
        setPrev(pv);
        setError('');
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  useEffect(() => {
    const me = user?._id || user?.id;
    if (!isSuperadmin || !me) return;
    Promise.all([api.listValuations({ evaluator: me, status: 'draft', limit: 5 }), api.listValuations({ evaluator: me, status: 'rejected', limit: 5 })])
      .then(([d, r]) => setMine([...(r.items || []), ...(d.items || [])].filter((v, i, all) => all.findIndex((x) => x._id === v._id) === i)))
      .catch(() => {});
  }, [isSuperadmin, user]);

  useEffect(() => {
    if (isSuperadmin) {
      Promise.all([api.listActivity({ limit: 6 }), api.listUsers({ status: 'pending' })])
        .then(([a, p]) => setTeam({ activity: a.items, pending: p.counts?.pending || 0 }))
        .catch(() => {});
    }
  }, [isSuperadmin]);

  if (error && !stats) return <div className="alert">{error}</div>;
  if (!stats) return <DashboardSkeleton />;
  const s = stats.byStatus;
  const maxCount = Math.max(1, ...stats.byTemplate.map((t) => t.count));
  const completedRate = stats.total ? Math.round(((s.approved || 0) / stats.total) * 100) : null;
  const ps = prev?.byStatus || {};
  const withPeriod = (to) => (periodQS ? `${to}${to.includes('?') ? '&' : '?'}${periodQS}` : to);
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const tiles = [
    { key: 'draft', to: withPeriod('/valuations?status=draft'), label: 'Drafts', caption: s.rejected ? `Work in progress · ${s.rejected} sent back` : 'Work in progress', icon: <IconDraft size={18} />, count: (s.draft || 0) + (s.rejected || 0), tone: 'slate' },
    { key: 'submitted', to: withPeriod('/valuations?status=submitted,received'), label: 'In review', caption: isSuperadmin ? 'New: not opened yet' : 'Not opened yet', icon: <IconClock size={18} />, count: s.submitted, tone: 'amber' },
    { key: 'received', to: withPeriod('/valuations?status=submitted,received'), label: 'Received', caption: 'Opened, report to generate', icon: <IconEye size={18} />, count: s.received, tone: 'blue' },
    { key: 'approved', to: withPeriod('/valuations?status=approved'), label: 'Completed', caption: 'Report generated', icon: <IconCheck size={18} />, count: s.approved, tone: 'green' },
  ];

  return (
    <div className="page">
      <PageHeader
        icon={DuoHome}
        eyebrow={today}
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        // phones: search is an icon up here; the superadmin's account menu (and Log out) lives in the "More" tab
        corner={(
          <div className="head-account">
            {/* phones: compact period chip (icon only on "All time", label when a period is set) */}
            <PeriodPicker className="period-compact" value={period} onChange={setPeriod} />
            <SearchTrigger iconOnly className="head-search-icon" />
            {!isSuperadmin && <UserMenu user={user} logout={logout} placement="down" compact />}
          </div>
        )}
        actions={
          <div className="head-tools desktop-only">
            <PeriodPicker value={period} onChange={setPeriod} />
            <SearchTrigger className="head-search" />
          </div>
        }
      />

      {team?.pending > 0 && (
        <Link to="/team?status=pending" className="banner">
          <span className="banner-dot" />
          <span><strong>{team.pending} account{team.pending > 1 ? 's' : ''}</strong> waiting for your approval</span>
          <span className="banner-cta">Review <IconChevron size={16} /></span>
        </Link>
      )}

      <div className={`period-body${loading ? ' is-loading' : ''}`}>
      <section className="hero-card">
        <div className="hero-label">
          {isReviewer ? 'Portfolio value under valuation' : 'Value of my input sheets'}
          {period.period !== 'all' && <span className="hero-period"> · {periodLabel(period.period, period)}</span>}
        </div>
        <div className="hero-value-row">
          <div className="hero-value">{inr(stats.totalValue)}</div>
          <Delta cur={stats.totalValue} prev={prev?.totalValue} pct vs={vs} />
        </div>
        <div className="hero-words">
          {period.period === 'all' ? 'Total fair market value across all report types' : `Fair market value of input sheets created in this period${prev ? `, compared with ${vs}` : ''}`}
        </div>
        <div className="hero-metrics">
          <div><strong>{stats.total} <Delta cur={stats.total} prev={prev?.total} vs={vs} /></strong><small>Total input sheets</small></div>
          <div><strong>{stats.total ? inr(stats.totalValue / stats.total) : '—'}</strong><small>Average value</small></div>
          <div><strong>{completedRate == null ? '—' : `${completedRate}%`}</strong><small>Completed</small></div>
          <div><strong>{stats.byTemplate.length}</strong><small>Report types in use</small></div>
        </div>
      </section>

      <section className="stat-grid">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className={`stat tone-${t.tone}`}>
            <div className="stat-top">
              <span className="stat-label">{t.label}</span>
              <span className="stat-icon">{t.icon}</span>
            </div>
            <div className="stat-value">{t.count || 0} <Delta cur={t.count} prev={prev ? ps[t.key] || 0 : null} vs={vs} invert={t.key === 'rejected'} /></div>
            <div className="stat-foot">
              <span>{t.caption}</span>
              <IconChevron size={16} className="go" />
            </div>
          </Link>
        ))}
      </section>

      {mine.length > 0 && (
        <section className="card flush my-sheets">
          <div className="card-head">
            <h2>Your input sheets to finish</h2>
            <span className="muted small">{mine.length} open</span>
          </div>
          <ul className="list">
            {mine.map((v) => (
              <li key={v._id}>
                <Link to={`/valuations/${v._id}/edit`} className="list-item">
                  <span className="avatar soft">{initials(v.summary?.applicantName)}</span>
                  <span className="list-main">
                    <strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong>
                    <small>{[v.referenceNo, v.summary?.bankName, `updated ${new Date(v.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' · ')}</small>
                  </span>
                  <span className="list-end">
                    {v.status === 'rejected' && <StatusBadge status={v.status} />}
                    <span className="btn primary small">Continue</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid-2 wide-left">
        <section className="card flush">
          <div className="card-head">
            <h2>Recent input sheets</h2>
            <Link to={withPeriod('/valuations')} className="link-sm">View all <IconChevron size={14} /></Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="table-wrap desktop-only">
                <table className="table">
                  <thead>
                    <tr><th>Applicant</th><th>Report</th><th className="num">Fair market value</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {recent.map((v) => (
                      <tr key={v._id} className="clickable" onClick={() => navigate(sheetUrl(v._id))}>
                        <td>
                          <div className="cell-person">
                            <span className="avatar soft sm">{initials(v.summary?.applicantName)}</span>
                            <span>
                              <Link to={sheetUrl(v._id)} onClick={(e) => e.stopPropagation()}><strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong></Link>
                              <small className="muted block">{v.referenceNo}</small>
                            </span>
                          </div>
                        </td>
                        <td><span className="badge">{v.summary?.reportTemplate || '—'}</span></td>
                        <td className="num"><strong>{inr(v.summary?.fairMarketValue)}</strong></td>
                        <td><StatusBadge status={v.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="list mobile-only">
                {recent.map((v) => (
                  <li key={v._id}>
                    <Link to={sheetUrl(v._id)} className="list-item">
                      <span className="avatar soft">{initials(v.summary?.applicantName)}</span>
                      <span className="list-main">
                        <strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong>
                        <small>{v.referenceNo} · {v.summary?.reportTemplate}</small>
                      </span>
                      <span className="list-end">
                        <strong className="amount">{inr(v.summary?.fairMarketValue)}</strong>
                        <StatusBadge status={v.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>By report type</h2>
          </div>
          {stats.byTemplate.length === 0 ? (
            <p className="muted">Report types appear here once input sheets are saved.</p>
          ) : (
            <ul className="bars">
              {stats.byTemplate.map((t) => (
                <li key={t._id}>
                  <Link to={withPeriod(`/valuations?template=${t._id}`)}>
                    <div className="bar-top">
                      <span><span className="badge">{t._id}</span> {t.title}</span>
                      <span className="muted num-tab">{t.count}</span>
                    </div>
                    <div className="bar"><span style={{ width: `${(t.count / maxCount) * 100}%` }} /></div>
                    <div className="bar-foot">{inr(t.value)}</div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      </div>

      {isSuperadmin && team && (
        <section className="card">
          <div className="card-head">
            <h2><span className="live-dot" /> Team activity</h2>
            <Link to="/activity" className="link-sm">View all <IconChevron size={14} /></Link>
          </div>
          {team.activity.length === 0 ? <p className="muted">No activity yet.</p> : (
            <div className="act-list">{team.activity.map((a) => <ActivityItem key={a._id} item={a} />)}</div>
          )}
        </section>
      )}
    </div>
  );
}

function EmptyState() {
  const { isSuperadmin } = useAuth();
  return (
    <div className="empty">
      <div className="empty-icon"><IconDraft size={24} /></div>
      <strong>No input sheets yet</strong>
      <p className="muted">{isSuperadmin ? <>Use <strong>New input sheet</strong> on <strong>Input Sheets</strong> or a customer's page: assign it to an evaluator, or pick <strong>Myself</strong> to fill it in now.</> : 'Input sheets assigned to you by the superadmin appear here.'}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="page">
      <div className="skeleton" style={{ height: 56, width: 280 }} />
      <div className="skeleton" style={{ height: 170 }} />
      <div className="stat-grid">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 120 }} />)}</div>
      <div className="skeleton" style={{ height: 300 }} />
    </div>
  );
}

// Field evaluators see the tasks assigned to them; the superadmin and admins see the overview
export default function Dashboard() {
  const { user } = useAuth();
  return user.role === 'evaluator' ? <EvaluatorDashboard /> : <OverviewDashboard />;
}
