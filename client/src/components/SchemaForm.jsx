import { Suspense, createContext, lazy, useContext, useEffect, useRef, useState } from 'react';
import { boundaryArea, boundaryCentre, boundaryPerimeter, buildingDims, documentDetails, landExtras, MIN_BOUNDARY_POINTS, parseLatLon, plotArea, sideRoles, SQFT_PER_SQM, SQYD_PER_SQM } from '@dsk/shared';
import { inr } from './StatusBadge.jsx';
import FilesInput from './FilesInput.jsx';
import DateInput from './DateInput.jsx';
import { BankInput, BranchInput, IfscInput } from './BankFields.jsx';
import { confirmDialog } from './ConfirmDialog.jsx';
import { api } from '../api/client.js';


// ---------- measurements in feet or metres ----------
// The sheet's switch (general.measureUnit: 'ft' | 'm'). Values are always stored in feet / sq.ft, so the working,
// rates and report don't change; in metres the inputs show and take metres (or sq.m) and convert.
export const MeasureContext = createContext('ft');
const M_PER_FT = 0.3048;
const SQM_PER_SQFT = 0.09290304;
const LEN_UNITS = ['ft', 'rft'];
// a field's measurement kind ('len' | 'area' | null), from its unit or its `measure` flag
export const measureKind = (f) => f?.measure || (LEN_UNITS.includes(f?.unit) ? 'len' : f?.unit === 'sq.ft' ? 'area' : null);
// the field as shown in the chosen units (its unit label swapped)
export function inUnits(f, mode) {
  const kind = measureKind(f);
  if (!kind) return f;
  const out = { ...f, measure: kind };
  if (mode === 'm') {
    if (f.unit) out.unit = kind === 'area' ? 'sq.m' : f.unit === 'rft' ? 'rmt' : 'm';
    if (f.label) out.label = f.label.replace(/\(sq\.ft\)/i, '(sq.m)').replace(/\(ft\)/i, '(m)');
  }
  return out;
}
// does this section have anything measured? (shows the Ft | Mts switch)
export const hasMeasurements = (section) => section.fields.some((f) => !f.hidden && (measureKind(f) || (f.columns || []).some(measureKind)));

