import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { api } from '../api/client.js';
import { ROLE_LABELS, useAuth } from '../context/AuthContext.jsx';
import { IconChevron, IconChevronDown, IconKey, IconLogout } from './Icons.jsx';
import Brand from './Brand.jsx';
import PoweredBy from './PoweredBy.jsx';
import { DuoArea, DuoContact, DuoHome, DuoList, DuoPulse, DuoReport, DuoUsers } from './DuoIcons.jsx';
import { SearchProvider } from './GlobalSearch.jsx';

const IconMoreGrid = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" fill="currentColor" fillOpacity="0.15" />
  </svg>
);

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

// Phones: "More" tab opens a bottom sheet with the pages that don't fit in the tab bar
function MoreSheet({ open, onClose, items, user, logout }) {
  const { pathname } = useLocation();
  useEffect(() => { if (open) onClose(); /* close on navigation */ }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.classList.add('sheet-open');
    return () => { document.removeEventListener('keydown', onKey); document.body.classList.remove('sheet-open'); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="more-sheet-wrap" role="dialog" aria-modal="true" aria-label="More">
      <button type="button" className="more-backdrop" aria-label="Close" onClick={onClose} />
      <div className="more-sheet">
        <span className="more-grip" aria-hidden="true" />
        <div className="more-brand"><Brand height={18} caption={null} /></div>
        <div className="more-user">
          <span className="avatar">{initials(user.name)}</span>
          <span><strong>{user.name}</strong><small>{ROLE_LABELS[user.role]} · {user.email}</small></span>
        </div>
        <nav className="more-links">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}>
              <span className="more-icon">{it.icon}</span>
              <span className="more-label">{it.label}</span>
              {it.badge}
              <IconChevron size={16} className="more-caret" />
            </NavLink>
          ))}
        </nav>
        <div className="more-account">
          <Link to="/change-password"><IconKey size={16} /> Change password</Link>
          <button type="button" className="menu-danger" onClick={logout}><IconLogout size={16} /> Log out</button>
        </div>
        <PoweredBy className="more-powered" />
      </div>
    </div>
  );
}

