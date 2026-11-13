import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { inr } from '../components/StatusBadge.jsx';
import { initials } from '../components/Layout.jsx';
import Modal, { TempPasswordNotice } from '../components/Modal.jsx';
import { IconPlus, IconSearch } from '../components/Icons.jsx';
import { ROLE_LABELS } from '../context/AuthContext.jsx';
import { duration, timeAgo } from '../utils/format.js';

const TABS = [['', 'All'], ['active', 'Active'], ['pending', 'Pending approval'], ['disabled', 'Disabled']];
const EMPTY_FORM = { name: '', email: '', phone: '', branch: '', employeeId: '', role: 'evaluator' };

export function UserStatus({ status }) {
  const label = { active: 'Active', pending: 'Pending', disabled: 'Disabled' }[status] || status;
  const cls = { active: 'approved', pending: 'submitted', disabled: 'rejected' }[status] || 'draft';
  return <span className={`status status-${cls}`}><span className="dot" />{label}</span>;
}

export default function Team() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.listUsers({ status, q }).then(setData).catch((e) => setError(e.message));
  }, [status, q]);

  useEffect(load, [status]); // eslint-disable-line react-hooks/exhaustive-deps

  const approve = async (e, u) => {
    e.stopPropagation();
    try {
      await api.updateUser(u._id, { status: 'active' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const submitAdd = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.createUser(form);
      setCreated({ email: res.user.email, password: res.tempPassword });
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const closeAdd = () => {
    setShowAdd(false);
    setCreated(null);
  };

  const counts = data?.counts || {};
  const items = data?.items || [];

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <p className="muted">Manage field evaluators and reviewers, and track their work</p>
        </div>
        <button className="btn primary" onClick={() => setShowAdd(true)}><IconPlus size={18} /> Add member</button>
      </div>

      <div className="kpis">
        <Kpi label="Active members" value={counts.active || 0} />
        <Kpi label="Pending approval" value={counts.pending || 0} tone={counts.pending ? 'amber' : ''} />
        <Kpi label="Disabled" value={counts.disabled || 0} />
        <Kpi label="Team valuations" value={items.reduce((s, u) => s + u.stats.total, 0)} />
      </div>

      <div className="toolbar">
        <form className="search" onSubmit={(e) => { e.preventDefault(); load(); }}>
          <IconSearch size={18} />
          <input placeholder="Search name, email, branch, employee ID…" value={q} onChange={(e) => setQ(e.target.value)} onBlur={load} />
        </form>
      </div>

      <div className="segmented" role="tablist">
        {TABS.map(([value, label]) => (
          <button key={label} role="tab" aria-selected={status === value} className={status === value ? 'on' : ''} onClick={() => setParams(value ? { status: value } : {})}>
            {label}
            {value === 'pending' && counts.pending > 0 && <span className="tab-count">{counts.pending}</span>}
          </button>
        ))}
      </div>

      {error && <div className="alert">{error}</div>}

      {data && items.length === 0 ? (
        <div className="card empty"><strong>No members here</strong><p className="muted">Try another filter, or add a member.</p></div>
      ) : (
        <div className="card flush">
          <div className="table-wrap desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th><th>Role</th><th>Branch</th><th className="num">Valuations</th><th className="num">Approval</th>
                  <th className="num">Avg. time to submit</th><th>Last active</th><th>Status</th><th />
                </tr>
              </thead>
              <tbody>
                {items.map((u) => (
                  <tr key={u._id} className="clickable" onClick={() => navigate(`/team/${u._id}`)}>
                    <td>
                      <div className="cell-person">
                        <span className="avatar soft sm">{initials(u.name)}</span>
                        <span><Link to={`/team/${u._id}`} onClick={(e) => e.stopPropagation()}><strong>{u.name}</strong></Link><small className="muted block">{u.email}</small></span>
                      </div>
                    </td>
                    <td className="nowrap">{ROLE_LABELS[u.role]}</td>
                    <td>{u.branch || '—'}{u.employeeId && <small className="muted block">{u.employeeId}</small>}</td>
                    <td className="num">
                      <strong>{u.stats.total}</strong>
                      <small className="muted block nowrap">{u.stats.approved} approved · {u.stats.rejected} rejected</small>
                    </td>
                    <td className="num">{u.stats.approvalRate == null ? '—' : `${u.stats.approvalRate}%`}</td>
                    <td className="num">{duration(u.stats.avgSubmitHours)}</td>
                    <td className="muted nowrap">{timeAgo(u.lastActiveAt)}</td>
                    <td><UserStatus status={u.status} /></td>
                    <td className="num">
                      {u.status === 'pending' && <button className="btn small primary" onClick={(e) => approve(e, u)}>Approve</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="list mobile-only">
            {items.map((u) => (
              <li key={u._id}>
                <Link to={`/team/${u._id}`} className="list-item">
                  <span className="avatar soft">{initials(u.name)}</span>
                  <span className="list-main">
                    <strong>{u.name}</strong>
                    <small>{ROLE_LABELS[u.role]} · {u.branch || u.email}</small>
                    <small>{u.stats.total} valuations · active {timeAgo(u.lastActiveAt)}</small>
                  </span>
                  <span className="list-end">
                    <UserStatus status={u.status} />
                    {u.status === 'pending' && <button className="btn small primary" onClick={(e) => { e.preventDefault(); approve(e, u); }}>Approve</button>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showAdd && (
        <Modal title={created ? 'Member added' : 'Add team member'} onClose={closeAdd}>
          {created ? (
            <TempPasswordNotice email={created.email} password={created.password} />
          ) : (
            <form className="stack" onSubmit={submitAdd}>
              <label>Full name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label>Email<input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
              <div className="row">
                <label>Phone<input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
                <label>Role
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
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
              <p className="muted small">A temporary password is generated. The member sets their own password on first sign-in.</p>
              <button className="btn primary block" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
            </form>
          )}
        </Modal>
      )}
    </div>
  );
}

function Kpi({ label, value, tone }) {
  return (
    <div className={`kpi${tone ? ` tone-${tone}` : ''}`}>
      <div className="kpi-value">{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export { Kpi };
