import { useLayoutEffect, useRef, useState } from 'react';

// Tab switcher with a highlight that slides to the selected option.
// options: [{ value, label, badge? }]; arrow keys move between tabs.
export default function Segmented({ options, value, onChange, label, className = '' }) {
  const wrap = useRef(null);
  const [pill, setPill] = useState(null); // { x, w } of the selected button
  const [animate, setAnimate] = useState(false); // no slide on first paint

  useLayoutEffect(() => {
    const measure = () => {
      const btn = wrap.current?.querySelector('[aria-selected="true"]');
      if (btn) setPill({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (ro && wrap.current) ro.observe(wrap.current);
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [value, options.length]);

  useLayoutEffect(() => {
    if (pill && !animate) requestAnimationFrame(() => setAnimate(true));
  }, [pill, animate]);

  const onKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => wrap.current?.querySelector('[aria-selected="true"]')?.focus());
  };

  return (
    <div ref={wrap} className={`segmented has-pill ${className}`} role="tablist" aria-label={label} onKeyDown={onKey}>
      {pill && (
        <span
          className={`seg-pill${animate ? ' animate' : ''}`}
          style={{ width: pill.w, transform: `translateX(${pill.x}px)` }}
          aria-hidden="true"
        />
      )}
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value || 'all'}
            type="button"
            role="tab"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            className={on ? 'on' : ''}
            onClick={() => !on && onChange(o.value)}
          >
            {o.label}
            {o.badge}
          </button>
        );
      })}
    </div>
  );
}
