import { useEffect, useRef, useState } from 'react';
import { PERIODS, periodHint, periodLabel } from '../utils/period.js';
import { IconCalendar, IconChevronDown } from './Icons.jsx';

// Period filter: presets + custom date range in a small popover.
// value: { period, start, end }  (start/end are YYYY-MM-DD, only for "custom")
export default function PeriodPicker({ value, onChange, className = '' }) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(value.start || '');
  const [end, setEnd] = useState(value.end || '');
  const ref = useRef(null);
  const active = value.period || 'all';

  useEffect(() => {
    setStart(value.start || '');
    setEnd(value.end || '');
  }, [value.start, value.end]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (period) => {
    if (period === 'custom') return; // handled by Apply
    onChange({ period, start: '', end: '' });
    setOpen(false);
  };
  const applyCustom = (e) => {
    e.preventDefault();
    if (!start && !end) return;
    onChange({ period: 'custom', start, end });
    setOpen(false);
  };

  return (
    <div className={`period ${className}`} ref={ref}>
      <button
        type="button"
        className={`period-btn${active !== 'all' ? ' is-set' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <IconCalendar size={16} />
        <span>{periodLabel(active, value)}</span>
        <IconChevronDown size={15} className="period-caret" />
      </button>

      {open && (
        <div className="period-pop" role="dialog" aria-label="Choose a period">
          <div className="period-title">Created in</div>
          <div className="period-list" role="radiogroup">
            {PERIODS.filter((p) => p.key !== 'custom').map((p) => (
              <button
                key={p.key}
                type="button"
                role="radio"
                aria-checked={active === p.key}
                className={`period-opt${active === p.key ? ' on' : ''}`}
                onClick={() => pick(p.key)}
              >
                <span className="period-radio" aria-hidden="true" />
                <span className="period-opt-text">
                  <strong>{p.label}</strong>
                  {p.key !== 'all' && <small>{periodHint(p.key)}</small>}
                </span>
              </button>
            ))}
          </div>
          <form className="period-custom" onSubmit={applyCustom}>
            <div className="period-title">Custom range</div>
            <div className="period-dates">
              <label>From<input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} /></label>
              <label>To<input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} /></label>
            </div>
            <button type="submit" className="btn primary block" disabled={!start && !end}>Apply range</button>
          </form>
        </div>
      )}
    </div>
  );
}
