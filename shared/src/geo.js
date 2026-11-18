// Plot boundary helpers (pins dropped around the plot on the map in the input sheet).
// Points are { lat, lon } in degrees. Good enough for plot-sized shapes (local flat-earth projection).

export const MIN_BOUNDARY_POINTS = 10;
export const MAX_BOUNDARY_POINTS = 60;
export const SQFT_PER_SQM = 10.7639;
export const SQYD_PER_SQM = 1.19599;

const R = 6371008.8; // mean earth radius, metres
const rad = (d) => (d * Math.PI) / 180;

// project to metres around the first point
function project(points) {
  const lat0 = rad(points[0].lat);
  return points.map((p) => ({ x: rad(p.lon - points[0].lon) * R * Math.cos(lat0), y: rad(p.lat - points[0].lat) * R }));
}

// enclosed area in m² (shoelace); 0 for fewer than 3 points
export function boundaryArea(points = []) {
  if (points.length < 3) return 0;
  const xy = project(points);
  let a = 0;
  for (let i = 0; i < xy.length; i++) {
    const p = xy[i], q = xy[(i + 1) % xy.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

// perimeter in metres (closed shape)
export function boundaryPerimeter(points = []) {
  if (points.length < 2) return 0;
  const xy = project(points);
  let d = 0;
  for (let i = 0; i < xy.length; i++) {
    const p = xy[i], q = xy[(i + 1) % xy.length];
    d += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return d;
}

// centre of the plot: area centroid, falling back to the average of the pins
export function boundaryCentre(points = []) {
  if (!points.length) return null;
  const round = (n) => +n.toFixed(7);
  const avg = { lat: round(points.reduce((s, p) => s + p.lat, 0) / points.length), lon: round(points.reduce((s, p) => s + p.lon, 0) / points.length) };
  if (points.length < 3) return avg;
  const xy = project(points);
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < xy.length; i++) {
    const p = xy[i], q = xy[(i + 1) % xy.length];
    const f = p.x * q.y - q.x * p.y;
    a += f; cx += (p.x + q.x) * f; cy += (p.y + q.y) * f;
  }
  if (Math.abs(a) < 1e-9) return avg;
  cx /= 3 * a; cy /= 3 * a;
  const lat0 = rad(points[0].lat);
  return { lat: round(points[0].lat + (cy / R) * (180 / Math.PI)), lon: round(points[0].lon + (cx / (R * Math.cos(lat0))) * (180 / Math.PI)) };
}

// keep only valid points, rounded to ~1 cm
export function cleanBoundary(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((p) => ({ lat: Number(p?.lat), lon: Number(p?.lon) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180)
    .slice(0, MAX_BOUNDARY_POINTS)
    .map((p) => ({ lat: +p.lat.toFixed(7), lon: +p.lon.toFixed(7) }));
}
