import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge, { inr } from './StatusBadge.jsx';
import { initials } from './Layout.jsx';
import { IconChevron, IconClock, IconPlus, IconSearch } from './Icons.jsx';
import { DuoContact, DuoHome, DuoKey, DuoList, DuoPulse, DuoSheet, DuoUsers } from './DuoIcons.jsx';

// ---------- open/close from anywhere (sidebar, dashboard, Ctrl/⌘+K) ----------
const SearchContext = createContext({ openSearch: () => {} });
export const useGlobalSearch = () => useContext(SearchContext);

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const SHORTCUT = isMac ? '⌘K' : 'Ctrl K';

export function SearchProvider({ children }) {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <SearchContext.Provider value={{ openSearch }}>
      {children}
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </SearchContext.Provider>
  );
}

// ---------- triggers ----------
export function SearchTrigger({ className = '' }) {
  const { openSearch } = useGlobalSearch();
  return (
    <button type="button" className={`search-trigger ${className}`} onClick={openSearch} aria-label="Search valuations and team">
      <IconSearch size={16} />
      <span>Search…</span>
      <kbd>{SHORTCUT}</kbd>
    </button>
  );
}

// ---------- recent searches (per browser, best effort) ----------
const RECENT_KEY = 'dsk_recent_searches';
const readRecent = () => {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { return []; }
};
const saveRecent = (q) => {
  try {
    const list = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* storage unavailable */ }
};

