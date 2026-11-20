import { useEffect, useRef, useState } from 'react';

// Date typed as DD-MM-YYYY (dashes added while typing, number keypad on phones), stored as YYYY-MM-DD like before.
// No pop-up calendar on phones (it covered the screen); computers also get a small calendar button.
const pad = (n) => String(n).padStart(2, '0');
export const isoToDmy = (iso) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
};
// "05-11-2026" → "2026-11-05" (null if not a real date)
export function dmyToIso(text) {
  const m = String(text || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (y < 1900 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}
// what was typed or pasted → DD-MM-YYYY as far as it goes
function mask(raw) {
  const s = String(raw).trim();
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/); // pasted 2026-11-05
  if (iso) return `${pad(iso[3])}-${pad(iso[2])}-${iso[1]}`;
  // pasted 5/11/2026 or 05.11.26 (a two-digit year only with / or . – "05-11-20" is still being typed)
  const sep = s.match(/^(\d{1,2})[/.\s](\d{1,2})[/.\s](\d{2}|\d{4})$/);
  if (sep) return `${pad(sep[1])}-${pad(sep[2])}-${sep[3].length === 2 ? `20${sep[3]}` : sep[3]}`;
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); // 5-11-2026
  if (dash) return `${pad(dash[1])}-${pad(dash[2])}-${dash[3]}`;
  const d = s.replace(/\D/g, '').slice(0, 8);
  return d.slice(0, 2) + (d.length > 2 ? `-${d.slice(2, 4)}` : '') + (d.length > 4 ? `-${d.slice(4)}` : '');
}
const todayIso = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };

export default function DateInput({ value, onChange, label }) {
  const iso = String(value || '').slice(0, 10);
  const [text, setText] = useState(isoToDmy(iso));
  const [bad, setBad] = useState(false);
  const focused = useRef(false);
  const picker = useRef(null);
  // follow changes made elsewhere (draft restored, Today button, calendar) unless the box is being typed in
  useEffect(() => { if (!focused.current) { setText(isoToDmy(iso)); setBad(false); } }, [iso]);

  const type = (raw) => {
    const t = mask(raw);
    setText(t);
    if (!t) { setBad(false); return onChange(''); }
    const ok = dmyToIso(t);
    if (ok) { setBad(false); if (ok !== iso) onChange(ok); }
    else if (t.length === 10) setBad(true);
  };
  const leave = () => {
    focused.current = false;
    if (text && !dmyToIso(text)) setBad(true);
  };
  const openCalendar = () => {
    const el = picker.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.click(); }
  };
  return (
    <div className={`date-input${bad ? ' bad' : ''}`}>
      <div className="date-box">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          value={text}
          aria-label={label ? `${label} (DD-MM-YYYY)` : 'Date (DD-MM-YYYY)'}
          aria-invalid={bad || undefined}
          onFocus={() => { focused.current = true; }}
          onBlur={leave}
          onChange={(e) => type(e.target.value)}
        />
        <button type="button" className="date-cal" aria-label="Open calendar" title="Pick from a calendar" onClick={openCalendar}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /></svg>
        </button>
        <input ref={picker} type="date" className="date-native" tabIndex={-1} aria-hidden="true" value={iso} onChange={(e) => onChange(e.target.value)} />
      </div>
      <span className="date-help">
        {bad ? <span className="date-err">Not a real date – use DD-MM-YYYY, e.g. 05-11-2026</span> : 'DD-MM-YYYY'}
        {!iso && <button type="button" className="link-btn" onClick={() => onChange(todayIso())}>Today</button>}
      </span>
    </div>
  );
}
