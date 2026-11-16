import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { ROLE_LABELS, useAuth } from '../context/AuthContext.jsx';
import { IconChevronDown, IconKey, IconLogout, IconPlus, Logo } from './Icons.jsx';
import { DuoHome, DuoList, DuoPulse, DuoUsers } from './DuoIcons.jsx';
import { SearchProvider } from './GlobalSearch.jsx';

export const initials = (name = '') =>
  name.replace(/^(Sri|Smt|Miss|M\/s)\.?\s*/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '•';

export function UserMenu({ user, logout, placement = 'up', compact = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { pathname } = useLocation();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={`user-menu ${placement}${compact ? ' compact' : ''}`} ref={ref}>
      <button type="button" className="user-chip" aria-haspopup="menu" aria-expanded={open} aria-label={`Account: ${user.name}`} onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{initials(user.name)}</span>
        <span className="user-chip-text">
          <strong>{user.name}</strong>
          <small>{ROLE_LABELS[user.role]}</small>
        </span>
        <IconChevronDown size={16} className="user-chip-caret" />
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <Link to="/change-password" role="menuitem"><IconKey size={16} /> Change password</Link>
          <button type="button" role="menuitem" className="menu-danger" onClick={logout}><IconLogout size={16} /> Log out</button>
        </div>
      )}
    </div>
  );
}

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
    <SearchProvider>
    <div className={`shell${isSuperadmin ? ' is-super' : ''}`}>
      <aside className="sidebar">
        <Link to="/" className="brand">
          <Logo size={32} />
          <span className="brand-text"><span><strong>DSK</strong> Valuations</span><small>Valuation desk</small></span>
        </Link>
        {pathname !== '/valuations/new' && (
          <Link to="/valuations/new" className="btn primary block side-cta"><IconPlus size={16} /> New valuation</Link>
        )}
        <nav className="side-nav">
          <div className="nav-section">Workspace</div>
          <NavLink to="/" end><DuoHome size={19} /> Dashboard</NavLink>
          <NavLink to="/valuations" end><DuoList size={19} /> Valuations</NavLink>
          {isSuperadmin && (
            <>
              <div className="nav-section">Administration</div>
              <NavLink to="/team"><DuoUsers size={19} /> Team {badge}</NavLink>
              <NavLink to="/activity"><DuoPulse size={19} /> Activity</NavLink>
            </>
          )}
        </nav>
        <UserMenu user={user} logout={logout} />
      </aside>

      <main className="content">
        <Outlet />
      </main>

      <nav className="tabbar">
        <NavLink to="/" end><DuoHome size={22} /><span>Home</span></NavLink>
        {isSuperadmin && <NavLink to="/team"><span className="tab-icon"><DuoUsers size={22} />{badge}</span><span>Team</span></NavLink>}
        <Link to="/valuations/new" className="fab" aria-label="New valuation"><IconPlus size={24} /></Link>
        {isSuperadmin && <NavLink to="/activity"><DuoPulse size={22} /><span>Activity</span></NavLink>}
        <NavLink to="/valuations" end><DuoList size={22} /><span>Valuations</span></NavLink>
      </nav>
    </div>
    </SearchProvider>
  );
}
