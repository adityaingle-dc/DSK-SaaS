import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { ROLE_LABELS, useAuth } from '../context/AuthContext.jsx';
import { IconHome, IconKey, IconList, IconLogout, IconPlus, IconPulse, IconUsers, Logo } from './Icons.jsx';

export const initials = (name = '') =>
  name.replace(/^(Sri|Smt|Miss|M\/s)\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '•';

export default function Layout() {
  const { user, logout, isSuperadmin } = useAuth();
  const { pathname } = useLocation();
  const [pending, setPending] = useState(0);

  // pending-approval badge for the superadmin (refreshed on navigation)
  useEffect(() => {
    if (!isSuperadmin) return;
    api.listUsers({ status: 'pending' }).then((r) => setPending(r.counts?.pending || 0)).catch(() => {});
  }, [isSuperadmin, pathname]);

  const badge = pending > 0 && <span className="nav-badge">{pending}</span>;

  return (
    <div className={`shell${isSuperadmin ? ' is-super' : ''}`}>
      <aside className="sidebar">
        <Link to="/" className="brand">
          <Logo />
          <span><strong>DSK</strong> Valuations</span>
        </Link>
        <nav className="side-nav">
          <NavLink to="/" end><IconHome /> Dashboard</NavLink>
          <NavLink to="/valuations" end><IconList /> Valuations</NavLink>
          {isSuperadmin && (
            <>
              <div className="nav-section">Administration</div>
              <NavLink to="/team"><IconUsers /> Team {badge}</NavLink>
              <NavLink to="/activity"><IconPulse /> Activity</NavLink>
            </>
          )}
        </nav>
        <Link to="/valuations/new" className="btn primary block"><IconPlus size={18} /> New valuation</Link>
        <div className="side-user">
          <span className="avatar">{initials(user.name)}</span>
          <span className="side-user-text">
            <strong>{user.name}</strong>
            <small>{ROLE_LABELS[user.role]}</small>
          </span>
          <span className="side-user-actions">
            <Link to="/change-password" className="btn"><IconKey size={15} /> Password</Link>
            <button className="btn" onClick={logout}><IconLogout size={15} /> Log out</button>
          </span>
        </div>
      </aside>

      <header className="mobile-top">
        <Link to="/" className="brand"><Logo size={30} /><span><strong>DSK</strong> Valuations</span></Link>
        <span className="mobile-top-actions">
          <Link to="/change-password" className="icon-btn" aria-label="Change password"><IconKey size={20} /></Link>
          <button className="icon-btn" onClick={logout} aria-label="Log out"><IconLogout size={20} /></button>
        </span>
      </header>

      <main className="content">
        <Outlet />
      </main>

      <nav className="tabbar">
        <NavLink to="/" end><IconHome /><span>Home</span></NavLink>
        {isSuperadmin && <NavLink to="/team"><span className="tab-icon"><IconUsers />{badge}</span><span>Team</span></NavLink>}
        <Link to="/valuations/new" className="fab" aria-label="New valuation"><IconPlus size={26} /></Link>
        {isSuperadmin && <NavLink to="/activity"><IconPulse /><span>Activity</span></NavLink>}
        <NavLink to="/valuations" end><IconList /><span>Valuations</span></NavLink>
      </nav>
    </div>
  );
}
