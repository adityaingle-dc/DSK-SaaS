import { useEffect, useState } from 'react';
import SearchBox from '../components/SearchBox.jsx';
import Segmented from '../components/Segmented.jsx';
import CustomerContactCard, { WhatsAppLink } from '../components/CustomerContact.jsx';
import { directionsUrl } from '../components/SiteInfo.jsx';
import SectionIcon from '../components/SectionIcons.jsx';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { inr } from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { initials, UserMenu } from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { SearchTrigger } from '../components/GlobalSearch.jsx';
import { DuoHome } from '../components/DuoIcons.jsx';
import { IconBuilding, IconCheck, IconChevron, IconChevronDown, IconClock, IconDraft, IconPhone } from '../components/Icons.jsx';
import { dateTime, timeAgo } from '../utils/format.js';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// how each stage looks and what the main button says
const STAGE = {
  returned: { label: 'Sent back', cls: 'status-rejected', action: 'Fix & resubmit' },
  new: { label: 'New task', cls: 'status-new', action: 'Start' },
  inProgress: { label: 'In progress', cls: 'status-draft', action: 'Continue' },
  submitted: { label: 'In review', cls: 'status-submitted' },
  received: { label: 'With superadmin', cls: 'status-received' },
  approved: { label: 'Completed', cls: 'status-approved' },
};
const StageChip = ({ stage }) => <span className={`status ${STAGE[stage].cls}`}><span className="dot" />{STAGE[stage].label}</span>;

// search across what an evaluator sees on a task
const haystack = (t) => [t.applicantName, t.referenceNo, t.propertyDescription, t.bankName, t.branch, t.site?.address, t.site?.landmark,
  t.customer?.name, t.customer?.phone1, t.customer?.phone2].filter(Boolean).join(' ').toLowerCase();
const matches = (t, q) => {
  if (!q) return true;
  const h = haystack(t);
  const digits = q.replace(/\D/g, '');
  return q.toLowerCase().split(/\s+/).every((w) => h.includes(w)) || (digits.length >= 3 && h.replace(/\D/g, '').includes(digits));
};
const TASK_TABS = [['', 'All'], ['new', 'New'], ['inProgress', 'In progress'], ['returned', 'Sent back']];

function TaskRow({ t }) {
  const st = STAGE[t.stage];
  const [open, setOpen] = useState(false);
  const c = t.customer;
  const site = t.site || {};
  const dirUrl = site.address ? directionsUrl(site) : null;
  const bank = [t.bankName, t.branch].filter(Boolean).join(' · ');
  const urgent = t.stage === 'returned' || t.stage === 'new';
  return (
    <li className={`task task-${t.stage}`}>
      <div className="task-head">
        <span className="avatar soft">{initials(t.applicantName)}</span>
        <div className="task-heading">
          <div className="task-title">
            <Link to={`/valuations/${t._id}`}><strong>{t.applicantName || 'New applicant'}</strong></Link>
            <StageChip stage={t.stage} />
          </div>
          <small className="task-ref">{[t.referenceNo, t.propertyDescription].filter(Boolean).join(' · ')}</small>
        </div>
        <Link className={`btn small task-btn desktop-only${urgent ? ' primary' : ''}`} to={`/valuations/${t._id}/edit`}>
          {st.action} <IconChevron size={14} />
        </Link>
      </div>

      <div className="task-body">
        <ul className="task-info">
          <li className="ti-site">
            <span className="ti-icon"><SectionIcon section={{ key: 'property' }} size={15} /></span>
            <span className="ti-text">
              {site.address ? (
                <>{site.address}{site.landmark && <small>Landmark: {site.landmark}</small>}</>
              ) : (
                <span className="muted">Site address not given yet</span>
              )}
            </span>
            {dirUrl && <a className="ti-action" href={dirUrl} target="_blank" rel="noreferrer">Directions <IconChevron size={13} /></a>}
          </li>
          {bank && (
            <li>
              <span className="ti-icon"><IconBuilding size={15} /></span>
              <span className="ti-text">{bank}</span>
            </li>
          )}
          {c?.phone1 && (
            <li>
              <span className="ti-icon"><IconPhone size={15} /></span>
              <span className="ti-text"><a className="ti-phone" href={`tel:${c.phone1}`}>{c.phone1}</a>{c.name && c.name.trim().toLowerCase() !== String(t.applicantName || '').replace(/^(sri|smt|shri|mr|mrs|ms|dr)\.?\s+/i, '').trim().toLowerCase() && <span className="muted"> · {c.name}</span>}</span>
              <WhatsAppLink phone={c.phone1} name={c.name} />
            </li>
          )}
          {c?.notes && (
            <li className="ti-note">
              <span className="ti-icon"><IconDraft size={15} /></span>
              <span className="ti-text">{c.notes}</span>
            </li>
          )}
        </ul>

        {t.stage === 'returned' && (
          <div className="task-callout" role="note">
            <strong>Returned by {t.reviewedBy || 'the superadmin'}</strong>
            <p>{t.reviewNote || 'Please make the changes and resubmit.'}</p>
            <small>{timeAgo(t.reviewedAt)}</small>
          </div>
        )}

        <div className="task-foot">
          <small className="task-when" title={dateTime(t.assignedAt)}>
            <IconClock size={13} />
            Assigned {t.assignedBy ? `by ${t.assignedBy} ` : ''}{timeAgo(t.assignedAt)}
            {t.stage === 'inProgress' && t.startedAt && ` · last saved ${timeAgo(t.updatedAt)}`}
          </small>
          {c && (
            <button type="button" className="task-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
              {open ? 'Hide customer details' : 'Customer details'} <IconChevronDown size={14} />
            </button>
          )}
        </div>
        {open && <CustomerContactCard customer={c} bare />}
        {/* phones: the main action sits at the end of the card */}
        <Link className={`btn task-btn mobile-only${urgent ? ' primary' : ''}`} to={`/valuations/${t._id}/edit`}>
          {st.action} <IconChevron size={14} />
        </Link>
      </div>
    </li>
  );
}

