import { useState } from 'react';
import { parseLatLon } from '@dsk/shared';
import { inr } from './StatusBadge.jsx';
import FilesInput from './FilesInput.jsx';

// Renders one section of the @dsk/shared input-sheet schema.
// values = data[sectionPath]; onChange(key, value) updates one field.
export default function SchemaSection({ section, values = {}, onChange, errors = {}, ctx, data, path }) {
  return (
    <div className="fields">
      {section.fields
        .filter((f) => !f.when || f.when(ctx, data))
        .map((f) => (
          <FieldRow key={f.key} field={f} error={errors[`${path}.${f.key}`]} errors={errors} name={`${path}.${f.key}`}>
            <FieldInput
              field={f}
              value={values[f.key] ?? (values[f.key] === undefined || values[f.key] === '' ? f.defaultFrom?.(ctx, data) : undefined)}
              onChange={(v) => onChange(f.key, v)}
              errors={errors}
              name={`${path}.${f.key}`}
            />
          </FieldRow>
        ))}
    </div>
  );
}

function FieldRow({ field, error, children }) {
  const wide = field.wide || ['table', 'grid', 'tiers', 'stages', 'textarea', 'multiselect', 'latlon', 'choice'].includes(field.type);
  return (
    <div className={`field${wide ? ' wide' : ''}${error ? ' has-error' : ''}`} id={`field-${field.key}`}>
      {field.type !== 'checkbox' && (
        <span className="field-label">
          {field.label}
          {field.required && <span className="req"> *</span>}
          {field.unit && <span className="unit"> ({field.unit})</span>}
        </span>
      )}
      {children}
      {field.hint && <span className="hint">{field.hint}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}

const str = (v) => (v === undefined || v === null ? '' : String(v));

export function FieldInput({ field, value, onChange, errors = {}, name }) {
  switch (field.type) {
    case 'textarea':
      return <textarea rows={3} value={str(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      return <input type="number" step="any" min={field.min} max={field.max} value={str(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <input type="date" value={str(value).slice(0, 10)} onChange={(e) => onChange(e.target.value)} />;
    case 'checkbox':
      return (
        <label className="check">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {field.label}
        </label>
      );
    case 'select':
    case 'choice':
      return (
        <select value={str(value)} onChange={(e) => onChange(e.target.value)} className={field.type === 'choice' ? 'choice' : ''}>
          <option value="">— Select —</option>
          {field.options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    case 'multiselect':
      return <Chips options={field.options} selected={value || []} onChange={onChange} />;
    case 'latlon':
      return <LatLonInput value={value} onChange={onChange} />;
    case 'files':
      return <FilesInput value={value || []} onChange={onChange} accept={field.accept} />;
    case 'grid':
      return <GridInput field={field} value={value || {}} onChange={onChange} />;
    case 'table':
      return <TableInput field={field} value={value || []} onChange={onChange} errors={errors} name={name} />;
    case 'tiers':
      return <TiersInput field={field} value={value || {}} onChange={onChange} />;
    case 'stages':
      return <StagesInput field={field} value={value || {}} onChange={onChange} />;
    default: {
      const listId = field.suggestions ? `dl-${field.key}` : undefined;
      return (
        <>
          <input
            type={field.type === 'email' ? 'email' : field.type === 'tel' ? 'tel' : 'text'}
            value={str(value)}
            list={listId}
            onChange={(e) => onChange(field.uppercase ? e.target.value.toUpperCase() : e.target.value)}
          />
          {listId && (
            <datalist id={listId}>
              {field.suggestions.map((s) => <option key={s} value={s} />)}
            </datalist>
          )}
        </>
      );
    }
  }
}

function Chips({ options, selected, onChange }) {
  const toggle = (o) => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o} className={`chip${selected.includes(o) ? ' on' : ''}`} onClick={() => toggle(o)}>{o}</button>
      ))}
    </div>
  );
}

function LatLonInput({ value, onChange }) {
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const set = (k) => (e) => onChange({ ...(value || {}), [k]: e.target.value });
  const fromPaste = (text) => {
    setPaste(text);
    const p = parseLatLon(text);
    if (p) {
      onChange(p);
      setMsg('');
    }
  };
  const locate = () => {
    if (!navigator.geolocation) return setMsg('Geolocation not supported by this browser');
    setMsg('Locating…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        onChange({ lat: +pos.coords.latitude.toFixed(7), lon: +pos.coords.longitude.toFixed(7) });
        setMsg(`Accuracy ±${Math.round(pos.coords.accuracy)} m`);
      },
      (err) => setMsg(err.message),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  const hasPoint = value?.lat !== undefined && value?.lat !== '' && value?.lon !== undefined && value?.lon !== '';
  return (
    <div className="latlon">
      <input placeholder='Paste from Google Maps, e.g. "18.7944, 78.2984"' value={paste} onChange={(e) => fromPaste(e.target.value)} />
      <div className="row">
        <input type="number" step="any" placeholder="Latitude" value={str(value?.lat)} onChange={set('lat')} />
        <input type="number" step="any" placeholder="Longitude" value={str(value?.lon)} onChange={set('lon')} />
      </div>
      <div className="actions left">
        <button type="button" className="btn" onClick={locate}>Use my location</button>
        {hasPoint && (
          <a className="btn" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${value.lat},${value.lon}`}>Open in Maps</a>
        )}
        {msg && <span className="hint">{msg}</span>}
      </div>
    </div>
  );
}

function GridInput({ field, value, onChange }) {
  const set = (row, col, v) => onChange({ ...value, [row]: { ...(value[row] || {}), [col]: v } });
  return (
    <div className="table-wrap">
      <table className="table input-table">
        <thead>
          <tr><th />{field.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {field.rows.map((r) => {
            const k = r.toLowerCase();
            return (
              <tr key={k}>
                <th>{r}</th>
                {field.columns.map((c) => (
                  <td key={c.key}><input value={str(value[k]?.[c.key])} onChange={(e) => set(k, c.key, e.target.value)} /></td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableInput({ field, value, onChange, errors, name }) {
  const setCell = (i, key, v) => onChange(value.map((row, j) => (j === i ? { ...row, [key]: v } : row)));
  return (
    <div className="table-wrap">
      <table className="table input-table">
        <thead>
          <tr>{field.columns.map((c) => <th key={c.key}>{c.label}</th>)}<th /></tr>
        </thead>
        <tbody>
          {value.map((row, i) => (
            <tr key={i}>
              {field.columns.map((c) => {
                const err = errors[`${name}.${i}.${c.key}`];
                return (
                  <td key={c.key} className={err ? 'has-error' : ''} title={err || ''}>
                    <FieldInput field={c} value={row[c.key]} onChange={(v) => setCell(i, c.key, v)} />
                  </td>
                );
              })}
              <td className="row-actions">
                <button type="button" className="btn ghost danger" aria-label="Remove row" onClick={() => onChange(value.filter((_, j) => j !== i))}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="btn small" onClick={() => onChange([...value, {}])}>+ Add row</button>
    </div>
  );
}

function TiersInput({ field, value, onChange }) {
  const set = (key, patch) => {
    const next = { ...value, [key]: { ...(value[key] || {}), ...patch } };
    if (!Number(next[key].tier)) delete next[key];
    onChange(next);
  };
  return (
    <div className="table-wrap">
      <table className="table input-table">
        <thead>
          <tr><th>Item</th><th>Grade</th><th className="num">Qty</th><th className="num">Amount</th></tr>
        </thead>
        <tbody>
          {field.items.map((item) => {
            const sel = value[item.key] || {};
            const tier = Number(sel.tier) || 0;
            const rate = tier ? item.rates[tier - 1] : 0;
            const amount = rate * (item.unit ? Number(sel.qty) || 0 : 1);
            return (
              <tr key={item.key} className={tier ? 'selected' : ''}>
                <td>{item.label}</td>
                <td>
                  <select value={tier} onChange={(e) => set(item.key, { tier: Number(e.target.value) })}>
                    {field.tiers.map((t, i) => (
                      <option key={t} value={i}>{i ? `${t} – ${item.ranges[i - 1] || inr(item.rates[i - 1])}` : t}</option>
                    ))}
                  </select>
                </td>
                <td className="num">
                  {item.unit ? (
                    <input type="number" min="0" step="any" placeholder={item.unit} value={str(sel.qty)} disabled={!tier} onChange={(e) => set(item.key, { qty: e.target.value })} />
                  ) : '—'}
                </td>
                <td className="num">{tier ? inr(amount) : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StagesInput({ field, value, onChange }) {
  return (
    <div className="table-wrap">
      <table className="table input-table">
        <thead>
          <tr><th>Stage / work</th><th className="num">Weight</th><th>Status</th></tr>
        </thead>
        <tbody>
          {field.items.map((s) => (
            <tr key={s.key}>
              <td>{s.label}</td>
              <td className="num">{Math.round(s.weight * 100)}%</td>
              <td>
                <select value={value[s.key] || 'Not Started'} onChange={(e) => onChange({ ...value, [s.key]: e.target.value })}>
                  {field.options.map((o) => <option key={o}>{o}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
