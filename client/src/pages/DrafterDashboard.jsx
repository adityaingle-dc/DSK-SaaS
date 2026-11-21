import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { initials, UserMenu } from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { SearchTrigger } from '../components/GlobalSearch.jsx';
import { DuoHome } from '../components/DuoIcons.jsx';
import { IconCheck, IconChevron, IconClock, IconDraft, IconEye } from '../components/Icons.jsx';
import { timeAgo } from '../utils/format.js';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// one sheet in a list: who, what, when, and the button for the next step
function Row({ v, when, action, to, note }) {
  return (
    <li>
      <Link to={to || `/valuations/${v._id}`} className="list-item">
        <span className="avatar soft">{initials(v.summary?.applicantName)}</span>
        <span className="list-main">
          <strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong>
          <small>{[v.referenceNo, v.summary?.propertyType, v.evaluator?.name && `site by ${v.evaluator.name}`, when].filter(Boolean).join(' · ')}</small>
          {note && <small className="dd-note">{note}</small>}
        </span>
        <span className="list-end">
          {v.summary?.fairMarketValue > 0 && <strong className="amount">{inr(v.summary.fairMarketValue)}</strong>}
          {action ? <span className="btn primary small">{action}</span> : <StatusBadge status={v.status} />}
        </span>
      </Link>
    </li>
  );
}

function Card({ title, hint, items, empty, render, more }) {
  return (
    <section className="card flush">
      <div className="card-head">
        <h2>{title}</h2>
        {more || (hint && <span className="muted small">{hint}</span>)}
      </div>
      {items.length === 0 ? <p className="muted card-empty">{empty}</p> : <ul className="list">{items.map(render)}</ul>}
    </section>
  );
}

// Drafters: the site inspections waiting in the shared queue (opening one takes it), the sheets they are drafting,
// reports the superadmin sent back, and reports waiting for approval
export default function DrafterDashboard() {
  const { user, logout } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.draftingTasks().then(setData).catch((e) => setError(e.message)); }, []);

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <div className="page"><div className="skeleton" style={{ height: 56, width: 280 }} /><div className="skeleton" style={{ height: 300 }} /></div>;
  const c = data.counts;
  const tiles = [
    { label: 'In queue', caption: 'Submitted site inspections', count: c.queue, icon: <IconDraft size={18} />, tone: 'amber', to: '/valuations?status=submitted' },
    { label: 'Drafting', caption: 'Sheets you are completing', count: c.drafting, icon: <IconClock size={18} />, tone: 'blue', to: '/valuations?drafter=me&status=received,returned' },
    { label: 'Sent back', caption: 'Changes asked by the superadmin', count: c.returned, icon: <IconEye size={18} />, tone: 'red', to: '/valuations?drafter=me&status=returned' },
    { label: 'Awaiting approval', caption: 'Reports with the superadmin', count: c.pending, icon: <IconCheck size={18} />, tone: 'green', to: '/reports?status=review' },
  ];
  return (
    <div className="page">
      <PageHeader
        icon={DuoHome}
        eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        title={`${greeting()}, ${user.name.split(' ')[0]}`}
        corner={(
          <div className="head-account">
            <SearchTrigger iconOnly className="head-search-icon" />
            <UserMenu user={user} logout={logout} placement="down" compact />
          </div>
        )}
        actions={<div className="head-tools desktop-only"><SearchTrigger className="head-search" /></div>}
      />

      {c.returned > 0 && (
        <Link to="/valuations?drafter=me&status=returned" className="banner">
          <span className="banner-dot" />
          <span><strong>{c.returned} report{c.returned === 1 ? '' : 's'}</strong> sent back by the superadmin. Make the changes and generate a new version.</span>
          <span className="banner-cta">Open <IconChevron size={16} /></span>
        </Link>
      )}

      <section className="stat-grid">
        {tiles.map((t) => (
          <Link key={t.label} to={t.to} className={`stat tone-${t.tone}`}>
            <div className="stat-top"><span className="stat-label">{t.label}</span><span className="stat-icon">{t.icon}</span></div>
            <div className="stat-value">{t.count || 0}</div>
            <div className="stat-foot"><span>{t.caption}</span><IconChevron size={16} className="go" /></div>
          </Link>
        ))}
      </section>

      {data.returned.length > 0 && (
        <Card
          title="Sent back to you"
          hint="Fix and generate the next version"
          items={data.returned}
          empty=""
          render={(v) => <Row key={v._id} v={v} to={`/valuations/${v._id}/edit`} action="Fix" when={`sent back ${timeAgo(v.returnedAt)}`} note={v.returnNote} />}
        />
      )}

      <div className="grid-2">
        <Card
          title="Queue"
          hint="Opening a sheet takes it for you"
          items={data.queue}
          empty="No site inspections waiting. Submitted sheets appear here."
          render={(v) => <Row key={v._id} v={v} to={`/valuations/${v._id}/edit`} action="Take" when={`submitted ${timeAgo(v.submittedAt || v.updatedAt)}`} />}
        />
        <Card
          title="Drafting"
          hint="Complete the sheet and generate the report"
          items={data.drafting}
          empty="Nothing in progress. Take a sheet from the queue."
          render={(v) => <Row key={v._id} v={v} to={`/valuations/${v._id}/edit`} action="Continue" when={v.draftReady ? 'ready to generate' : `${v.draftMissing || 0} field${v.draftMissing === 1 ? '' : 's'} to fill`} />}
        />
      </div>

      <div className="grid-2">
        <Card
          title="Awaiting approval"
          hint="With the superadmin"
          items={data.pending}
          empty="No reports waiting for approval."
          render={(v) => <Row key={v._id} v={v} when={`generated ${timeAgo(v.reportedAt)}`} />}
        />
        <Card
          title="Recently approved"
          items={data.approved}
          more={<Link to="/reports?status=approved" className="link-sm">View all <IconChevron size={14} /></Link>}
          empty="Approved reports appear here."
          render={(v) => <Row key={v._id} v={v} when={`approved ${timeAgo(v.approvedAt)}`} />}
        />
      </div>
    </div>
  );
}
