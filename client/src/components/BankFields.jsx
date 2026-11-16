import { useEffect, useRef, useState } from 'react';
import { BANKS, findBank, IFSC_RX } from '@dsk/shared';
import { api } from '../api/client.js';
import { IconCheck } from './Icons.jsx';

// Bank logo by IFSC prefix (Razorpay's public bank logo CDN), with a coloured badge as fallback
export function BankLogo({ bank, size = 28 }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [bank?.code]);
  if (!bank) {
    return <span className="bank-logo bank-logo-empty" style={{ width: size, height: size }} aria-hidden="true">₹</span>;
  }
  if (failed) {
    return (
      <span className="bank-logo bank-badge" style={{ width: size, height: size, background: bank.color, fontSize: size * (bank.short.length > 3 ? 0.27 : 0.34) }} aria-hidden="true">
        {bank.short}
      </span>
    );
  }
  return (
    <span className="bank-logo" style={{ width: size, height: size }} aria-hidden="true">
      <img src={`https://cdn.razorpay.com/bank/${bank.code}.gif`} alt="" width={size - 6} height={size - 6} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
    </span>
  );
}

// Bank name: type to search the list (with logos); any other bank can still be typed in full
export function BankInput({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrap = useRef(null);
  const text = value == null ? '' : String(value);
  const current = findBank(text);
  const q = text.trim().toLowerCase();
  // best matches first: name starts with it › short name / IFSC code › any word starts with it › contains it
  const rank = (b) => {
    const name = b.name.toLowerCase();
    if (name.startsWith(q)) return 0;
    if (b.short.toLowerCase().startsWith(q) || b.code.toLowerCase().startsWith(q)) return 1;
    if (name.split(/[\s&-]+/).some((w) => w.startsWith(q))) return 2;
    if (name.includes(q)) return 3;
    return 9;
  };
  const matches = (current && current.name === text || !q
    ? BANKS
    : BANKS.map((b) => [rank(b), b]).filter(([r]) => r < 9).sort((x, y) => x[0] - y[0]).map(([, b]) => b)
  ).slice(0, 8);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => wrap.current && !wrap.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (b) => { onChange(b.name); setOpen(false); };
  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(matches.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="bank-input" ref={wrap}>
      <BankLogo bank={current} size={28} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="bank-options"
        placeholder="Search bank, e.g. SBI"
        value={text}
        onFocus={() => { setOpen(true); setActive(0); }}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onKeyDown={onKey}
      />
      {open && matches.length > 0 && (
        <ul className="bank-options" id="bank-options" role="listbox">
          {matches.map((b, i) => (
            <li key={b.code} role="option" aria-selected={i === active}>
              <button type="button" className={i === active ? 'on' : ''} onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(b)}>
                <BankLogo bank={b} size={26} />
                <span className="bank-opt-name">{b.name}</span>
                <span className="bank-opt-code">{b.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// IFSC: when an 11-character code is entered, look it up and fill the bank name and branch
export function IfscInput({ value, onChange, setField, values = {} }) {
  const [state, setState] = useState({ status: 'idle' }); // idle | loading | ok | error
  const lastLooked = useRef('');
  const code = String(value || '').toUpperCase().replace(/\s/g, '');

  useEffect(() => {
    if (!IFSC_RX.test(code)) {
      if (state.status !== 'idle') setState({ status: 'idle' });
      lastLooked.current = '';
      return undefined;
    }
    if (code === lastLooked.current) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      lastLooked.current = code;
      setState({ status: 'loading' });
      try {
        const r = await api.lookupIfsc(code);
        if (cancelled) return;
        setState({ status: 'ok', data: r });
        // the IFSC is authoritative for bank + branch
        if (r.bank && r.bank !== values.bankName) setField('bankName', r.bank);
        if (r.branch && r.branch !== values.branch) setField('branch', r.branch);
      } catch (err) {
        if (!cancelled) setState({ status: 'error', message: err.message });
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const d = state.data;
  return (
    <div className="ifsc-field">
      <div className="ifsc-input">
        <input
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={11}
          placeholder="e.g. SBIN0000691"
          value={code}
          onChange={(e) => onChange(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
        />
        {state.status === 'loading' && <span className="ifsc-spin" aria-label="Looking up IFSC" />}
        {state.status === 'ok' && <span className="ifsc-ok" aria-hidden="true"><IconCheck size={16} /></span>}
      </div>
      {state.status === 'ok' && d && (
        <div className="ifsc-result" aria-live="polite">
          <BankLogo bank={findBank(code) || { code: d.bankCode, short: d.bankCode, color: '#334155' }} size={24} />
          <span>
            <strong>{d.bank} · {d.branch}</strong>
            <small>{[d.address, d.micr && `MICR ${d.micr}`].filter(Boolean).join(' · ')}</small>
          </span>
        </div>
      )}
      {state.status === 'error' && <span className="ifsc-error" role="alert">{state.message}</span>}
    </div>
  );
}
