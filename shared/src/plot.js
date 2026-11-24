// Plot facing, road sides and site area from the measured sides.
//  - facing: the front; the rear is the opposite side and the other two are the sides
//  - road sides: start on the facing side; a second road side makes it a corner plot
//  - the boundary (actual) of a road side reads "Road (30 ft wide)" automatically
//  - area: average of opposite sides, or (with one diagonal) two triangles by Heron's formula – exact for any
//    four-sided plot. Dimensions are in feet; 1 sq.yd = 9 sq.ft.

export const DIRECTIONS = ['North', 'South', 'East', 'West'];
export const OPPOSITE = { North: 'South', South: 'North', East: 'West', West: 'East' };
export const PLOT_INTERMITTENT = 'Intermittent plot with single road frontage.';
export const PLOT_CORNER = 'Corner plot with two-side road frontage.';

// { North: 'Front', South: 'Rear', East: 'Side', West: 'Side' }
export function sideRoles(facing) {
  if (!OPPOSITE[facing]) return {};
  return Object.fromEntries(DIRECTIONS.map((d) => [d, d === facing ? 'Front' : d === OPPOSITE[facing] ? 'Rear' : 'Side']));
}

const roadText = (w) => (Number(w) > 0 ? `Road (${Number(w)} ft wide)` : 'Road');
const isAutoRoad = (t) => /^Road( \(\d+(\.\d+)? ft wide\))?$/.test(String(t || '').trim());

// "Actual" follows "Document" (boundary and dimension of each side): typing the document value fills the actual one
// the same, as long as the actual one is empty or still the same as the document was; a value changed by hand stays.
const ACTUAL_OF = { deed: 'actual', dimDeed: 'dimActual' };
function mirrorActual(before = {}, after = {}) {
  const out = { ...after };
  for (const side of Object.keys(after)) {
    const b = before[side] || {};
    const a = { ...(after[side] || {}) };
    for (const [doc, act] of Object.entries(ACTUAL_OF)) {
      if ((a[doc] ?? '') === (b[doc] ?? '')) continue; // this document value didn't change
      const followed = !b[act] || String(b[act]) === String(b[doc] ?? '');
      if (followed && (a[act] ?? '') === (b[act] ?? '')) a[act] = a[doc] ?? '';
    }
    out[side] = a;
  }
  return out;
}

// Boundaries section: keeps facing → road sides → boundary text (and the corner / intermittent answer) in step, and
// "Actual" following "Document". Returns the changes to make; a key "site.plotPosition" belongs to another section.
export function linkBoundaries(values = {}, key, value, data = {}) {
  if (key === 'sides') return { sides: mirrorActual(values.sides, value) };
  const patch = { [key]: value };
  if (!['facing', 'roadSides', 'roadWidthFt'].includes(key)) return patch;
  let roads = Array.isArray(values.roadSides) ? values.roadSides : [];
  if (key === 'facing') {
    const old = values.facing;
    // the road follows the facing while it is still just the old facing side (or not set)
    if (!roads.length || (roads.length === 1 && roads[0] === old)) {
      const next = value ? [value] : [];
      if (next.join() !== roads.join()) patch.roadSides = next;
      roads = next;
    }
  } else if (key === 'roadSides') {
    roads = Array.isArray(value) ? value : [];
  }
  const width = key === 'roadWidthFt' ? value : values.roadWidthFt;
  // boundary (actual) of each road side
  const sides = values.sides || {};
  let changed = false;
  const nextSides = { ...sides };
  for (const d of DIRECTIONS) {
    const k = d.toLowerCase();
    const cur = sides[k]?.actual;
    let want = cur;
    if (roads.includes(d)) { if (!cur || isAutoRoad(cur)) want = roadText(width); }
    else if (isAutoRoad(cur)) want = '';
    if ((want || '') !== (cur || '')) { nextSides[k] = { ...(sides[k] || {}), actual: want }; changed = true; }
  }
  if (changed) patch.sides = nextSides;
  // corner / intermittent plot (Site characteristics), unless something else was chosen there
  const pos = data.site?.plotPosition;
  if (!pos || pos === PLOT_INTERMITTENT || pos === PLOT_CORNER) {
    const target = roads.length >= 2 ? PLOT_CORNER : roads.length === 1 ? PLOT_INTERMITTENT : '';
    if (target && target !== pos) patch['site.plotPosition'] = target;
  }
  return patch;
}

// "40", "40.5", "40'", "40' 6\"", "40ft 6in", "40-6", "12.2 m" → feet (NaN if unreadable)
export function parseFeet(input) {
  const s = String(input ?? '').trim().toLowerCase().replace(/,/g, '');
  if (!s) return NaN;
  const metres = s.match(/^(\d+(?:\.\d+)?)\s*(m|mt|mtr|mtrs|metres?|meters?)$/);
  if (metres) return Number(metres[1]) * 3.28084;
  const fi = s.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|feet|’)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|''|in|inch|inches|”)?)?$/);
  if (fi) return Number(fi[1]) + (fi[2] ? Number(fi[2]) / 12 : 0);
  const dash = s.match(/^(\d+)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (dash && Number(dash[2]) < 12) return Number(dash[1]) + Number(dash[2]) / 12;
  const plain = s.match(/^(\d+(?:\.\d+)?)$/);
  return plain ? Number(plain[1]) : NaN;
}

// area of a triangle from its three sides (Heron's formula); NaN when the sides can't make a triangle
export const triangleArea = (a, b, c) => heron(Number(a), Number(b), Number(c));
const heron = (a, b, c) => {
  const s = (a + b + c) / 2;
  const q = s * (s - a) * (s - b) * (s - c);
  return q > 0 ? Math.sqrt(q) : NaN; // NaN: the three lengths cannot make a triangle
};
const round2 = (x) => Math.round(x * 100) / 100;