const toShown = (v, factor, dp) => (v === '' || v === undefined || v === null || Number.isNaN(Number(v)) ? '' : String(+(Number(v) * factor).toFixed(dp)));
// a number stored in feet / sq.ft, typed and shown in metres / sq.m
function MeasureInput({ value, onChange, kind, min, ...rest }) {
  const factor = kind === 'area' ? SQM_PER_SQFT : M_PER_FT;
  const dp = kind === 'area' ? 2 : 3;
  const [text, setText] = useState(() => toShown(value, factor, dp));
  const typing = useRef(false);
  useEffect(() => { if (!typing.current) setText(toShown(value, factor, dp)); }, [value, factor, dp]);
  return (
    <input
      type="number" step="any" min={min} value={text} {...rest}
      onFocus={() => { typing.current = true; }}
      onBlur={() => { typing.current = false; setText(toShown(value, factor, dp)); }}
      onChange={(e) => { const t = e.target.value; setText(t); onChange(t === '' ? '' : String(+(Number(t) / factor).toFixed(4))); }}
    />
  );
}
// a dimension typed as text ("40", "40' 6\"", "12.2 m"): in metres, a plain number means metres and is kept as "12.2 m"
// (the working reads both); a plain number saved earlier is in feet and is shown converted
const PLAIN = /^\s*\d+(\.\d+)?\s*$/;
function DimensionText({ value, onChange, mode, ...rest }) {
  const shown = (v) => {
    const t = String(v ?? '');
    if (mode !== 'm') return t;
    if (PLAIN.test(t)) return String(+(Number(t) * M_PER_FT).toFixed(3));
    return t.replace(/\s*(m|mt|mtr|mtrs|metres?|meters?)\s*$/i, '');
  };
  const [text, setText] = useState(() => shown(value));
  const typing = useRef(false);
  useEffect(() => { if (!typing.current) setText(shown(value)); }, [value, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (t) => (mode === 'm' && PLAIN.test(t) ? `${t.trim()} m` : t);
  return (
    <input
      value={text} {...rest}
      onFocus={() => { typing.current = true; }}
      onBlur={() => { typing.current = false; setText(shown(value)); }}
      onChange={(e) => { setText(e.target.value); onChange(save(e.target.value)); }}
    />
  );
}

const BoundaryMap = lazy(() => import('./BoundaryMap.jsx'));

// Renders one section of the @dsk/shared input-sheet schema.
// values = data[sectionPath]; onChange(key, value) updates one field.
// onChangeAt(path, key, value) (optional) lets a section's links update a field in another section.
// locked: sheet fields filled from the customer that can't be changed here (e.g. ['general.bankName']); shown read-only
export default function SchemaSection({ section, values = {}, onChange, onChangeAt, errors = {}, ctx, data, path, locked = [] }) {
  // optionsFrom: the options depend on other answers (e.g. relations that fit the salutation)
  const mode = useContext(MeasureContext);
  const visible = section.fields.filter((f) => (!f.when || f.when(ctx, data)) && !f.inGrid && !f.hidden).map((f) => inUnits(f.optionsFrom ? { ...f, options: f.optionsFrom(values) } : f, mode));
  const paired = pairShortFields(visible.filter((f) => !f.row));
  // a section can keep fields in step (salutation ↔ relation ↔ name): one change may set a few fields
  const change = (key, v) => {
    const patch = section.link ? section.link(values, key, v, data) : { [key]: v };
    for (const [k, x] of Object.entries(patch)) {
      if (!k.includes('.')) onChange(k, x);
      else if (onChangeAt) { const [p, f] = k.split('.'); onChangeAt(p, f, x); } // e.g. site.plotPosition
    }
  };
  const render = (f) => (locked.includes(`${path}.${f.key}`) ? (
    <FieldRow key={f.key} field={{ ...f, hint: undefined }} label={f.labelFrom?.(values) || f.label} pair={paired.has(f.key)} errors={errors} name={`${path}.${f.key}`}>
      <div className="locked-value" title="Entered with the customer. Change it in the customer's details.">
        <span>{String(values[f.key] ?? '')}</span>
        <small>From the customer · change it in the customer's details</small>
      </div>
    </FieldRow>
  ) : (
    <FieldRow key={f.key} field={f} label={f.labelFrom?.(values) || f.label} pair={paired.has(f.key)} error={errors[`${path}.${f.key}`]} errors={errors} name={`${path}.${f.key}`}>
      <FieldInput
        field={f}
        value={values[f.key] ?? (values[f.key] === undefined || values[f.key] === '' ? f.defaultFrom?.(ctx, data) : undefined)}
        onChange={(v) => change(f.key, v)}
        setField={change}
        values={values}
        data={data}
        errors={errors}
        name={`${path}.${f.key}`}
      />
    </FieldRow>
  ));
  // neighbouring fields with the same `row` sit side by side (salutation | name); `heading` starts a small group title
  const items = [];
  for (let i = 0; i < visible.length; i++) {
    const f = visible[i];
    if (f.heading) items.push(<h3 key={`h-${f.key}`} className="fields-heading">{f.heading}</h3>);
    if (f.row) {
      const group = [f];
      while (visible[i + 1]?.row === f.row && !visible[i + 1].heading) group.push(visible[++i]);
      items.push(<div key={`row-${f.key}`} className={`field-row-group row-${f.row}`}>{group.map(render)}</div>);
    } else items.push(render(f));
  }
  return <div className="fields">{items}</div>;
}

// a choice with a handful of answers is shown as buttons (one tap) instead of a dropdown (two taps + scrolling)
const MAX_BUTTONS = 8;
// (a field with "Other…" stays buttons even when every listed value is used up, e.g. all six floors added)
export const asButtons = (field) => ['select', 'choice'].includes(field.type) && ((field.options || []).length > 0 || !!field.allowOther) && (field.options.length <= MAX_BUTTONS || !!field.optionGroups);
const optionName = (field, o) => field.optionLabels?.[o] || o;
// a few tiny answers (Sri. / Smt., Yes / No, 5 / 7.5) fit in half a row
const tinyButtons = (field) => asButtons(field) && field.options.length <= 4 && field.options.every((o) => optionName(field, o).length <= 10);
const isWide = (field) => field.wide || ['table', 'grid', 'tiers', 'stages', 'textarea', 'multiselect', 'latlon', 'choice'].includes(field.type) || (asButtons(field) && !tinyButtons(field));
// phones: small inputs (dates, numbers, phones, pincodes, short dropdowns) can sit two to a row
const isShort = (field) => !isWide(field) && (
  ['date', 'number', 'tel'].includes(field.type)
  || field.pattern === '^[1-9][0-9]{5}$'
  || tinyButtons(field)
  || (field.type === 'select' && (field.options || []).every((o) => String(o).length <= 16))
);
// pair neighbouring short fields in form order (a short field with no short neighbour stays full width)
function pairShortFields(fields) {
  const out = new Set();
  for (let i = 0; i < fields.length - 1; i++) {
    if (isShort(fields[i]) && isShort(fields[i + 1])) { out.add(fields[i].key); out.add(fields[i + 1].key); i++; }
  }
  return out;
}

function FieldRow({ field, label = field.label, error, children, pair = false }) {
  const wide = isWide(field);
  const short = pair;
  return (
    <div className={`field${wide ? ' wide' : ''}${short ? ' short' : ''}${error ? ' has-error' : ''}`} id={`field-${field.key}`}>
      {field.type !== 'checkbox' && (
        <span className="field-label">
          {label}
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

export function FieldInput({ field, value, onChange, errors = {}, name, setField, values, data, inTable = false }) {
  const mode = useContext(MeasureContext);
  // special inputs for plain-text fields (stored as text, so validation / reports are unchanged)
  if (field.widget === 'bank') return <BankInput value={value} onChange={onChange} />;
  if (field.widget === 'ifsc' && setField) return <IfscInput value={value} onChange={onChange} setField={setField} values={values} />;
  if (field.widget === 'branch' && setField) return <BranchInput value={value} onChange={onChange} setField={setField} values={values} />;
  if (field.widget === 'roadFromWidth') return <RoadFromWidth widthFt={data?.boundaries?.roadWidthFt} />;
  // every choice is one tap: buttons (compact inside table rows)
  if (asButtons(field)) return <ChoiceButtons field={field} value={value} onChange={onChange} name={name} compact={inTable} />;
  switch (field.type) {
    case 'textarea':
      return <textarea rows={3} value={str(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'number':
      if (field.measure && mode === 'm') return <MeasureInput kind={field.measure} min={field.min} value={value} onChange={onChange} />;
      return <input type="number" step="any" min={field.min} max={field.max} value={str(value)} onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <DateInput value={value} onChange={onChange} label={field.label} />;
    case 'checkbox':
      return (
        <label className="check">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} /> {field.label}
        </label>
      );
    case 'select':
    case 'choice':
      if (field.allowOther) return <SelectWithOther field={field} value={value} onChange={onChange} />;
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
      return <LatLonInput field={field} value={value} onChange={onChange} setField={setField} values={values} />;
    case 'files':
      return <FilesInput value={value || []} onChange={onChange} accept={field.accept} max={field.maxFiles} noun={field.imagesOnly ? 'photos' : undefined} gpsCamera={!!field.gpsCamera} compact={!!field.compact} addLabel={field.compact ? '+ Upload' : undefined} />;
    case 'buildingDims':
      return <BuildingDimsPanel values={values} />;
    case 'grid':
      return <GridInput field={field} value={value || {}} onChange={onChange} values={values} setField={setField} />;
    case 'areaCalc':
      return <PlotAreaPanel data={data || {}} />;
    case 'landExtras':
      return <LandExtrasPanel values={values || {}} />;
    case 'table':
      if (field.widget === 'documents') return <DocumentsInput field={field} value={value || []} onChange={onChange} errors={errors} name={name} />;
      return <TableInput field={field} value={value || []} onChange={onChange} errors={errors} name={name} />;
    case 'tiers':
      return <TiersInput field={field} value={value || {}} onChange={onChange} />;
    case 'stages':
      return <StagesInput field={field} value={value || {}} onChange={onChange} />;
    default: {
      if (field.measure && !field.suggestions) return <DimensionText mode={mode} value={value} onChange={onChange} />;
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

// a dropdown with "Other…": picking it shows a box to type a name that is not in the list (e.g. Penthouse)
const OTHER = '__other__';
function SelectWithOther({ field, value, onChange }) {
  const current = str(value);
  const listed = field.options.includes(current);
  const [typing, setTyping] = useState(!!current && !listed);
  const other = typing || (!!current && !listed);
  const input = useRef(null);
  // Other…: the list is swapped for a box to type the name in (with a button back to the list)
  if (other) {
    return (
      <div className="select-other is-typing">
        <input
          ref={input}
          autoFocus={typing && !current}
          value={current}
          maxLength={40}
          aria-label={`${field.label} – type the name`}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="select-other-back" aria-label="Choose from the list instead" title="Choose from the list" onClick={() => { setTyping(false); onChange(''); }}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" /></svg>
        </button>
      </div>
    );
  }
  return (
    <select
      value={current}
      onChange={(e) => {
        if (e.target.value === OTHER) { setTyping(true); onChange(''); }
        else onChange(e.target.value);
      }}
    >
      <option value="">— Select —</option>
      {field.options.map((o) => <option key={o} value={o}>{o}</option>)}
      <option value={OTHER}>Other…</option>
    </select>
  );
}

function Chips({ options, selected, onChange }) {
  const toggle = (o) => onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <div className="chips">
      {options.map((o) => (
        <button type="button" key={o} className={`choice-btn${selected.includes(o) ? ' on' : ''}`} aria-pressed={selected.includes(o)} onClick={() => toggle(o)}>
          {selected.includes(o) && <svg className="choice-tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>}
          <span>{o}</span>
        </button>
      ))}
    </div>
  );
}

// address fields of the Property location section that the map can fill
const MAP_FIELDS = { number: 'Plot / H.No.', street: 'Road / Street / Colony', village: 'Village', localBodyName: 'Mandal / Municipality', district: 'District', pincode: 'Pincode', landmark: 'Landmark' };
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

function LatLonInput({ field, value, onChange, setField, values = {} }) {
  const [msg, setMsg] = useState('');
  const [focus, setFocus] = useState(null);
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
  // pasting "lat, lon" (e.g. copied from Google Maps) into either centre box fills both and moves the map there
  const onPasteCentre = (e) => {
    const p = parseLatLon(e.clipboardData?.getData('text') || '');
    if (p) { e.preventDefault(); setCentre(p); setMsg(''); }
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
  // fill the address from the map point: empty fields straight away, filled ones only after asking
  const canFill = !!setField && !!field?.fillAddress;
  const [addr, setAddr] = useState({ busy: false, msg: '', tone: '' });
  const fillAddress = async (auto = false) => {
    if (!centre || !setField) return;
    setAddr({ busy: true, msg: 'Finding the address…', tone: '' });
    try {
      const { fields = {}, place = '' } = await api.reverseGeocode(centre.lat, centre.lon);
      const keys = Object.keys(MAP_FIELDS).filter((k) => fields[k]);
      if (!keys.length) return setAddr({ busy: false, msg: 'No address found at this point. Fill it in below.', tone: 'warn' });
      const empty = keys.filter((k) => isBlank(values[k]));
      const differ = keys.filter((k) => !isBlank(values[k]) && String(values[k]).trim().toLowerCase() !== String(fields[k]).toLowerCase());
      let replace = false;
      if (differ.length && !auto) {
        replace = await confirmDialog({
          title: 'Replace what is already filled?',
          message: differ.map((k) => `${MAP_FIELDS[k]}: “${values[k]}” → “${fields[k]}”`).join('\n'),
          confirmLabel: 'Replace',
          cancelLabel: empty.length ? 'Only fill empty ones' : 'Keep mine',
        });
      }
      const apply = replace ? [...empty, ...differ] : empty;
      for (const k of apply) setField(k, fields[k]);
      // the local body type (Mandal / Municipality) goes with its name
      if (fields.localBodyType && apply.includes('localBodyName')) setField('localBodyType', fields.localBodyType);
      const names = apply.map((k) => MAP_FIELDS[k].split(' /')[0].toLowerCase());
      setAddr({
        busy: false,
        tone: apply.length ? 'ok' : '',
        msg: apply.length ? `Filled ${names.join(', ')} from the map. Please check them below.` : `Address here: ${place || keys.map((k) => fields[k]).join(', ')}`,
      });
    } catch (e) {
      setAddr({ busy: false, msg: e.message || 'Address lookup failed', tone: 'warn' });
    }
  };
  // the first time the plot gets a location while the address is still empty: fill it without asking
  const autoFor = useRef('');
  const centreKey = centre ? `${centre.lat.toFixed(4)},${centre.lon.toFixed(4)}` : '';
  const addressEmpty = Object.keys(MAP_FIELDS).every((k) => isBlank(values[k]));
  useEffect(() => {
    if (!canFill || !centreKey || !addressEmpty || autoFor.current === centreKey) return undefined;
    const t = setTimeout(() => { autoFor.current = centreKey; fillAddress(true); }, 900);
    return () => clearTimeout(t);
  }, [centreKey, addressEmpty]); // eslint-disable-line react-hooks/exhaustive-deps

  const area = boundaryArea(points);
  const done = points.length >= MIN_BOUNDARY_POINTS; // enough to enclose an area (no minimum is required)
  return (
    <div className="latlon">
      <div className="bm-head">
        <span className={`bm-count${done ? ' ok' : ''}`}>{points.length} point{points.length === 1 ? '' : 's'}</span>
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
          ? 'Drag a point to adjust it, or tap it to remove it. Add more points if the plot has more corners.'
          : 'Zoom in on the plot and tap its corners in order, going round the plot (as many as needed). Drag a point to adjust it, tap it to remove it.'}
      </p>
      <div className="ll-centre">
        <span className="ll-title">Centre of the plot (GPS location){points.length >= 3 ? ' · from the pinned points' : ''}</span>
        <div className="row">
          <label className="ll-cell"><span>Latitude</span><input type="number" step="any" placeholder="e.g. 18.7944" value={str(value?.lat)} onChange={set('lat')} onPaste={onPasteCentre} readOnly={points.length >= 3} /></label>
          <label className="ll-cell"><span>Longitude</span><input type="number" step="any" placeholder="e.g. 78.2984" value={str(value?.lon)} onChange={set('lon')} onPaste={onPasteCentre} readOnly={points.length >= 3} /></label>
        </div>
      </div>
      {points.length > 0 && (
        <div className="ll-points">
          <span className="ll-title">Pinned points ({points.length}) · numbered as on the map</span>
          <div className="table-wrap">
            <table className="table input-table ll-table">
              <thead><tr><th className="num">#</th><th>Latitude</th><th>Longitude</th><th /></tr></thead>
              <tbody>
                {points.map((p, i) => (
                  <tr key={i}>
                    <th scope="row" className="num"><span className="ll-no">{i + 1}</span></th>
                    {['lat', 'lon'].map((k) => (
                      <td key={k} data-label={k === 'lat' ? 'Latitude' : 'Longitude'}>
                        <input
                          type="number"
                          step="any"
                          aria-label={`Point ${i + 1} ${k === 'lat' ? 'latitude' : 'longitude'}`}
                          value={p[k]}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            if (e.target.value === '' || !Number.isFinite(n)) return;
                            setPoints(points.map((q, j) => (j === i ? { ...q, [k]: n } : q)));
                          }}
                        />
                      </td>
                    ))}
                    <td className="row-actions">
                      <button type="button" className="btn ghost danger" aria-label={`Remove point ${i + 1}`} onClick={() => setPoints(points.filter((_, j) => j !== i))}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {canFill && (
        <div className={`map-fill${addr.tone ? ` ${addr.tone}` : ''}`}>
          <button type="button" className="btn primary small" onClick={() => fillAddress(false)} disabled={!centre || addr.busy}>
            {addr.busy ? 'Finding address…' : 'Fill address from map'}
          </button>
          <span>{addr.msg || (centre ? 'Fills the village, mandal, district, pincode and road from the plot’s location.' : 'Mark the plot or use your location first.')}</span>
        </div>
      )}
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

// One tap picks an answer, tapping it again clears it. Long report sentences show by their short name;
// the full sentence of the picked answer is shown underneath, as it will read in the report.
// compact: smaller buttons for table rows · allowOther: an "Other…" button with a box for a typed value
// optionGroups: buttons under small group titles; groups after the first open with "More …"
function ChoiceButtons({ field, value, onChange, name, compact = false }) {
  const group = `cb-${name || field.key}`;
  const current = str(value);
  const listed = field.options.includes(current);
  const [typing, setTyping] = useState(!!current && !listed);
  const other = field.allowOther && (typing || (!!current && !listed));
  const groups = field.optionGroups?.map((g) => ({ ...g, options: g.options.filter((o) => field.options.includes(o)) }));
  const inLater = groups && groups.slice(1).some((g) => g.options.includes(current));
  const [more, setMore] = useState(false);
  // only real sentences are repeated underneath ("WBM" → "WBM Road" is not worth a line)
  const full = field.type === 'choice' && current && field.optionLabels?.[current] && current.length > 30 ? current : '';
  const button = (o) => (
    <label key={o} className={`choice-btn${current === o ? ' on' : ''}`} title={current === o ? 'Tap again to clear' : o !== optionName(field, o) ? o : undefined}>
      <input type="radio" name={group} value={o} checked={current === o} onChange={() => {}} onClick={() => { setTyping(false); onChange(current === o ? '' : o); }} />
      {current === o && <svg className="choice-tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>}
      <span>{optionName(field, o)}</span>
    </label>
  );
  if (groups) {
    const open = more || inLater;
    return (
      <div className={`choice-wrap${compact ? ' compact' : ''}`}>
        {groups.map((g, i) => (i === 0 || open) && (
          <div key={g.label} className="choice-group">
            <span className="choice-group-title">{g.label}</span>
            <div className="choice-buttons" role="radiogroup" aria-label={`${field.label}: ${g.label}`}>{g.options.map(button)}</div>
          </div>
        ))}
        {!open && <button type="button" className="link-btn choice-more" onClick={() => setMore(true)}>More purposes ({groups.slice(1).reduce((n, g) => n + g.options.length, 0)}) ▾</button>}
      </div>
    );
  }
  return (
    <div className={`choice-wrap${compact ? ' compact' : ''}`}>
      <div className="choice-buttons" role="radiogroup" aria-label={field.label}>
        {field.allowOther && field.options.map(button)}
        {field.allowOther && (
          <label className={`choice-btn${other ? ' on' : ''}`}>
            <input type="radio" name={group} checked={!!other} onChange={() => {}} onClick={() => { if (!other) { setTyping(true); onChange(''); } }} />
            <span>Other…</span>
          </label>
        )}
        {!field.allowOther && field.options.map((o) => (
          <label key={o} className={`choice-btn${current === o ? ' on' : ''}`} title={current === o ? 'Tap again to clear' : o !== optionName(field, o) ? o : undefined}>
            <input
              type="radio"
              name={group}
              value={o}
              checked={current === o}
              onChange={() => {}}
              onClick={() => onChange(current === o ? '' : o)}
            />
            {current === o && <svg className="choice-tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" /></svg>}
            <span>{optionName(field, o)}</span>
          </label>
        ))}
      </div>
      {other && <input className="choice-other-input" autoFocus={!current} value={current} maxLength={40} aria-label={`${field.label} – type the name`} onChange={(e) => onChange(e.target.value)} />}
      {full && <p className="choice-full"><span>In report:</span> {full}</p>}
    </div>
  );
}

// a row of one-tap buttons for table cells (grades, stages); tap the picked one again to clear when allowed
function PillRow({ options, value, onChange, label, clearTo }) {
  return (
    <div className="choice-buttons pill-row" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button type="button" key={o.value} role="radio" aria-checked={value === o.value} title={o.title}
          className={`choice-btn${value === o.value ? ' on' : ''}`}
          onClick={() => onChange(value === o.value && clearTo !== undefined ? clearTo : o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Site characteristics → Road width: the width typed in Boundaries & dimensions (in Fts / Mts) and whether it is
// below or above 20 ft; nothing to pick here
function RoadFromWidth({ widthFt }) {
  const mode = useContext(MeasureContext);
  const w = Number(widthFt);
  if (!Number.isFinite(w) || w <= 0) return <div className="derived-value muted">Enter the road width in Boundaries &amp; dimensions.</div>;
  const shown = mode === 'm' ? `${(w * M_PER_FT).toLocaleString('en-IN', { maximumFractionDigits: 2 })} m` : `${w.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ft`;
  return (
    <div className="derived-value">
      <strong>{shown} wide</strong> <span className="muted">· {w < 20 ? 'below 20 ft' : 'above 20 ft'} (from Boundaries &amp; dimensions)</span>
    </div>
  );
}

// Building dimensions: built-up area (length × breadth) as per permission and as per actual, and the slab area
function BuildingDimsPanel({ values = {} }) {
  const mode = useContext(MeasureContext);
  const r = buildingDims(values);
  const len = (ft) => (ft ? (mode === 'm' ? `${(ft * M_PER_FT).toLocaleString('en-IN', { maximumFractionDigits: 2 })} m` : `${ft.toLocaleString('en-IN', { maximumFractionDigits: 2 })} ft`) : '—');
  const area = (sqft) => (sqft
    ? (mode === 'm' ? `${(sqft * SQM_PER_SQFT).toLocaleString('en-IN', { maximumFractionDigits: 2 })} sq.m` : `${sqft.toLocaleString('en-IN', { maximumFractionDigits: 2 })} sq.ft`)
    : '—');
  const lxb = (p) => (p.length && p.breadth ? `${len(p.length)} × ${len(p.breadth)}` : 'Enter length and breadth');
  return (
    <div className="extras-calc bd-calc">
      <table className="table">
        <thead><tr><th /><th>As per permission</th><th>As per actual</th></tr></thead>
        <tbody>
          <tr><th scope="row">Built-up area (L × B)</th><td><strong>{area(r.permission.area)}</strong><small className="muted block">{lxb(r.permission)}</small></td><td><strong>{area(r.actual.area)}</strong><small className="muted block">{lxb(r.actual)}</small></td></tr>
          <tr className="bd-slab"><th scope="row">Slab area</th><td colSpan={2}><strong>{area(r.slab.area)}</strong><small className="muted block">{r.slab.area ? `(${len(r.slab.length)}) × (${len(r.slab.breadth)}): ${r.slab.from === 'actual' ? 'actual' : 'permission'} dimensions + slab extensions` : 'Enter the dimensions (and any slab extensions)'}</small></td></tr>
        </tbody>
      </table>
    </div>
  );
}

// Land valuation: each extra item's amount = quantity × rate, and the total
function LandExtrasPanel({ values }) {
  const items = landExtras(values);
  const total = items.reduce((s, x) => s + x.amount, 0);
  const fmt = (n) => Number(n).toLocaleString('en-IN');
  return (
    <div className="extras-calc">
      {items.map((x) => (
        <div key={x.key} className={`extras-line${x.missingRate ? ' warn' : ''}`}>
          <span>{x.label}</span>
          <span className="extras-work">
            {x.qty != null ? (x.missingRate ? `${fmt(x.qty)} ${x.unit} × rate?` : `${fmt(x.qty)} ${x.unit} × ₹${fmt(x.rate)}`) : x.amount ? 'amount entered earlier' : '—'}
          </span>
          <strong>{x.amount ? inr(x.amount) : '—'}</strong>
        </div>
      ))}
      <div className="extras-line total"><span>Total extra items</span><span /><strong>{inr(total)}</strong></div>
    </div>
  );
}

// Boundaries: site area worked out from the four sides (and the diagonal), with the map outline as a check
function PlotAreaPanel({ data }) {
  const r = plotArea(data.boundaries, data.property?.siteShape);
  const mapSqm = Number(data.property?.location?.areaSqm) || 0;
  const mapSqft = mapSqm * SQFT_PER_SQM;
  const fmt = (x, d = 0) => Number(x).toLocaleString('en-IN', { maximumFractionDigits: d });
  if (!r) {
    return (
      <div className="area-calc empty">
        Enter the four dimensions above (as per actuals, or as per the document) and the site area is worked out here.
        {mapSqm > 0 && <span className="area-map">The map outline (Property location) is ≈ {fmt(mapSqft)} sq.ft ({fmt(mapSqm * SQYD_PER_SQM, 1)} sq.yd).</span>}
      </div>
    );
  }
  const diff = mapSqm > 0 ? ((mapSqft - r.sqft) / r.sqft) * 100 : null;
  const actual = data.land?.siteAreaActual;
  const inLand = actual !== undefined && actual !== '' && actual !== null;
  const same = inLand && Math.abs(Number(actual) - r.sqyd) < 0.01;
  return (
    <div className={`area-calc${r.warn ? ' warn' : ''}`}>
      <div className="area-main">
        <strong>{fmt(r.sqyd, 2)} sq.yd</strong>
        <span>{fmt(r.sqft, 2)} sq.ft</span>
      </div>
      <p className="area-note">{r.note}</p>
      {diff !== null && (
        <p className={`area-map${Math.abs(diff) > 10 ? ' off' : ''}`}>
          Map outline: ≈ {fmt(mapSqft)} sq.ft ({diff >= 0 ? '+' : ''}{fmt(diff, 1)}%)
          {Math.abs(diff) > 10 ? ' – more than 10% apart: please re-check the measurements or the map points.' : ' – matches.'}
        </p>
      )}
      {data.land !== undefined && (
        <p className="area-land">
          {same ? '✓ Filled in Land valuation as "Site area as per actual".'
            : inLand ? `Land valuation has ${fmt(actual, 2)} sq.yd as "Site area as per actual" (entered by hand, kept).`
              : 'This fills "Site area as per actual" in Land valuation.'}
        </p>
      )}
    </div>
  );
}

function GridInput({ field, value, onChange, values = {}, setField }) {
  const mode = useContext(MeasureContext);
  // side photos: a Photos column on the first table, each side's photos tagged with the side
  const photoKey = field.sidePhotos && setField ? field.sidePhotos : null;
  const photos = photoKey && Array.isArray(values[photoKey]) ? values[photoKey] : [];
  const setSidePhotos = (side, list) => setField(photoKey, [...photos.filter((p) => p.side !== side), ...list.map((p) => ({ ...p, side }))]);
  // boundaries: each side tagged Front / Rear / Side (from the facing) and Road
  const roles = field.sideRoles ? sideRoles(values.facing) : {};
  const roads = field.sideRoles && Array.isArray(values.roadSides) ? values.roadSides : [];
  const set = (row, col, v) => onChange({ ...value, [row]: { ...(value[row] || {}), [col]: v } });
  // splitColumns: n → stacked tables of n columns each (e.g. boundaries above, dimensions below)
  const n = field.splitColumns || field.columns.length;
  const groups = [];
  for (let i = 0; i < field.columns.length; i += n) groups.push(field.columns.slice(i, i + n));
  return (
    <div className="grid-tables">
      {groups.map((cols, gi) => (
        <div className="table-wrap" key={cols[0].key}>
          <table className={`table input-table${photoKey && gi === 0 ? ' with-photos' : ''}`}>
            <thead>
              <tr><th />{cols.map((c) => <th key={c.key}>{c.label}{c.measure ? <span className="unit"> ({mode === 'm' ? 'm' : 'ft'})</span> : null}</th>)}{photoKey && gi === 0 && <th className="side-photos-head">Photos</th>}</tr>
            </thead>
            <tbody>
              {field.rows.map((r) => {
                const k = r.toLowerCase();
                return (
                  <tr key={k}>
                    <th scope="row">
                      {r}
                      {(roles[r] || roads.includes(r)) && (
                        <span className="side-tags">
                          {roles[r] && <span className={`side-tag ${roles[r].toLowerCase()}`}>{roles[r]}</span>}
                          {roads.includes(r) && <span className="side-tag road">Road</span>}
                        </span>
                      )}
                    </th>
                    {cols.map((c) => (
                      <td key={c.key} data-label={c.label}>{c.measure
                        ? <DimensionText mode={mode} aria-label={`${r} – ${c.label}`} value={value[k]?.[c.key]} onChange={(v) => set(k, c.key, v)} />
                        : <input aria-label={`${r} – ${c.label}`} value={str(value[k]?.[c.key])} onChange={(e) => set(k, c.key, e.target.value)} />}</td>
                    ))}
                    {photoKey && gi === 0 && (
                      <td className="side-photos" data-label={`${r} side photos`}>
                        <FilesInput compact value={photos.filter((p) => p.side === k)} onChange={(list) => setSidePhotos(k, list)} accept="image/*" max={6} noun={`photos of the ${k} side`} gpsCamera />
                      </td>
                    )}
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

// Documents produced: one card per document — type and original/copy on top, number and date, the three details
// (labelled for the document type), then its scans. Quick-add buttons start a card with the type already picked.
function DocumentsInput({ field, value, onChange, errors, name }) {
  const col = (k) => field.columns.find((c) => c.key === k);
  const setCell = (i, key, v) => onChange(value.map((row, j) => (j === i ? { ...row, [key]: v } : row)));
  const add = (type) => onChange([...value, { type: type || '', copy: 'Copy' }]);
  const remove = async (i) => {
    const row = value[i] || {};
    const filled = ['number', 'date', 'detail1', 'detail2', 'detail3'].some((k) => row[k]) || (row.files || []).length;
    if (filled && !(await confirmDialog({ title: `Remove ${row.type || 'this document'}?`, message: 'Its details and scans will be removed from the input sheet.', confirmLabel: 'Remove', tone: 'danger', icon: 'trash' }))) return;
    onChange(value.filter((_, j) => j !== i));
  };
  const cell = (row, i, c, label) => {
    const err = errors[`${name}.${i}.${c.key}`];
    return (
      <div className={`doc-field doc-${c.key}${err ? ' has-error' : ''}`} key={c.key}>
        <span className="field-label">{label || c.label}</span>
        <FieldInput field={c} value={row[c.key]} onChange={(v) => setCell(i, c.key, v)} inTable />
        {err && <span className="error-text">{err}</span>}
      </div>
    );
  };
  return (
    <div className="docs">
      {value.length === 0 && <p className="docs-empty">No documents added yet. Add the first one below.</p>}
      {value.map((row, i) => {
        const labels = documentDetails(row.type).labels;
        return (
          <section className="doc-card" key={i} aria-label={`Document ${i + 1}`}>
            <header className="doc-head">
              <span className="doc-no">{i + 1}</span>
              {cell(row, i, col('type'))}
              <button type="button" className="btn ghost danger doc-remove" aria-label={`Remove document ${i + 1}`} onClick={() => remove(i)}>✕</button>
            </header>
            <div className="doc-grid">
              {cell(row, i, col('number'))}
              {cell(row, i, col('date'))}
              {cell(row, i, col('copy'))}
            </div>
            <div className="doc-grid doc-details">
              {cell(row, i, col('detail1'), labels[0])}
              {cell(row, i, col('detail2'), labels[1])}
              {cell(row, i, col('detail3'), labels[2])}
            </div>
            <div className="doc-uploads">
              <div className="doc-files">
                <span className="field-label">First page <small>· printed in the report as a full page</small></span>
                <FilesInput compact value={row.firstPage || []} onChange={(v) => setCell(i, 'firstPage', v)} accept="image/*" max={1} noun="first page" addLabel={(row.firstPage || []).length ? 'Replace' : '+ First page'} />
              </div>
              <div className="doc-files">
                <span className="field-label">Document <small>· the full copy (PDF or photos), kept on file</small></span>
                <FilesInput compact value={row.files || []} onChange={(v) => setCell(i, 'files', v)} accept={col('files').accept} noun="files per document" addLabel="+ Document" />
              </div>
            </div>
          </section>
        );
      })}
      <div className="doc-add">
        <span className="doc-add-label">Add document</span>
        {col('type').options.map((t) => <button type="button" key={t} className="btn small" onClick={() => add(t)}>+ {t}</button>)}
        <button type="button" className="btn small" onClick={() => add('')}>+ Other document</button>
      </div>
    </div>
  );
}

function TableInput({ field, value, onChange, errors, name }) {
  const { columns } = field;
  const mode = useContext(MeasureContext);
  const setCell = (i, key, v) => onChange(value.map((row, j) => (j === i ? { ...row, [key]: v } : row)));
  // unique columns (e.g. Floor): a value picked in one row is not offered again in the other rows
  const uniqueCols = field.columns.filter((c) => c.unique && c.options);
  const usedElsewhere = (key, i) => new Set(value.filter((_, j) => j !== i).map((r) => r[key]).filter(Boolean));
  const columnFor = (c, i) => {
    if (!c.unique || !c.options) return c;
    const used = usedElsewhere(c.key, i);
    // the row's own value always stays (older sheets may already list a floor twice)
    return { ...c, options: c.options.filter((o) => o === value[i]?.[c.key] || !used.has(o)) };
  };
  // a new row starts on the next free value (Ground → First → Second…)
  const freeValue = (c) => c.options.find((o) => !value.some((r) => r[c.key] === o));
  // all listed values used: no more rows, unless the column takes typed values (Other…)
  const full = uniqueCols.some((c) => !freeValue(c) && !c.allowOther);
  const addRow = () => onChange([...value, Object.fromEntries(uniqueCols.map((c) => [c.key, freeValue(c) || '']))]);
  return (
    <div className="table-wrap">
      <table className="table input-table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key}>{inUnits(c, mode).label}</th>)}<th /></tr>
        </thead>
        <tbody>
          {value.length === 0 && (
            <tr className="empty-row"><td colSpan={columns.length + 1}>No rows added</td></tr>
          )}
          {value.map((row, i) => (
            <tr key={i}>
              {columns.map((c) => {
                const err = errors[`${name}.${i}.${c.key}`];
                return (
                  <td key={c.key} data-label={c.label} className={err ? 'has-error' : ''} title={err || ''}>
                    <FieldInput field={inUnits(columnFor(c, i), mode)} value={row[c.key]} onChange={(v) => setCell(i, c.key, v)} inTable />
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
      {full
        ? <p className="hint add-row-note">All {uniqueCols[0].label.toLowerCase()}s are added.</p>
        : <button type="button" className="btn small add-row" onClick={addRow}>+ Add row</button>}
    </div>
  );
}

// Amenities / services: type the amount for each item that is present (blank = not there)
function TiersInput({ field, value, onChange }) {
  const set = (key, patch) => {
    // typing an amount replaces any older picked value
    const next = { ...value, [key]: { ...(value[key] || {}), ...patch, tier: undefined } };
    const e = next[key];
    if (e.amount === undefined || e.amount === '') delete next[key];
    else { delete e.tier; delete e.qty; }
    onChange(next);
  };
  return (
    <div className="table-wrap">
      <table className="table input-table amount-table">
        <thead>
          <tr><th>Item</th><th className="num">Amount (₹)</th></tr>
        </thead>
        <tbody>
          {field.items.map((item) => {
            const sel = value[item.key] || {};
            const tier = Number(sel.tier) || 0;
            // older sheets: a picked value and no amount → show what it came to
            const fromTier = tier ? Math.round(item.rates[tier - 1] * (item.unit ? Number(sel.qty) || 0 : 1)) : null;
            const shown = sel.amount !== undefined && sel.amount !== null ? str(sel.amount) : fromTier !== null ? String(fromTier) : '';
            return (
              <tr key={item.key} className={shown ? 'selected' : ''}>
                <th scope="row" className="cell-title">{item.label}</th>
                <td className="num cell-amount" data-label="Amount (₹)">
                  <div className="tier-amount">
                    <span className="tier-rs" aria-hidden="true">₹</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      aria-label={`${item.label} – amount`}
                      placeholder="—"
                      value={shown}
                      onChange={(e) => set(item.key, { amount: e.target.value.replace(/\D/g, '') })}
                    />
                  </div>
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
                <PillRow label={`${s.label} – status`} value={value[s.key] || 'Not Started'} onChange={(v) => onChange({ ...value, [s.key]: v })} options={field.options.map((o) => ({ value: o, label: o === 'Not Started' ? 'Not started' : o === 'In Progress' ? 'In progress' : o }))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
