import { useState } from 'react';
import { IconFilter } from './Icons.jsx';

// Secondary filters of a list toolbar. Desktop: shown inline. Phones: tucked behind a
// "Filters" button (with the number of active filters) so the list stays above the fold.
export default function MoreFilters({ active = 0, children }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn filters-btn${active ? ' on' : ''}`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <IconFilter size={16} /> Filters{active > 0 && <span className="tab-num">{active}</span>}
      </button>
      <div className={`filters-extra${open ? ' open' : ''}`}>{children}</div>
    </>
  );
}
