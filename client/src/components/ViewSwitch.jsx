// List / Board toggle used by Input Sheets and Reports. The choice is remembered per page on this device
// (a ?view= in the URL wins, so a shared link opens the same view).
export const storedView = (key) => {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
};
export const rememberView = (key, v) => {
  try { localStorage.setItem(key, v); } catch { /* private mode */ }
};

export default function ViewSwitch({ view, onChange }) {
  return (
    <div className="view-switch" role="group" aria-label="View">
      <button type="button" className={view === 'list' ? 'on' : ''} aria-pressed={view === 'list'} onClick={() => onChange('list')} title="List">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" /></svg>
        <span>List</span>
      </button>
      <button type="button" className={view === 'board' ? 'on' : ''} aria-pressed={view === 'board'} onClick={() => onChange('board')} title="Board">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="10" y="4" width="5" height="10" rx="1.5" /><rect x="17" y="4" width="4" height="13" rx="1.5" /></svg>
        <span>Board</span>
      </button>
    </div>
  );
}
