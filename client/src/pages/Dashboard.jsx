import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { initials } from '../components/Layout.jsx';
import ActivityItem from '../components/ActivityItem.jsx';
import { IconCheck, IconChevron, IconClock, IconDraft, IconPlus, IconX } from '../components/Icons.jsx';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

export default function Dashboard() {
  const { user, isReviewer, isSuperadmin } = useAuth();
  const [team, setTeam] = useState(null);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.stats(), api.listValuations({ limit: 6 })])
      .then(([s, r]) => {
        setStats(s);
        setRecent(r.items);
      })
      .catch((e) => setError(e.message));
    if (isSuperadmin) {
      Promise.all([api.listActivity({ limit: 6 }), api.listUsers({ status: 'pending' })])
        .then(([a, p]) => setTeam({ activity: a.items, pending: p.counts?.pending || 0 }))
        .catch(() => {});
    }
  }, [isSuperadmin]);

  if (error) return <div className="alert">{error}</div>;
  if (!stats) return <DashboardSkeleton />;
  const s = stats.byStatus;
  const maxCount = Math.max(1, ...stats.byTemplate.map((t) => t.count));

  const actions = [
    { to: '/valuations/new', label: 'New', icon: <IconPlus />, tone: 'blue' },
    { to: '/valuations?status=draft', label: 'Drafts', icon: <IconDraft />, count: s.draft, tone: 'slate' },
    { to: '/valuations?status=submitted', label: 'In review', icon: <IconClock />, count: s.submitted, tone: 'amber' },
    { to: '/valuations?status=approved', label: 'Approved', icon: <IconCheck />, count: s.approved, tone: 'green' },
    { to: '/valuations?status=rejected', label: 'Rejected', icon: <IconX />, count: s.rejected, tone: 'red' },
  ];

  return (
    <div className="page">
      <div className="hello">
        <div>
          <p className="muted">{greeting()},</p>
          <h1>{user.name.split(' ')[0]}</h1>
        </div>
      </div>

      <section className="hero-card">
        <div className="hero-label">{isReviewer ? 'Portfolio value under valuation' : 'Value of my valuations'}</div>
        <div className="hero-value">{inr(stats.totalValue)}</div>
        <div className="hero-meta">
          <span><strong>{stats.total}</strong> valuations</span>
          <span><strong>{s.submitted || 0}</strong> awaiting review</span>
          <span><strong>{s.approved || 0}</strong> approved</span>
        </div>
      </section>

      {team?.pending > 0 && (
        <Link to="/team?status=pending" className="banner">
          <span className="banner-dot" />
          <span><strong>{team.pending} account{team.pending > 1 ? 's' : ''}</strong> waiting for your approval</span>
          <span className="banner-cta">Review <IconChevron size={16} /></span>
        </Link>
      )}

      <section className="quick-actions">
        {actions.map((a) => (
          <Link key={a.label} to={a.to} className={`qa tone-${a.tone}`}>
            <span className="qa-icon">
              {a.icon}
              {a.count > 0 && <span className="qa-count">{a.count}</span>}
            </span>
            <span className="qa-label">{a.label}</span>
          </Link>
        ))}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head">
            <h2>Recent activity</h2>
            <Link to="/valuations" className="link-sm">See all</Link>
          </div>
          {recent.length === 0 ? (
            <EmptyState />
          ) : (
            <ul className="list">
              {recent.map((v) => (
                <li key={v._id}>
                  <Link to={`/valuations/${v._id}`} className="list-item">
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
          )}
        </section>

        <section className="card">
          <div className="card-head">
            <h2>By report type</h2>
          </div>
          {stats.byTemplate.length === 0 ? (
            <p className="muted">Report types appear here once valuations are saved.</p>
          ) : (
            <ul className="bars">
              {stats.byTemplate.map((t) => (
                <li key={t._id}>
                  <Link to={`/valuations?template=${t._id}`}>
                    <div className="bar-top">
                      <span><span className="badge">{t._id}</span> {t.title}</span>
                      <span className="muted">{t.count}</span>
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

      {isSuperadmin && team && (
        <section className="card">
          <div className="card-head">
            <h2><span className="live-dot" /> Team activity</h2>
            <Link to="/activity" className="link-sm">Open activity</Link>
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
  return (
    <div className="empty">
      <div className="empty-icon"><IconDraft size={26} /></div>
      <strong>No valuations yet</strong>
      <p className="muted">Start your first input sheet – values are calculated as you type.</p>
      <Link to="/valuations/new" className="btn primary">Start a valuation <IconChevron size={16} /></Link>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="page">
      <div className="skeleton" style={{ height: 40, width: 180 }} />
      <div className="skeleton" style={{ height: 150 }} />
      <div className="skeleton" style={{ height: 90 }} />
      <div className="skeleton" style={{ height: 260 }} />
    </div>
  );
}
