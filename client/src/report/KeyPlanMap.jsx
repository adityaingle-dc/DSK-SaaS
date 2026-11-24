// Map images for the report, from Google Static Maps ("Google Map Extract"): one image per map, with the plot
// outline, the numbered points and the pin drawn on top (they print as normal images).
//  - LocationMaps (Key Plan page): a zoomed-out street map (where the property is) and a close-up satellite view
//  - SitePlanMap: close satellite view of the area under the pinned points, numbered as on the form
// Without a working Google Maps key the frame says so instead.
import { useState } from 'react';
import { GOOGLE_KEY, staticMapUrl } from '../utils/googleMaps.jsx';

const TILE = 256;
const MAX_IMG = 640; // Google Static Maps: up to 640 × 640 (fetched at twice the resolution)
const CREDIT = { roadmap: 'Map data © Google', satellite: 'Imagery © Google' };

// world position (in 256-px tiles) of a point at a zoom (Web Mercator, as Google uses)
function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

// highest zoom at which the whole plot fits `fill` of the frame
function fitZoom(boundary, width, height, fallback, { fill = 0.6, maxZoom = 20, minZoom = 14 } = {}) {
  if (!boundary?.length) return fallback;
  for (let z = maxZoom; z >= minZoom; z--) {
    const pts = boundary.map((p) => tileXY(p.lat, p.lon, z));
    const w = (Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))) * TILE;
    const h = (Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))) * TILE;
    if (w < width * fill && h < height * fill) return z;
  }
  return minZoom;
}

// how far across a map image is, e.g. "about 3 km across" (metres per pixel at this zoom and latitude)
export function acrossText(lat, zoom, widthPx) {
  const m = ((156543.03392 * Math.cos((Number(lat) * Math.PI) / 180)) / 2 ** zoom) * widthPx;
  if (!Number.isFinite(m)) return '';
  return m >= 1000 ? `about ${(Math.round(m / 100) / 10).toLocaleString('en-IN')} km across` : `about ${Math.round(m / 10) * 10} m across`;
}

const points = (boundary) => (boundary || []).map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
// image size requested from Google for a frame of width × height (same proportions)
const imgSize = (width, height) => { const w = Math.min(MAX_IMG, width); return { w, h: Math.min(MAX_IMG, Math.round((height * w) / width)) }; };