export default function EvaluatorDashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');

  useEffect(() => {
    api.myTasks().then(setData).catch((e) => setError(e.message));
  }, []);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const header = (
    <PageHeader
      icon={DuoHome}
      eyebrow={today}
      title={`${greeting()}, ${user.name.split(' ')[0]}`}
      subtitle={data ? (data.todo.length ? `You have ${data.todo.length} task${data.todo.length === 1 ? '' : 's'} to work on` : "You're all caught up") : ''}
      corner={<div className="head-account"><SearchTrigger iconOnly className="head-search-icon" /><UserMenu user={user} logout={logout} placement="down" compact /></div>}
      actions={<div className="head-tools desktop-only"><SearchTrigger className="head-search" /></div>}
    />
  );

  if (error) return <div className="page">{header}<div className="alert">{error}</div></div>;
  if (!data) {
    return (
      <div className="page">
        {header}
        <div className="stat-grid three">{[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 112 }} />)}</div>
        <div className="skeleton" style={{ height: 320 }} />
      </div>
    );
  }

  const c = data.counts;
  const todo = data.todo.filter((t) => (!stage || t.stage === stage) && matches(t, q));
  const submitted = data.submitted.filter((t) => matches(t, q));
  const received = (data.received || []).filter((t) => matches(t, q));
  const completed = data.completed.filter((t) => matches(t, q));
  const searching = Boolean(q || stage);
  const tiles = [
    { key: 'new', label: 'New tasks', caption: 'Assigned, not started', icon: <IconDraft size={18} />, count: c.new, tone: 'blue' },
    { key: 'submitted', label: 'In review', caption: 'Submitted, not opened yet', icon: <IconCheck size={18} />, count: c.submitted, tone: 'amber' },
    { key: 'received', label: 'With the superadmin', caption: 'Opened by the superadmin', icon: <IconCheck size={18} />, count: c.received || 0, tone: 'blue' },
  ];

  return (
    <div className="page">
      {header}

      {c.returned > 0 && (
        <a href="#my-tasks" className="banner banner-red">
          <span className="banner-dot" />
          <span><strong>{c.returned} sheet{c.returned === 1 ? '' : 's'}</strong> sent back by the superadmin. Please make the changes and resubmit.</span>
          <span className="banner-cta">View <IconChevron size={16} /></span>
        </a>
      )}

      <section className="stat-grid three">
        {tiles.map((t) => (
          <div key={t.key} className={`stat tone-${t.tone}`}>
            <div className="stat-top">
              <span className="stat-label">{t.label}</span>
              <span className="stat-icon">{t.icon}</span>
            </div>
            <div className="stat-value">{t.count}</div>
            <div className="stat-foot"><span>{t.caption}</span></div>
          </div>
        ))}
      </section>

      <section className="card flush" id="my-tasks">
        <div className="card-head">
          <h2>My tasks</h2>
          {data.todo.length > 0 && <span className="muted small">{searching ? `${todo.length} of ${data.todo.length}` : 'Most urgent first'}</span>}
        </div>
        {(data.todo.length + data.submitted.length + (data.received || []).length + data.completed.length) > 0 && (
          <div className={`card-toolbar  task-toolbar${data.todo.length <= 5 && !q ? ' few' : ''}`}>
            <SearchBox value={q} onSearch={setQ} delay={150} label="Search my tasks" placeholder="Search applicant, reference, phone, address…" />
            {data.todo.length > 0 && (
              <Segmented
                label="Task stage"
                options={TASK_TABS.map(([value, label]) => ({ value, label }))}
                value={stage}
                onChange={setStage}
              />
            )}
          </div>
        )}
        {data.todo.length > 0 && todo.length === 0 ? (
          <div className="empty">
            <strong>No tasks match</strong>
            <p className="muted">Try a different search or stage.</p>
            <button type="button" className="btn" onClick={() => { setQ(''); setStage(''); }}>Clear</button>
          </div>
        ) : data.todo.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><IconCheck size={24} /></div>
            <strong>No tasks right now</strong>
            <p className="muted">When the superadmin assigns you an input sheet, it appears here.</p>
          </div>
        ) : (
          <ol className="task-list">{todo.map((t) => <TaskRow key={t._id} t={t} />)}</ol>
        )}
      </section>

      <div className="grid-2">
        <section className="card flush">
          <div className="card-head"><h2>In review</h2><span className="muted small">Not opened by the superadmin yet</span></div>
          {submitted.length === 0 ? (
            <p className="muted card-empty">{data.submitted.length ? 'No sheets in review match your search.' : 'Nothing in review. A sheet you submit waits here until the superadmin opens it.'}</p>
          ) : (
            <ul className="list">
              {submitted.map((t) => (
                <li key={t._id}>
                  <Link to={`/valuations/${t._id}`} className="list-item">
                    <span className="list-main">
                      <strong>{t.applicantName}</strong>
                      <small>{`${t.referenceNo} · ${t.updatedAfterReceived ? 'updated' : 'submitted'} ${timeAgo(t.submittedAt || t.updatedAt)}`}</small>
                    </span>
                    <StageChip stage="submitted" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card flush">
          <div className="card-head"><h2>With the superadmin</h2><span className="muted small">Opened; you can edit until the report</span></div>
          {received.length === 0 ? (
            <p className="muted card-empty">{(data.received || []).length ? 'No sheets match your search.' : 'A sheet moves here as soon as the superadmin opens it.'}</p>
          ) : (
            <ul className="list">
              {received.map((t) => (
                <li key={t._id}>
                  <Link to={`/valuations/${t._id}`} className="list-item">
                    <span className="list-main">
                      <strong>{t.applicantName}</strong>
                      <small>{`${t.referenceNo} · opened by ${t.receivedBy || 'the superadmin'} ${timeAgo(t.receivedAt || t.updatedAt)}`}</small>
                    </span>
                    <StageChip stage="received" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card flush">
          <div className="card-head">
            <h2>Recently completed</h2>
            {c.approved > 0 && <Link to="/valuations?status=approved" className="link-sm">View all <IconChevron size={14} /></Link>}
          </div>
          {completed.length === 0 ? (
            <p className="muted card-empty">{data.completed.length ? 'No completed sheets match your search.' : 'Sheets appear here once their report is generated.'}</p>
          ) : (
            <ul className="list">
              {completed.map((t) => (
                <li key={t._id}>
                  <Link to={`/valuations/${t._id}`} className="list-item">
                    <span className="list-main">
                      <strong>{t.applicantName}</strong>
                      <small>{t.referenceNo} · {t.reportedAt ? `report generated ${timeAgo(t.reportedAt)}` : `completed ${timeAgo(t.reviewedAt || t.updatedAt)}`}</small>
                    </span>
                    <span className="list-end"><strong className="amount">{t.fairMarketValue > 0 ? inr(t.fairMarketValue) : '—'}</strong></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
