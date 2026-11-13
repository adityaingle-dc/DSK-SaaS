import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { inr } from '../components/StatusBadge.jsx';
import { initials } from '../components/Layout.jsx';
import ActivityItem from '../components/ActivityItem.jsx';
import Modal, { TempPasswordNotice } from '../components/Modal.jsx';
import { ROLE_LABELS, useAuth } from '../context/AuthContext.jsx';
import { dateTime, duration, timeAgo } from '../utils/format.js';
import { Kpi, UserStatus } from './Team.jsx';

function last30Days(activeDays) {
  const counts = Object.fromEntries(activeDays.map((d) => [d._id, d.n]));
  return Array.from({ length: 30 }, (_, i) => {
    const d = new Date(Date.now() - (29 - i) * 864e5);
    const key = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    return { key, n: counts[key] || 0, label: d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) };
  });
}

export default function TeamMember() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'edit' | 'reset' | 'disable'
  const [form, setForm] = useState({});
  const [temp, setTemp] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api.getUser(id).then(setData).catch((e) => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  const days = useMemo(() => (data ? last30Days(data.activeDays) : []), [data]);

  if (error && !data) return <div className="alert">{error}</div>;
  if (!data) return <div className="page"><div className="skeleton" style={{ height: 160 }} /><div className="skeleton" style={{ height: 300 }} /></div>;

  const { user: u, stats, activity } = data;
  const isSelf = String(u._id) === String(me._id);
  const maxDay = Math.max(1, ...days.map((d) => d.n));

  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (status) => run(async () => { await api.updateUser(u._id, { status }); setModal(null); });
  const saveEdit = (e) => {
    e.preventDefault();
    run(async () => { await api.updateUser(u._id, form); setModal(null); });
  };
  const reset = () => run(async () => setTemp((await api.resetPassword(u._id)).tempPassword));

  return (
    <div className="page">
      <Link to="/team" className="link-sm">‹ Team</Link>

      <section className="card profile">
        <span className="avatar xl">{initials(u.name)}</span>
        <div className="profile-main">
          <h1>{u.name} <UserStatus status={u.status} /></h1>
          <p className="muted">{ROLE_LABELS[u.role]}{u.branch && ` · ${u.branch}`}{u.employeeId && ` · ${u.employeeId}`}</p>
          <p className="profile-contact">
            <a href={`mailto:${u.email}`}>{u.email}</a>
            {u.phone && <a href={`tel:${u.phone}`}>{u.phone}</a>}
          </p>
          <p className="muted small">
            Joined {dateTime(u.createdAt)}{u.createdBy && ` · added by ${u.createdBy.name}`}{u.approvedBy && ` · approved by ${u.approvedBy.name}`}
            {' · '}last sign-in {timeAgo(u.lastLoginAt)} · last active {timeAgo(u.lastActiveAt)}
          </p>
        </div>
        <div className="actions profile-actions">
          {u.status === 'pending' && <button className="btn primary" disabled={busy} onClick={() => setStatus('active')}>Approve</button>}
          {u.status === 'disabled' && <button className="btn primary" disabled={busy} onClick={() => setStatus('active')}>Re-enable</button>}
          <button className="btn" onClick={() => { setForm({ name: u.name, phone: u.phone || '', branch: u.branch || '', employeeId: u.employeeId || '', role: u.role }); setModal('edit'); }}>Edit</button>
          <button className="btn" onClick={() => { setTemp(null); setModal('reset'); }}>Reset password</button>
          {u.status === 'active' && !isSelf && <button className="btn danger" onClick={() => setModal('disable')}>Disable</button>}
        </div>
      </section>

      {error && <div className="alert">{error}</div>}

      <div className="kpis">
        <Kpi label="Valuations" value={stats.total} />
        <Kpi label="Approved" value={stats.approved} tone="green" />
        <Kpi label="Rejected" value={stats.rejected} tone={stats.rejected ? 'red' : ''} />
        <Kpi label="In review / drafts" value={`${stats.submitted} / ${stats.draft}`} />
        <Kpi label="Approval rate" value={stats.approvalRate == null ? '—' : `${stats.approvalRate}%`} />
        <Kpi label="Avg. time to submit" value={duration(stats.avgSubmitHours)} />
        <Kpi label="Avg. review wait" value={duration(stats.avgReviewHours)} />
        <Kpi label="Value handled" value={inr(stats.totalValue)} />
      </div>

      <div className="grid-2 wide-left">
        <section className="card">
          <div className="card-head">
            <h2>Activity timeline</h2>
            <span>
              <Link to={`/activity?actor=${u._id}`} className="link-sm">Full log</Link>
              {' · '}
              <Link to={`/valuations?evaluator=${u._id}`} className="link-sm">Their valuations</Link>
            </span>
          </div>
          {activity.length === 0 ? <p className="muted">No activity recorded yet.</p> : (
            <div className="act-list">{activity.map((a) => <ActivityItem key={a._id} item={a} showActor={false} />)}</div>
          )}
        </section>

        <section className="card">
          <div className="card-head"><h2>Last 30 days</h2><span className="muted small">{days.reduce((s, d) => s + d.n, 0)} actions</span></div>
          <div className="spark" aria-label="Actions per day, last 30 days">
            {days.map((d) => (
              <span key={d.key} title={`${d.label}: ${d.n} action${d.n === 1 ? '' : 's'}`} style={{ height: `${Math.max(4, (d.n / maxDay) * 100)}%` }} className={d.n ? 'on' : ''} />
            ))}
          </div>
          <div className="spark-axis"><span>{days[0]?.label}</span><span>Today</span></div>
        </section>
      </div>

      {modal === 'edit' && (
        <Modal title={`Edit ${u.name}`} onClose={() => setModal(null)}>
          <form className="stack" onSubmit={saveEdit}>
            <label>Full name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <div className="row">
              <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
              <label>Role
                <select value={form.role} disabled={isSelf} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="evaluator">Field evaluator</option>
                  <option value="admin">Valuer · Reviewer</option>
                  <option value="superadmin">Super admin</option>
                </select>
              </label>
            </div>
            <div className="row">
              <label>Branch<input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></label>
              <label>Employee ID<input value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} /></label>
            </div>
            <button className="btn primary block" disabled={busy}>Save changes</button>
          </form>
        </Modal>
      )}

      {modal === 'reset' && (
        <Modal title="Reset password" onClose={() => setModal(null)}>
          {temp ? <TempPasswordNotice email={u.email} password={temp} /> : (
            <div className="stack">
              <p>Generate a new temporary password for <strong>{u.name}</strong>? Their current password stops working immediately.</p>
              <button className="btn primary block" disabled={busy} onClick={reset}>Generate temporary password</button>
            </div>
          )}
        </Modal>
      )}

      {modal === 'disable' && (
        <Modal title="Disable account" onClose={() => setModal(null)}>
          <div className="stack">
            <p><strong>{u.name}</strong> will be signed out everywhere and won't be able to sign in. Their valuations and history are kept. You can re-enable the account at any time.</p>
            <button className="btn danger block" disabled={busy} onClick={() => setStatus('disabled')}>Disable account</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