// One Google map image of the frame's size, with the outline / numbered points / pin placed with the same map maths.
// fit: zoom to fit the plot outline (else `zoom` is used, e.g. a zoomed-out location map)
function GoogleMapImage({ lat, lon, boundary, maptype = 'roadmap', zoom: zoomIn = 17, fit = true, width = 680, height = 380, fill = 0.6, numbered = false, pin = true, outline = '#dc2626' }) {
  const [failed, setFailed] = useState(false);
  const pts = points(boundary);
  let cLat = Number(lat);
  let cLon = Number(lon);
  // centre of the frame: the middle of the points' extent (so the outline is centred), else the GPS location
  if (!pin && pts.length) {
    cLat = (Math.min(...pts.map((p) => p.lat)) + Math.max(...pts.map((p) => p.lat))) / 2;
    cLon = (Math.min(...pts.map((p) => p.lon)) + Math.max(...pts.map((p) => p.lon))) / 2;
  }
  const { w, h } = imgSize(width, height);
  const zoom = fit ? fitZoom(pts, w, h, Math.min(zoomIn, 20), { fill }) : zoomIn;
  if (!GOOGLE_KEY || failed || !Number.isFinite(cLat) || !Number.isFinite(cLon)) {
    return (
      <div className="keyplan-frame keyplan-missing" style={{ width, height }}>
        {!Number.isFinite(cLat) ? 'GPS location not captured in the input sheet.' : 'Map image unavailable: the Google Maps key is missing, or it does not allow the Maps Static API for this website.'}
      </div>
    );
  }
  const k = width / w; // shown size / image size
  const c = tileXY(cLat, cLon, zoom);
  const px = (p) => { const t = tileXY(p.lat, p.lon, zoom); return [width / 2 + (t.x - c.x) * TILE * k, height / 2 + (t.y - c.y) * TILE * k]; };
  const xy = pts.map(px);
  const centre = px({ lat: Number(lat), lon: Number(lon) });
  return (
    <div className="keyplan-frame" style={{ width, height }}>
      <img src={staticMapUrl({ lat: cLat, lon: cLon, zoom, width: w, height: h, maptype })} alt="" width={width} height={height} style={{ left: 0, top: 0 }} onError={() => setFailed(true)} />
      {(xy.length >= 2 || (numbered && xy.length)) && (
        <svg className="keyplan-outline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {xy.length >= 3 && <polygon points={xy.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')} fill={`${outline}26`} stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />}
          {xy.length === 2 && <polyline points={xy.map(([a, b]) => `${a},${b}`).join(' ')} stroke={outline} strokeWidth="2.5" fill="none" />}
          {numbered && xy.map(([a, b], i) => (
            <g key={i}>
              <circle cx={a} cy={b} r="9" fill="#facc15" stroke="#422006" strokeWidth="1.2" />
              <text x={a} y={b + 3.4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#422006" fontFamily="Arial, sans-serif">{i + 1}</text>
            </g>
          ))}
          {numbered && Number.isFinite(centre[0]) && <circle cx={centre[0]} cy={centre[1]} r="5" fill="#dc2626" stroke="#fff" strokeWidth="2" />}
        </svg>
      )}
      {pin && (
        <svg className="keyplan-pin" width="34" height="46" viewBox="0 0 34 46" aria-hidden="true">
          <path d="M17 1C8.2 1 1 8 1 16.8 1 28.5 17 45 17 45s16-16.5 16-28.2C33 8 25.8 1 17 1z" fill="#dc2626" stroke="#fff" strokeWidth="2" />
          <circle cx="17" cy="17" r="6" fill="#fff" />
        </svg>
      )}
    </div>
  );
}

// The Key Plan page: a zoomed-out street map (where the property is: the neighbourhood and main roads) and a close-up
// satellite view (the property itself, with its outline when the corners were marked)
export const LOCATION_ZOOM = 15; // about 3 km across
export function LocationMaps({ lat, lon, boundary, width = 680, height = 330 }) {
  const pts = points(boundary);
  const { w, h } = imgSize(width, height);
  const closeZoom = pts.length >= 3 ? fitZoom(pts, w, h, 19, { fill: 0.6 }) : 19;
  return (
    <div className="keyplan-pair">
      <figure className="keyplan">
        <GoogleMapImage lat={lat} lon={lon} boundary={pts} zoom={LOCATION_ZOOM} fit={false} width={width} height={height} />
        <figcaption>
          <b>Location (zoomed out)</b> · {acrossText(lat, LOCATION_ZOOM, w)} · {CREDIT.roadmap} ·{' '}
          <a className="no-print-link" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
        </figcaption>
      </figure>
      <figure className="keyplan">
        <GoogleMapImage lat={lat} lon={lon} boundary={pts} maptype="satellite" zoom={closeZoom} fit={false} width={width} height={height} pin={pts.length < 3} outline="#facc15" />
        <figcaption><b>Close-up of the property</b> · {acrossText(lat, closeZoom, w)} · {CREDIT.satellite}{pts.length >= 3 ? ' · outline: the points marked at site' : ' · pin: the GPS location'}</figcaption>
      </figure>
    </div>
  );
}

// close satellite view of the plot with its pinned points (numbered) and the centre (red dot)
export function SitePlanMap({ lat, lon, boundary, width = 680, height = 400 }) {
  return (
    <figure className="keyplan">
      <GoogleMapImage lat={lat} lon={lon} boundary={boundary} maptype="satellite" width={width} height={height} fill={0.78} numbered pin={false} outline="#facc15" />
      <figcaption>{CREDIT.satellite} · numbered points as marked at site; red dot: centre (GPS location)</figcaption>
    </figure>
  );
}
