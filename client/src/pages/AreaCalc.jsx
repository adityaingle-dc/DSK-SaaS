import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { AREA_UNITS, areaIn, boundaryArea, boundaryPerimeter, parseFeet, plotArea, SQFT_PER_SQM, triangleArea } from '@dsk/shared';
import PageHeader from '../components/PageHeader.jsx';
import Segmented from '../components/Segmented.jsx';
import { DuoArea } from '../components/DuoIcons.jsx';

const BoundaryMap = lazy(() => import('../components/BoundaryMap.jsx'));

// Area calculator: a quick plot area from site measurements, without opening a job.
//  - Four sides (+ the diagonal for a plot that isn't a rectangle) — the same working as the site inspection
//  - Triangles — for plots with more than four corners: split into triangles, three sides each
//  - On the map — tap the corners on the satellite map
// The last inputs are kept on this device.
const STORE = 'dsk_area_calc';
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || 'null') || {}; } catch { return {}; } };
const keep = (v) => { try { localStorage.setItem(STORE, JSON.stringify(v)); } catch { /* storage unavailable */ } };
const fmt = (n, d = 2) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { maximumFractionDigits: d, minimumFractionDigits: 0 }) : '—');
const feet = (t) => { const v = parseFeet(t); return Number.isFinite(v) && v > 0 ? v : null; };
const SIDES = [['north', 'North'], ['south', 'South'], ['east', 'East'], ['west', 'West']];

function LengthInput({ id, label, value, onChange }) {
  const ft = feet(value);
  return (
    <label className="ac-len" htmlFor={id}>
      <span>{label}</span>
      <input id={id} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
      <small className={value && !ft ? 'bad' : ''}>{!value ? 'ft, 40\' 6" or 12.2 m' : ft ? `= ${fmt(ft, 2)} ft` : 'Not a length'}</small>
    </label>
  );
}

