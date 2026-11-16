import { useEffect, useRef, useState } from 'react';
import { IconSearch } from './Icons.jsx';

// Search box used by every list: searches as you type (short pause), Enter searches at once,
// Esc or ✕ clears. `value` is the committed search (usually from the URL); it resyncs when it
// changes from outside, e.g. "Clear filters".
export default function SearchBox({ value = '', onSearch, placeholder = 'Search…', label = 'Search', delay = 300, className = '', autoFocus = false }) {
  const [text, setText] = useState(value);
  const committed = useRef(value);

  useEffect(() => {
    committed.current = value;
    setText(value);
  }, [value]);

  const commit = (v) => {
    const next = v.trim();
    if (next === committed.current) return;
    committed.current = next;
    onSearch(next);
  };

  useEffect(() => {
    if (text.trim() === committed.current) return undefined;
    const t = setTimeout(() => commit(text), delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const clear = () => { setText(''); commit(''); };

  return (
    <form className={`search ${className}`.trim()} role="search" onSubmit={(e) => { e.preventDefault(); commit(text); }}>
      <IconSearch size={17} />
      <input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape' && text) { e.preventDefault(); clear(); } }}
      />
      {text && <button type="button" className="search-clear" aria-label="Clear search" onClick={clear}>✕</button>}
    </form>
  );
}
