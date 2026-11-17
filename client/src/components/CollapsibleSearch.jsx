import { useRef, useState } from 'react';
import SearchBox from './SearchBox.jsx';
import { IconSearch } from './Icons.jsx';

// Phones: a 🔍 button that expands into the search box (and folds back when left empty).
// Desktop: always the full search box. An active search keeps it open.
export default function CollapsibleSearch({ value = '', onSearch, className = '', ...props }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef(null);
  const expanded = open || Boolean(value);

  const expand = () => {
    setOpen(true);
    requestAnimationFrame(() => wrap.current?.querySelector('input')?.focus());
  };
  // fold back when focus leaves an empty box
  const onBlur = (e) => {
    if (wrap.current?.contains(e.relatedTarget)) return;
    setTimeout(() => { if (!wrap.current?.querySelector('input')?.value) setOpen(false); }, 120);
  };

  return (
    <div ref={wrap} className={`csearch${expanded ? ' open' : ''} ${className}`.trim()} onBlur={onBlur}>
      <button type="button" className="csearch-btn" aria-label={props.label || 'Search'} onClick={expand}>
        <IconSearch size={18} />
      </button>
      <SearchBox value={value} onSearch={onSearch} {...props} />
    </div>
  );
}