export default function Layout() {
  const { user, logout, isSuperadmin, isDrafter } = useAuth();
  const { pathname } = useLocation();
  const [pending, setPending] = useState(0);
  const [queue, setQueue] = useState(0); // site inspections waiting for a drafter
  const [awaiting, setAwaiting] = useState(0); // reports waiting for the superadmin's approval
  const [backToMe, setBackToMe] = useState(0); // drafter: reports the superadmin sent back

  // badges (refreshed on navigation)
  useEffect(() => {
    if (isSuperadmin) {
      api.listUsers({ status: 'pending' }).then((r) => setPending(r.counts?.pending || 0)).catch(() => {});
      api.stats({}).then((s) => { setQueue(s.byStatus?.submitted || 0); setAwaiting(s.byStatus?.pending || 0); }).catch(() => {});
    } else if (isDrafter) {
      api.draftingTasks().then((r) => { setQueue(r.counts?.queue || 0); setBackToMe(r.counts?.returned || 0); }).catch(() => {});
    }
  }, [isSuperadmin, isDrafter, pathname]);

  // evaluators: number of tasks needing action (new + returned)
  const isEvaluator = user.role === 'evaluator';
  const [taskCount, setTaskCount] = useState(0);
  useEffect(() => {
    if (!isEvaluator) return;
    api.myTasks().then((r) => setTaskCount((r.counts?.new || 0) + (r.counts?.returned || 0))).catch(() => {});
  }, [isEvaluator, pathname]);
  const homeCount = isEvaluator ? taskCount : isDrafter ? backToMe : 0;
  const taskBadge = homeCount > 0 && <span className="nav-badge" title={isDrafter ? 'Reports sent back to you' : 'Tasks needing action'}>{homeCount}</span>;

  // phones (superadmin): pages behind the "More" tab
  const [moreOpen, setMoreOpen] = useState(false);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const moreItems = [
    { to: '/area', label: 'Area calculator', icon: <DuoArea size={20} /> },
    { to: '/team', label: 'Team', icon: <DuoUsers size={20} />, badge: pending > 0 && <span className="nav-badge">{pending}</span> },
    { to: '/activity', label: 'Activity', icon: <DuoPulse size={20} /> },
  ];
  const moreActive = /^\/(area|team|activity|change-password)/.test(pathname);

  const badge = pending > 0 && <span className="nav-badge">{pending}</span>;
  const sheetsBadge = (isSuperadmin || isDrafter) && queue > 0 && <span className="nav-badge" title="Site inspections waiting for a drafter">{queue}</span>;
  const reportsBadge = isSuperadmin && awaiting > 0 && <span className="nav-badge" title="Reports waiting for your approval">{awaiting}</span>;

  return (
    <SearchProvider>
    <div className={`shell${isSuperadmin ? ' is-super' : ''}`}>
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="DSKRISHNA – home">
          <Brand height={21} />
        </Link>
        <nav className="side-nav">
          <div className="nav-section">Workspace</div>
          <NavLink to="/" end><DuoHome size={19} /> Dashboard {taskBadge}</NavLink>
          {!isDrafter && <NavLink to="/customers"><DuoContact size={19} /> {isSuperadmin ? 'Customers' : 'My customers'}</NavLink>}
          <NavLink to="/valuations" end><DuoList size={19} /> Site Inspections {sheetsBadge}</NavLink>
          {(isSuperadmin || isDrafter) && <NavLink to="/reports"><DuoReport size={19} /> Reports {reportsBadge}</NavLink>}
          <NavLink to="/area"><DuoArea size={19} /> Area calculator</NavLink>
          {isSuperadmin && (
            <>
              <div className="nav-section">Administration</div>
              <NavLink to="/team"><DuoUsers size={19} /> Team {badge}</NavLink>
              <NavLink to="/activity"><DuoPulse size={19} /> Activity</NavLink>
            </>
          )}
        </nav>
        <UserMenu user={user} logout={logout} />
        <PoweredBy className="side-powered" />
      </aside>

      <main className="content">
        <Outlet />
      </main>

      <nav className="tabbar">
        <NavLink to="/" end><span className="tab-icon"><DuoHome size={22} />{taskBadge}</span><span>Home</span></NavLink>
        {isSuperadmin ? (
          <>
            <NavLink to="/customers"><DuoContact size={22} /><span>Customers</span></NavLink>
            <NavLink to="/valuations" end><span className="tab-icon"><DuoList size={22} />{sheetsBadge}</span><span>Sheets</span></NavLink>
            <NavLink to="/reports"><span className="tab-icon"><DuoReport size={22} />{reportsBadge}</span><span>Reports</span></NavLink>
            <button type="button" className={`tab-more${moreActive ? ' active' : ''}`} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
              <span className="tab-icon"><IconMoreGrid />{pending > 0 && <span className="nav-badge">{pending}</span>}</span><span>More</span>
            </button>
          </>
        ) : isDrafter ? (
          <>
            <NavLink to="/valuations" end><span className="tab-icon"><DuoList size={22} />{sheetsBadge}</span><span>Sheets</span></NavLink>
            <NavLink to="/reports"><DuoReport size={22} /><span>Reports</span></NavLink>
            <NavLink to="/area"><DuoArea size={22} /><span>Area</span></NavLink>
          </>
        ) : (
          <>
            <NavLink to="/customers"><DuoContact size={22} /><span>Customers</span></NavLink>
            <NavLink to="/valuations" end><DuoList size={22} /><span>Site visits</span></NavLink>
            <NavLink to="/area"><DuoArea size={22} /><span>Area</span></NavLink>
          </>
        )}
      </nav>
      {isSuperadmin && <MoreSheet open={moreOpen} onClose={closeMore} items={moreItems} user={user} logout={logout} />}
    </div>
    </SearchProvider>
  );
}