// ---------- the dialog ----------
function SearchDialog({ onClose }) {
  const navigate = useNavigate();
  const { isSuperadmin } = useAuth();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const reqId = useRef(0);
  const [q, setQ] = useState('');
  const [found, setFound] = useState({ valuations: [], members: [], customers: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [recent] = useState(readRecent);
  const term = q.trim();

  // lock page scroll + focus the input
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => { document.body.style.overflow = ''; };
  }, []);

  // search as you type (short debounce; stale responses are ignored)
  useEffect(() => {
    if (term.length < 2) {
      setFound({ valuations: [], members: [], customers: [], total: 0 });
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const [v, m, c] = await Promise.all([
          api.listValuations({ q: term, limit: 6 }),
          isSuperadmin ? api.listUsers({ q: term }) : Promise.resolve({ items: [] }),
          isSuperadmin ? api.listCustomers({ q: term, limit: 5 }) : Promise.resolve({ items: [] }),
        ]);
        if (id !== reqId.current) return;
        setFound({ valuations: v.items || [], members: (m.items || []).slice(0, 5), customers: (c.items || []).slice(0, 5), total: v.total || 0 });
      } catch {
        if (id === reqId.current) setFound({ valuations: [], members: [], customers: [], total: 0 });
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [term, isSuperadmin]);

  const actions = useMemo(() => {
    const all = [
      ...(isSuperadmin ? [{ label: 'New valuation', to: '/valuations/new', icon: <IconPlus size={18} />, keywords: 'create add start sheet' }] : []),
      { label: 'Dashboard', to: '/', icon: <DuoHome size={18} />, keywords: 'home overview' },
      { label: 'All valuations', to: '/valuations', icon: <DuoList size={18} />, keywords: 'list sheets' },
      { label: 'Drafts', to: '/valuations?status=draft', icon: <DuoList size={18} />, keywords: 'draft unfinished' },
      { label: 'In review', to: '/valuations?status=submitted', icon: <DuoList size={18} />, keywords: 'submitted pending review' },
      { label: 'Approved', to: '/valuations?status=approved', icon: <DuoList size={18} />, keywords: 'approved signed' },
      { label: 'Rejected', to: '/valuations?status=rejected', icon: <DuoList size={18} />, keywords: 'rejected returned' },
      ...(isSuperadmin ? [
        { label: 'Customers', to: '/customers', icon: <DuoContact size={18} />, keywords: 'clients enquiry customer contacts' },
        { label: 'Reports', to: '/reports', icon: <DuoSheet size={18} />, keywords: 'reports generated stored pdf print' },
        { label: 'Generate report', to: '/reports/new', icon: <DuoSheet size={18} />, keywords: 'generate create report bank print' },
        { label: 'Team', to: '/team', icon: <DuoUsers size={18} />, keywords: 'members users staff' },
        { label: 'Pending approvals', to: '/team?status=pending', icon: <DuoUsers size={18} />, keywords: 'approve signup accounts' },
        { label: 'Activity', to: '/activity', icon: <DuoPulse size={18} />, keywords: 'audit log feed report' },
      ] : []),
      { label: 'Change password', to: '/change-password', icon: <DuoKey size={18} />, keywords: 'password security account' },
    ];
    if (!term) return all.slice(0, 5);
    const t = term.toLowerCase();
    return all.filter((a) => a.label.toLowerCase().includes(t) || a.keywords.includes(t)).slice(0, 4);
  }, [term, isSuperadmin]);

  // one flat list for keyboard navigation; groups are just labels between items
  const groups = useMemo(() => {
    const g = [];
    if (!term && recent.length) {
      g.push({ title: 'Recent searches', items: recent.map((r) => ({ id: `r:${r}`, kind: 'recent', label: r, run: () => setQ(r) })) });
    }
    if (found.valuations.length) {
      const items = found.valuations.map((v) => ({
        id: `v:${v._id}`, kind: 'valuation', v, to: `/valuations/${v._id}`,
      }));
      if (found.total > found.valuations.length) {
        items.push({ id: 'v:all', kind: 'all', label: `See all ${found.total.toLocaleString('en-IN')} results`, to: `/valuations?q=${encodeURIComponent(term)}` });
      }
      g.push({ title: 'Valuations', items });
    }
    if (found.customers.length) {
      g.push({ title: 'Customers', items: found.customers.map((c) => ({ id: `c:${c._id}`, kind: 'customer', c, to: `/customers/${c._id}` })) });
    }
    if (found.members.length) {
      g.push({ title: 'Team members', items: found.members.map((u) => ({ id: `u:${u._id}`, kind: 'member', u, to: `/team/${u._id}` })) });
    }
    if (actions.length) g.push({ title: term ? 'Actions' : 'Quick actions', items: actions.map((a) => ({ id: `a:${a.to}`, kind: 'action', a, to: a.to })) });
    return g;
  }, [term, recent, found, actions]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(0), [term, found]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const choose = (item) => {
    if (!item) return;
    if (item.run) return item.run();
    if (term && item.kind !== 'action') saveRecent(term);
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(flat.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(flat[active]); }
  };

  let index = -1;
  const noResults = term.length >= 2 && !loading && !found.valuations.length && !found.members.length && !found.customers.length && !actions.length;

  return (
    <div className="gs-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gs-panel" role="dialog" aria-modal="true" aria-label="Search">
        <div className="gs-input">
          <IconSearch size={18} />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={isSuperadmin ? 'Search valuations, customers, team or actions…' : 'Search valuations or actions…'}
            role="combobox"
            aria-expanded="true"
            aria-controls="gs-results"
            aria-activedescendant={flat[active] ? `gs-${active}` : undefined}
            autoComplete="off"
            spellCheck="false"
          />
          {loading && <span className="gs-spinner" aria-label="Searching" />}
          <button type="button" className="gs-close" onClick={onClose} aria-label="Close search"><span className="desktop-only">Esc</span><span className="mobile-only">Cancel</span></button>
        </div>

        <div className="gs-results" id="gs-results" role="listbox" ref={listRef}>
          {term.length === 1 && <p className="gs-hint">Keep typing to search…</p>}
          {noResults && (
            <div className="gs-empty">
              <strong>No matches for “{term}”</strong>
              <span>Try an applicant name, reference number, phone or branch.</span>
            </div>
          )}
          {groups.map((g) => (
            <div className="gs-group" key={g.title}>
              <div className="gs-group-title">{g.title}</div>
              {g.items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={item.id}
                    id={`gs-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    className={`gs-item${i === active ? ' on' : ''}`}
                    onMouseMove={() => i !== active && setActive(i)}
                    onClick={() => choose(item)}
                  >
                    <ResultRow item={item} />
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="gs-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> open</span>
          <span><kbd>Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({ item }) {
  switch (item.kind) {
    case 'valuation': {
      const { v } = item;
      return (
        <>
          <span className="avatar soft sm">{initials(v.summary?.applicantName)}</span>
          <span className="gs-main">
            <strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong>
            <small>{[v.referenceNo, v.summary?.branch, v.summary?.reportTemplate].filter(Boolean).join(' · ')}</small>
          </span>
          <span className="gs-end">
            {v.summary?.fairMarketValue > 0 && <span className="gs-amount">{inr(v.summary.fairMarketValue)}</span>}
            <StatusBadge status={v.status} />
          </span>
        </>
      );
    }
    case 'customer': {
      const { c } = item;
      return (
        <>
          <span className="gs-icon"><DuoContact size={17} /></span>
          <span className="gs-main">
            <strong>{c.name}</strong>
            <small>{[c.phone1, c.district, `${c.stats?.total || 0} valuation${c.stats?.total === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</small>
          </span>
          <IconChevron size={16} className="gs-go" />
        </>
      );
    }
    case 'member': {
      const { u } = item;
      return (
        <>
          <span className="avatar soft sm">{initials(u.name)}</span>
          <span className="gs-main">
            <strong>{u.name}</strong>
            <small>{[u.email, u.branch].filter(Boolean).join(' · ')}</small>
          </span>
          <IconChevron size={16} className="gs-go" />
        </>
      );
    }
    case 'action':
      return (
        <>
          <span className="gs-icon">{item.a.icon}</span>
          <span className="gs-main"><strong>{item.a.label}</strong></span>
          <IconChevron size={16} className="gs-go" />
        </>
      );
    case 'recent':
      return (
        <>
          <span className="gs-icon"><IconClock size={17} /></span>
          <span className="gs-main"><strong className="gs-recent">{item.label}</strong></span>
        </>
      );
    default: // "see all"
      return (
        <>
          <span className="gs-icon"><IconSearch size={17} /></span>
          <span className="gs-main"><strong className="gs-link">{item.label}</strong></span>
          <IconChevron size={16} className="gs-go" />
        </>
      );
  }
}
