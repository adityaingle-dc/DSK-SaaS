import { lazy, Suspense, useState } from 'react';
import { boundaryArea, boundaryCentre, boundaryPerimeter, MIN_BOUNDARY_POINTS, parseLatLon, SQFT_PER_SQM, SQYD_PER_SQM } from '@dsk/shared';
import { inr } from './StatusBadge.jsx';
import FilesInput from './FilesInput.jsx';
import { BankInput, IfscInput } from './BankFields.jsx';
import { confirmDialog } from './ConfirmDialog.jsx';

const BoundaryMap = lazy(() => import('./BoundaryMap.jsx'));

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
              setField={onChange}
              values={values}
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

export function FieldInput({ field, value, onChange, errors = {}, name, setField, values }) {
  // special inputs for plain-text fields (stored as text, so validation / reports are unchanged)
  if (field.widget === 'bank') return <BankInput value={value} onChange={onChange} />;
  if (field.widget === 'ifsc' && setField) return <IfscInput value={value} onChange={onChange} setField={setField} values={values} />;
  if (field.widget === 'radio' && field.options) return <RadioChoice field={field} value={value} onChange={onChange} name={name} />;
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
      return <LatLonInput field={field} value={value} onChange={onChange} />;
    case 'files':
      return <FilesInput value={value || []} onChange={onChange} accept={field.accept} max={field.maxFiles} noun={field.imagesOnly ? 'photos' : undefined} />;
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

function LatLonInput({ field, value, onChange }) {
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState('');
  const [focus, setFocus] = useState(null);
  const min = field?.minPoints || MIN_BOUNDARY_POINTS;
  const points = Array.isArray(value?.boundary) ? value.boundary : [];
  const centre = value?.lat !== undefined && value?.lat !== '' && value?.lon !== undefined && value?.lon !== '' ? { lat: Number(value.lat), lon: Number(value.lon) } : null;

  // pins changed: centre of the plot becomes the GPS location
  const setPoints = (next) => {
    const c = next.length >= 3 ? boundaryCentre(next) : null;
    const base = { ...(value || {}), boundary: next, areaSqm: +boundaryArea(next).toFixed(2) };
    if (!next.length) { delete base.boundary; delete base.areaSqm; }
    onChange(c ? { ...base, ...c } : base);
  };
  const setCentre = (p) => { onChange({ ...(value || {}), ...p }); setFocus(p); };
  const set = (k) => (e) => onChange({ ...(value || {}), [k]: e.target.value });
  const fromPaste = (text) => {
    setPaste(text);
    const p = parseLatLon(text);
    if (p) { setCentre(p); setMsg(''); }
  };
  const locate = () => {
    if (!navigator.geolocation) return setMsg('Geolocation not supported by this browser');
    setMsg('Locating…');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCentre({ lat: +pos.coords.latitude.toFixed(7), lon: +pos.coords.longitude.toFixed(7) });
        setMsg(`Accuracy ±${Math.round(pos.coords.accuracy)} m`);
      },
      (err) => setMsg(err.message),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };
  const area = boundaryArea(points);
  const done = points.length >= min;
  return (
    <div className="latlon">
      <div className="bm-head">
        <span className={`bm-count${done ? ' ok' : ''}`}>{points.length} / {min} points{done ? ' ✓' : ''}</span>
        {points.length >= 3 && (
          <span className="bm-area">≈ {Math.round(area * SQFT_PER_SQM).toLocaleString('en-IN')} sq.ft · {Math.round(area * SQYD_PER_SQM).toLocaleString('en-IN')} sq.yd · perimeter {Math.round(boundaryPerimeter(points))} m</span>
        )}
        <span className="bm-actions">
          <button type="button" className="btn small" disabled={!points.length} onClick={() => setPoints(points.slice(0, -1))}>Undo</button>
          <button type="button" className="btn small" disabled={!points.length} onClick={async () => (await confirmDialog({ title: 'Remove all map points?', message: `All ${points.length} points marked around the plot will be removed.`, confirmLabel: 'Remove points', tone: 'danger', icon: 'trash' })) && setPoints([])}>Clear</button>
        </span>
      </div>
      <Suspense fallback={<div className="bm-map bm-loading">Loading map…</div>}>
        <BoundaryMap points={points} centre={centre} focus={focus} onChange={setPoints} />
      </Suspense>
      <p className="hint">
        {done
          ? 'Boundary marked. Drag a point to adjust it, or tap it to remove it.'
          : `Zoom in on the plot and tap its corners and edges in order, going round the plot: at least ${min} points. Drag a point to adjust it, tap it to remove it.`}
      </p>
      <input placeholder='Find the plot: paste "lat, lon" from Google Maps, e.g. 18.7944, 78.2984' value={paste} onChange={(e) => fromPaste(e.target.value)} />
      <div className="row">
        <input type="number" step="any" placeholder="Latitude" value={str(value?.lat)} onChange={set('lat')} aria-label="Latitude" />
        <input type="number" step="any" placeholder="Longitude" value={str(value?.lon)} onChange={set('lon')} aria-label="Longitude" />
      </div>
      <div className="actions left">
        <button type="button" className="btn" onClick={locate}>Use my location</button>
        {centre && (
          <a className="btn" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${centre.lat},${centre.lon}`}>Open in Google Maps</a>
        )}
        {msg && <span className="hint">{msg}</span>}
      </div>
    </div>
  );
}

// radio buttons for a choice: short options sit in a row, sentence-length ones stack in two columns
function RadioChoice({ field, value, onChange, name }) {
  const group = `rc-${name || field.key}`;
  const short = field.options.every((o) => o.length <= 28);
  const current = str(value);
  return (
    <div className={`radio-choice${short ? ' short' : ''}`} role="radiogroup" aria-label={field.label}>
      {field.options.map((o) => (
        <label key={o} className={`radio-opt${current === o ? ' on' : ''}`}>
          <input type="radio" name={group} value={o} checked={current === o} onChange={() => onChange(o)} />
          <span>{o}</span>
        </label>
      ))}
      {current && <button type="button" className="link-btn radio-clear" onClick={() => onChange('')}>Clear</button>}
    </div>
  );
}

function GridInput({ field, value, onChange }) {
  const set = (row, col, v) => onChange({ ...value, [row]: { ...(value[row] || {}), [col]: v } });
  // splitColumns: n → stacked tables of n columns each (e.g. boundaries above, dimensions below)
  const n = field.splitColumns || field.columns.length;
  const groups = [];
  for (let i = 0; i < field.columns.length; i += n) groups.push(field.columns.slice(i, i + n));
  return (
    <div className="grid-tables">
      {groups.map((cols) => (
        <div className="table-wrap" key={cols[0].key}>
          <table className="table input-table">
            <thead>
              <tr><th />{cols.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {field.rows.map((r) => {
                const k = r.toLowerCase();
                return (
                  <tr key={k}>
                    <th scope="row">{r}</th>
                    {cols.map((c) => (
                      <td key={c.key} data-label={c.label}><input aria-label={`${r} – ${c.label}`} value={str(value[k]?.[c.key])} onChange={(e) => set(k, c.key, e.target.value)} /></td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
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
          {value.length === 0 && (
            <tr className="empty-row"><td colSpan={field.columns.length + 1}>No rows added</td></tr>
          )}
          {value.map((row, i) => (
            <tr key={i}>
              {field.columns.map((c) => {
                const err = errors[`${name}.${i}.${c.key}`];
                return (
                  <td key={c.key} data-label={c.label} className={err ? 'has-error' : ''} title={err || ''}>
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
      <button type="button" className="btn small add-row" onClick={() => onChange([...value, {}])}>+ Add row</button>
    </div>
  );
}

function TiersInput({ field, value, onChange }) {
  const set = (key, patch) => {
    const next = { ...value, [key]: { ...(value[key] || {}), ...patch } };
    if (!Number(next[key].tier)) delete next[key];
    onChange(next);
  };
  // a new grade means a new price: drop the exact amount typed for the old one
  const setTier = (key, tier) => set(key, { tier, amount: undefined });
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
            const standard = rate * (item.unit ? Number(sel.qty) || 0 : 1);
            // editing: amount is defined (may be '' while retyping); '' falls back to the standard figure
            const editing = sel.amount !== undefined && sel.amount !== null;
            const custom = editing && sel.amount !== '';
            return (
              <tr key={item.key} className={tier ? 'selected' : ''}>
                <th scope="row" className="cell-title">{item.label}</th>
                <td data-label="Grade">
                  <select aria-label={`${item.label} – grade`} value={tier} onChange={(e) => setTier(item.key, Number(e.target.value))}>
                    {field.tiers.map((t, i) => (
                      <option key={t} value={i}>{i ? `${t} – ${item.ranges[i - 1] || inr(item.rates[i - 1])}` : t}</option>
                    ))}
                  </select>
                </td>
                <td className="num" data-label="Qty">
                  {item.unit ? (
                    <input type="number" min="0" step="any" placeholder={item.unit} value={str(sel.qty)} disabled={!tier} onChange={(e) => set(item.key, { qty: e.target.value })} />
                  ) : '—'}
                </td>
                <td className="num cell-amount" data-label="Amount">
                  {tier ? (
                    <div className="tier-amount">
                      <span className="tier-rs" aria-hidden="true">₹</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        aria-label={`${item.label} – amount`}
                        placeholder={String(Math.round(standard))}
                        value={editing ? str(sel.amount) : String(Math.round(standard))}
                        onChange={(e) => set(item.key, { amount: e.target.value.replace(/\D/g, '') })}
                        className={custom ? 'is-custom' : ''}
                      />
                    </div>
                  ) : '—'}
                </td>
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
              <th scope="row" className="cell-title">{s.label}</th>
              <td className="num" data-label="Weight">{Math.round(s.weight * 100)}%</td>
              <td data-label="Status">
                <select aria-label={`${s.label} – status`} value={value[s.key] || 'Not Started'} onChange={(e) => onChange({ ...value, [s.key]: e.target.value })}>
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