// boundaries = data.boundaries; shape = data.property.siteShape
// → { sqft, sqyd, method, note } or null when the four sides are not all measured
export function plotArea(boundaries = {}, shape = '') {
  const sides = boundaries.sides || {};
  const len = (k) => parseFeet(sides[k]?.dimActual || sides[k]?.dimDeed);
  const N = len('north'); const S = len('south'); const E = len('east'); const W = len('west');
  if (![N, S, E, W].every((x) => Number.isFinite(x) && x > 0)) return null;
  const d = parseFeet(boundaries.diagonal);
  if (Number.isFinite(d) && d > 0) {
    // corners NE, SE, SW, NW; the diagonal NE–SW makes triangles (North, West, d) and (East, South, d)
    const a = heron(N, W, d) + heron(E, S, d);
    if (Number.isFinite(a)) return { sqft: round2(a), sqyd: round2(a / 9), method: 'diagonal', note: 'Four sides + diagonal (two triangles): exact for a four-sided plot.' };
    return { ...averageArea(N, S, E, W), note: 'The diagonal does not fit these sides (please re-check it); worked out from the average of opposite sides.', warn: true };
  }
  const r = averageArea(N, S, E, W);
  if (shape === 'Irregular') return { ...r, note: 'Average of opposite sides. Add the diagonal for an exact area of an irregular plot.', warn: true };
  return r;
}
function averageArea(N, S, E, W) {
  const a = ((N + S) / 2) * ((E + W) / 2);
  const rect = Math.abs(N - S) < 0.01 && Math.abs(E - W) < 0.01;
  return { sqft: round2(a), sqyd: round2(a / 9), method: 'average', note: rect ? 'Length × breadth.' : 'Average of opposite sides × each other.' };
}

// the plot's perimeter in feet (North + South + East + West, actual or else as per deed): the compound wall length
// → number, or null until all four sides are measured
export function plotPerimeter(boundaries = {}) {
  const sides = boundaries.sides || {};
  const len = (k) => parseFeet(sides[k]?.dimActual || sides[k]?.dimDeed);
  const all = ['north', 'south', 'east', 'west'].map(len);
  if (!all.every((x) => Number.isFinite(x) && x > 0)) return null;
  return round2(all.reduce((s, x) => s + x, 0));
}

// Building dimensions (Building valuation): length (North–South, road front) × breadth (East–West, depth) as per
// permission and as per actual → built-up area of each; slab = (length + North + South extensions) ×
// (breadth + East + West extensions), on the actual dimensions (else the permission ones). Feet / sq.ft.
export function buildingDims(b = {}) {
  const n = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
  const pair = (l, br) => ({ length: n(l), breadth: n(br), area: n(l) && n(br) ? round2(n(l) * n(br)) : null });
  const permission = pair(b.dimLengthPermission, b.dimBreadthPermission);
  const actual = pair(b.dimLengthActual, b.dimBreadthActual);
  const base = actual.area ? actual : permission;
  const ext = { north: n(b.slabExtNorth), south: n(b.slabExtSouth), east: n(b.slabExtEast), west: n(b.slabExtWest) };
  const slabLength = base.length ? base.length + ext.north + ext.south : 0;
  const slabBreadth = base.breadth ? base.breadth + ext.east + ext.west : 0;
  return {
    permission, actual, ext,
    slab: { length: round2(slabLength), breadth: round2(slabBreadth), area: slabLength && slabBreadth ? round2(slabLength * slabBreadth) : null, from: actual.area ? 'actual' : 'permission' },
  };
}

// Building section: "as per actual" follows "as per permission" (typing the permission value fills the actual one the
// same while it is empty or still equal to the permission value; a value changed by hand stays)
const ACTUAL_OF_PERMISSION = { dimLengthPermission: 'dimLengthActual', dimBreadthPermission: 'dimBreadthActual' };
export function linkBuildingDims(values = {}, key, value) {
  const patch = { [key]: value };
  const act = ACTUAL_OF_PERMISSION[key];
  if (act) {
    const before = values[key];
    const cur = values[act];
    if (cur === undefined || cur === null || cur === '' || String(cur) === String(before ?? '')) patch[act] = value;
  }
  return patch;
}

// Site characteristics → "Road width", answered from the road width typed in Boundaries & dimensions (feet):
// under 20 ft → below 20 ft, else above. → the option, or '' when no width is given
export const ROAD_ABOVE_20 = "Above 20' Wide";
export const ROAD_BELOW_20 = 'Below 20 Ft Wide';
export function roadWidthChoice(widthFt) {
  const w = Number(widthFt);
  if (!Number.isFinite(w) || w <= 0) return '';
  return w < 20 ? ROAD_BELOW_20 : ROAD_ABOVE_20;
}

// one area in the units used for plots in India (from sq.ft)
export const AREA_UNITS = [
  { key: 'sqyd', label: 'sq.yd', per: 9 },
  { key: 'sqft', label: 'sq.ft', per: 1 },
  { key: 'sqm', label: 'sq.m', per: 10.7639 },
  { key: 'guntha', label: 'guntha', per: 1089 },
  { key: 'cent', label: 'cents', per: 435.6 },
  { key: 'acre', label: 'acres', per: 43560 },
  { key: 'hectare', label: 'hectares', per: 107639.1 },
];
export const areaIn = (sqft) => Object.fromEntries(AREA_UNITS.map((u) => [u.key, sqft / u.per]));
