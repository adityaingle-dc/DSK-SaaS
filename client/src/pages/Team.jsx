import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { inr } from '../components/StatusBadge.jsx';
import { initials } from '../components/Layout.jsx';
import TableSkeleton from '../components/TableSkeleton.jsx';
import Modal, { TempPasswordNotice } from '../components/Modal.jsx';
import { IconPlus } from '../components/Icons.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Segmented from '../components/Segmented.jsx';
import { DuoUsers } from '../components/DuoIcons.jsx';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '../context/AuthContext.jsx';
import Fab from '../components/Fab.jsx';
import CollapsibleSearch from '../components/CollapsibleSearch.jsx';
import SearchBox from '../components/SearchBox.jsx';
import { duration, timeAgo } from '../utils/format.js';

// [value, label, short label on phones]
const TABS = [['', 'All', 'All'], ['active', 'Active', 'Active'], ['pending', 'Pending approval', 'Pending'], ['disabled', 'Disabled', 'Disabled']];
const EMPTY_FORM = { name: '', email: '', phone: '', branch: '', role: 'evaluator' };

export function UserStatus({ status }) {
  const label = { active: 'Active', pending: 'Pending', disabled: 'Disabled' }[status] || status;
  const cls = { active: 'approved', pending: 'submitted', disabled: 'rejected' }[status] || 'draft';
  return <span className={`status status-${cls}`}><span className="dot" />{label}</span>;
}

export default function Team() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const q = params.get('q') || '';
  const role = params.get('role') || '';
  // change one filter, keep the others (empty values are dropped from the URL)
  const setFilter = (patch, opts = { replace: true }) => {
    const next = { status, q, role, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), opts);
  };
  const filtered = Boolean(status || q || role);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.listUsers({ status, q, role }).then(setData).catch((e) => setError(e.message));
  }, [status, q, role]);

  useEffect(load, [load]);

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
      <PageHeader
        icon={DuoUsers}
        title="Team"
        actions={(
          <div className="lp-head">
            <SearchBox className="desktop-only" value={q} onSearch={(v) => setFilter({ q: v })} label="Search team" placeholder="Search name, email, phone, branch, employee ID…" />
            <button className="btn primary desktop-only" onClick={() => setShowAdd(true)}><IconPlus size={16} /> Add member</button>
          </div>
        )}
      />
      <Fab label="Add member" onClick={() => setShowAdd(true)} />

      {/* phones hide these: the status tabs below carry the same counts */}
      <div className="kpis team-kpis">
        <Kpi label="Active members" value={counts.active || 0} />
        <Kpi label="Pending approval" value={counts.pending || 0} tone={counts.pending ? 'amber' : ''} />
        <Kpi label="Disabled" value={counts.disabled || 0} />
        <Kpi label="Team input sheets" value={items.reduce((s, u) => s + u.stats.total, 0)} />
      </div>

      <div className="toolbar team-toolbar">
        <CollapsibleSearch className="csearch-mobile" value={q} onSearch={(v) => setFilter({ q: v })} label="Search team" placeholder="Search name, email, phone, branch, employee ID…" />
        <select className="select-pill team-role-mobile" aria-label="Role" value={role} onChange={(e) => setFilter({ role: e.target.value }, {})}>
          <option value="">All roles</option>
          {ASSIGNABLE_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      <div className="toolbar-row team-tabs-row">
        <Segmented
          label="Member status"
          options={TABS.map(([value, label, short]) => {
            const n = value ? counts[value] || 0 : (counts.active || 0) + (counts.pending || 0) + (counts.disabled || 0);
            return {
              value,
              label: <><span className="lbl-long">{label}</span><span className="lbl-short">{short}</span></>,
              // pending is highlighted; the others show their count on phones (where the tiles are hidden)
              badge: value === 'pending'
                ? n > 0 && <span className="tab-count">{n}</span>
                : data && <span className="tab-num tab-num-mobile">{n}</span>,
            };
          })}
          value={status}
          onChange={(value) => setFilter({ status: value })}
        />
        <select className="select-pill desktop-only team-role-desktop" aria-label="Role" value={role} onChange={(e) => setFilter({ role: e.target.value }, {})}>
          <option value="">All roles</option>
          {ASSIGNABLE_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {data && (
          <span className="result-count" aria-live="polite">
            <span><b>{items.length}</b> member{items.length === 1 ? '' : 's'}<span className="mobile-inline"> · <b>{items.reduce((s, u) => s + u.stats.total, 0)}</b> input sheets</span></span>
            {filtered && <button type="button" className="linklike" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}
          </span>
        )}
      </div>

      {error && <div className="alert">{error}</div>}

      {data && items.length === 0 ? (
        <div className="card empty">
          <strong>{q ? <>No members match “{q}”</> : 'No members here'}</strong>
          <p className="muted">Try another search or filter, or add a member.</p>
          {filtered && <button type="button" className="btn" onClick={() => setParams({}, { replace: true })}>Clear filters</button>}
        </div>
      ) : (
        <div className="card flush">
          <div className="table-wrap desktop-only">
            <table className="table">
              <thead>
                <tr>
                  <th>Member</th><th className="col-opt2">Role</th><th className="col-opt">Branch</th><th className="num">Input sheets</th><th className="num col-opt2">Approval</th>
                  <th className="num col-opt" title="Average time from assignment to submission">Avg. submit</th><th className="col-opt">Last active</th><th>Status</th><th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {!data && <TableSkeleton cols={9} />}
                {items.map((u) => (
                  <tr key={u._id} className="clickable" onClick={() => navigate(`/team/${u._id}`)}>
                    <td>
                      <div className="cell-person">
                        <span className="avatar soft sm">{initials(u.name)}</span>
                        <span><span className="name-line"><Link to={`/team/${u._id}`} onClick={(e) => e.stopPropagation()}><strong>{u.name}</strong></Link>{u.code && <span className="id-code id-inline">{u.code}</span>}</span><small className="muted block">{u.email}</small></span>
                      </div>
                    </td>
                    <td className="nowrap col-opt2">{ROLE_LABELS[u.role]}</td>
                    <td className="col-opt">{u.branch || '—'}</td>
                    <td className="num">
                      <strong>{u.stats.total}</strong>
                      <small className="muted block">{u.stats.approved} approved · {u.stats.rejected} rejected</small>
                    </td>
                    <td className="num col-opt2">{u.stats.approvalRate == null ? '—' : `${u.stats.approvalRate}%`}</td>
                    <td className="num col-opt">{duration(u.stats.avgSubmitHours)}</td>
                    <td className="muted nowrap col-opt">{timeAgo(u.lastActiveAt)}</td>
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
                    <small>{[u.code, ROLE_LABELS[u.role], u.branch].filter(Boolean).join(' · ')}</small>
                    <small>{u.stats.total} input sheets · active {timeAgo(u.lastActiveAt)}</small>
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
                    {ASSIGNABLE_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
              </div>
              <label>Branch<input value={form.branch} onChange={(e) => setForm({ ...form, branch: e.target.value })} /></label>
              <p className="muted small">An employee ID (DSK-EMP-…) and a temporary password are generated. The member sets their own password on first sign-in.</p>
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