export default function AreaCalc() {
  const saved = useMemo(load, []);
  const [mode, setMode] = useState(saved.mode || 'sides');
  const [sides, setSides] = useState(saved.sides || { north: '', south: '', east: '', west: '' });
  const [diagonal, setDiagonal] = useState(saved.diagonal || '');
  const [tris, setTris] = useState(saved.tris?.length ? saved.tris : [{ a: '', b: '', c: '' }]);
  const [points, setPoints] = useState(saved.points || []);
  const [focus, setFocus] = useState(null);
  const [copied, setCopied] = useState('');
  const [locMsg, setLocMsg] = useState('');
  useEffect(() => { keep({ mode, sides, diagonal, tris, points }); }, [mode, sides, diagonal, tris, points]);
  // the map opens on where you are (when no corners are marked yet), so you can start tapping the plot
  useEffect(() => { if (mode === 'map' && !points.length && !focus) locate(); }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the area in sq.ft for the chosen way of measuring, and how it was worked out ----
  const result = useMemo(() => {
    if (mode === 'sides') {
      const b = { sides: Object.fromEntries(SIDES.map(([k]) => [k, { dimActual: sides[k] }])), diagonal };
      const r = plotArea(b, diagonal ? '' : 'Rectangular');
      if (!r) return { sqft: null, how: 'Enter all four sides.' };
      const [N, S, E, W] = SIDES.map(([k]) => feet(sides[k]));
      const how = r.method === 'diagonal'
        ? `Two triangles on the diagonal ${fmt(feet(diagonal))} ft: (N ${fmt(N)}, W ${fmt(W)}) + (E ${fmt(E)}, S ${fmt(S)})`
        : N === S && E === W ? `${fmt(N)} × ${fmt(E)} ft` : `((${fmt(N)} + ${fmt(S)}) ÷ 2) × ((${fmt(E)} + ${fmt(W)}) ÷ 2) ft`;
      return { sqft: r.sqft, how, note: r.method === 'diagonal' ? 'Exact for a four-sided plot.' : diagonal ? r.note : (N === S && E === W ? 'Rectangle: length × breadth.' : 'Average of opposite sides: add the diagonal for an exact area.'), warn: !!r.warn || (!diagonal && !(N === S && E === W)) };
    }
    if (mode === 'tris') {
      const parts = tris.map((t) => { const [a, b, c] = [feet(t.a), feet(t.b), feet(t.c)]; return a && b && c ? triangleArea(a, b, c) : null; });
      const ok = parts.filter((x) => Number.isFinite(x));
      if (!ok.length) return { sqft: null, how: 'Enter the three sides of each triangle.', parts };
      const bad = parts.some((x) => x !== null && !Number.isFinite(x));
      return { sqft: ok.reduce((s, x) => s + x, 0), how: ok.map((x) => fmt(x)).join(' + ') + ' sq.ft', parts, warn: bad, note: bad ? 'A triangle’s sides don’t fit together: check it (marked below).' : `${ok.length} triangle${ok.length === 1 ? '' : 's'} added.` };
    }
    const sqm = points.length >= 3 ? boundaryArea(points) : 0;
    if (!sqm) return { sqft: null, how: 'Tap at least 3 corners of the plot on the map.' };
    const perimeter = boundaryPerimeter(points);
    // corners kilometres apart: tapped on a zoomed-out map, not on the plot
    if (perimeter > 5000) return { sqft: sqm * SQFT_PER_SQM, how: `${points.length} points · perimeter ${fmt(perimeter / 1000, 1)} km`, note: 'These corners are kilometres apart: zoom in on the plot (or use your location) and tap its corners again.', warn: true };
    return { sqft: sqm * SQFT_PER_SQM, how: `${points.length} points · perimeter ${fmt(perimeter, 1)} m`, note: 'From the map: phone GPS and imagery are accurate to a few metres, so use it as a check.', warn: false };
  }, [mode, sides, diagonal, tris, points]);

  const units = result.sqft ? areaIn(result.sqft) : null;
  const summary = units ? `Area: ${fmt(units.sqyd)} sq.yd (${fmt(units.sqft)} sq.ft, ${fmt(units.sqm)} sq.m) · ${result.how}` : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(summary); setCopied('Copied'); } catch { setCopied('Select the text to copy'); }
    setTimeout(() => setCopied(''), 2000);
  };
  const clear = () => {
    if (mode === 'sides') { setSides({ north: '', south: '', east: '', west: '' }); setDiagonal(''); }
    else if (mode === 'tris') setTris([{ a: '', b: '', c: '' }]);
    else setPoints([]);
  };
  const locate = () => {
    if (!navigator.geolocation) return setLocMsg('Location is not available on this device.');
    setLocMsg('Locating…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setFocus({ lat: p.coords.latitude, lon: p.coords.longitude }); setLocMsg(`Accuracy ±${Math.round(p.coords.accuracy)} m`); },
      (e) => setLocMsg(e.code === 1 ? 'Location is blocked for this site.' : 'Could not get the location.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  return (
    <div className="page area-page">
      <PageHeader icon={DuoArea} title="Area calculator" subtitle="A quick plot area from the site measurements. Nothing is saved to a job." />
      {/* on a phone the result sits above the inputs, except on the map: there it goes below so the map doesn't jump while tapping */}
      <div className={`ac-layout${mode === 'map' ? ' map-mode' : ''}`}>
        <section className="card ac-input">
          <Segmented
            label="How to measure"
            className="ac-modes"
            options={[{ value: 'sides', label: 'Four sides' }, { value: 'tris', label: 'Triangles' }, { value: 'map', label: 'On the map' }]}
            value={mode}
            onChange={setMode}
          />
          {mode === 'sides' && (
            <>
              <p className="ac-hint">Enter the four sides. If the plot isn't a rectangle, add one diagonal (North-East corner to South-West corner) for an exact area.</p>
              <div className="ac-grid">
                {SIDES.map(([k, l]) => <LengthInput key={k} id={`ac-${k}`} label={l} value={sides[k]} onChange={(v) => setSides((s) => ({ ...s, [k]: v }))} />)}
              </div>
              <LengthInput id="ac-diag" label="Diagonal (NE → SW corner), optional" value={diagonal} onChange={setDiagonal} />
            </>
          )}
          {mode === 'tris' && (
            <>
              <p className="ac-hint">For a plot with more than four corners: split it into triangles with lines between corners, measure each triangle's three sides, and they are added up.</p>
              <div className="ac-tris">
                {tris.map((t, i) => {
                  const part = result.parts?.[i];
                  const bad = part !== null && part !== undefined && !Number.isFinite(part);
                  return (
                    <div key={i} className={`ac-tri${bad ? ' bad' : ''}`}>
                      <span className="ac-tri-no">{i + 1}</span>
                      {['a', 'b', 'c'].map((k, j) => <LengthInput key={k} id={`ac-t${i}${k}`} label={`Side ${j + 1}`} value={t[k]} onChange={(v) => setTris((ts) => ts.map((x, n) => (n === i ? { ...x, [k]: v } : x)))} />)}
                      <span className="ac-tri-area">{bad ? 'Sides don’t fit' : Number.isFinite(part) ? `${fmt(part)} sq.ft` : '—'}</span>
                      {tris.length > 1 && <button type="button" className="btn ghost danger ac-tri-x" aria-label={`Remove triangle ${i + 1}`} onClick={() => setTris((ts) => ts.filter((_, n) => n !== i))}>✕</button>}
                    </div>
                  );
                })}
              </div>
              <button type="button" className="btn small ac-add" onClick={() => setTris((ts) => [...ts, { a: '', b: '', c: '' }])}>+ Add triangle</button>
            </>
          )}
          {mode === 'map' && (
            <>
              <p className="ac-hint">Zoom in on the plot and tap its corners in order, going round it. Drag a point to adjust it, tap it to remove it.</p>
              <div className="ac-map-tools">
                <button type="button" className="btn small" onClick={locate}>Use my location</button>
                <button type="button" className="btn small" disabled={!points.length} onClick={() => setPoints((p) => p.slice(0, -1))}>Undo point</button>
                {locMsg && <span className="ac-hint">{locMsg}</span>}
              </div>
              <Suspense fallback={<div className="bm-map bm-loading">Loading map…</div>}>
                <BoundaryMap points={points} centre={points[0] || null} focus={focus} onChange={setPoints} />
              </Suspense>
            </>
          )}
          <div className="ac-foot"><button type="button" className="link-btn" onClick={clear}>Clear</button></div>
        </section>

        <aside className={`card ac-result${result.warn ? ' warn' : ''}`} aria-live="polite">
          <span className="ac-label">Area</span>
          {units ? (
            <>
              <div className="ac-big"><strong>{fmt(units.sqyd)}</strong><span>sq.yd</span></div>
              <div className="ac-sub">{fmt(units.sqft)} sq.ft · {fmt(units.sqm)} sq.m</div>
              <table className="ac-units">
                <tbody>
                  {AREA_UNITS.filter((u) => !['sqyd', 'sqft', 'sqm'].includes(u.key)).map((u) => (
                    <tr key={u.key}><th>{u.label}</th><td>{fmt(units[u.key], u.key === 'guntha' || u.key === 'cent' ? 2 : 4)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="ac-how"><b>Working:</b> {result.how}</p>
              {result.note && <p className="ac-note">{result.note}</p>}
              <div className="ac-copy">
                <button type="button" className="btn small primary" onClick={copy}>Copy result</button>
                {copied && <span className="ac-hint">{copied}</span>}
              </div>
              <p className="ac-summary" aria-label="Result text">{summary}</p>
            </>
          ) : (
            <p className="ac-empty">{result.how}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
