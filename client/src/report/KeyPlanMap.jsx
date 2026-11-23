// Map images for the report. With a Google Maps key (VITE_GOOGLE_MAPS_KEY): one Google Static Maps image per map
// ("Google Map Extract"); without one: a mosaic of free map tiles. Either way the plot outline, the numbered points
// and the pin are drawn on top, and they print as normal images.
//  - KeyPlanMap: street map (OpenStreetMap) with the plot outline and a pin at the centre
//  - SitePlanMap: close satellite view (Esri World Imagery) of the area under the pinned points, numbered as on the form
// A tile mosaic is positioned so the property sits in the middle of the frame. Beyond the imagery's own zoom
// (19), tiles are scaled up so a small plot still fills the frame.
import { useState } from 'react';
import { GOOGLE_KEY, staticMapUrl } from '../utils/googleMaps.js';

const TILE = 256;
const SOURCES = {
  streets: { max: 19, url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, credit: 'Map data © OpenStreetMap contributors' },
  satellite: { max: 19, url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, credit: 'Imagery © Esri, Maxar, Earthstar Geographics' },
};
const GOOGLE_CREDIT = { streets: 'Map data © Google', satellite: 'Imagery © Google' };

function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

// highest zoom at which the whole plot fits `fill` of the frame
function fitZoom(boundary, width, height, fallback, { fill = 0.6, maxZoom = 19, minZoom = 14 } = {}) {
  if (!boundary?.length) return fallback;
  for (let z = maxZoom; z >= minZoom; z--) {
    const pts = boundary.map((p) => tileXY(p.lat, p.lon, z));
    const w = (Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x))) * TILE;
    const h = (Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y))) * TILE;
    if (w < width * fill && h < height * fill) return z;
  }
  return minZoom;
}

// Google Static Maps when there is a key; the free tiles if Google refuses the image (onGoogleFail tells the caption)
// fit: zoom to fit the plot outline (else the given zoom is used, e.g. a zoomed-out location map)
function TileMap({ lat, lon, boundary, layer = 'streets', zoom: zoomIn = 17, width = 680, height = 380, fill = 0.6, maxZoom = 19, numbered = false, pin = true, outline = '#dc2626', google: GOOGLE = false, onGoogleFail, fit = true }) {
  const src = SOURCES[layer];
  const boundaryN = (boundary || []).map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  // centre of the frame: the middle of the points' extent (so the outline is centred), else the GPS location
  let cLat = Number(lat);
  let cLon = Number(lon);
  if (!pin && boundaryN.length) {
    cLat = (Math.min(...boundaryN.map((p) => p.lat)) + Math.max(...boundaryN.map((p) => p.lat))) / 2;
    cLon = (Math.min(...boundaryN.map((p) => p.lon)) + Math.max(...boundaryN.map((p) => p.lon))) / 2;
  }
  // Google Static Maps: one image up to 640 px wide (fetched at twice the resolution), shown at the frame's size; the
  // outline is placed with the same map maths (k = shown size / image size)
  const gw = Math.min(640, width);
  const gh = Math.min(640, Math.round((height * gw) / width));
  const k = width / gw;
  const zoom = !fit ? zoomIn : GOOGLE
    ? fitZoom(boundaryN, gw, gh, Math.min(zoomIn, 20), { fill, maxZoom: Math.min(maxZoom, 20) })
    : fitZoom(boundaryN, width, height, zoomIn, { fill, maxZoom });
  const tz = GOOGLE ? zoom : Math.min(zoom, src.max); // zoom the tiles are fetched at
  const T = GOOGLE ? TILE * k : TILE * 2 ** (zoom - tz); // displayed tile size
  const { x, y } = tileXY(cLat, cLon, tz);
  // every tile that touches the frame
  const x0 = Math.floor(x - width / 2 / T);
  const y0 = Math.floor(y - height / 2 / T);
  const cols = Math.floor(x + width / 2 / T) - x0 + 1;
  const rows = Math.floor(y + height / 2 / T) - y0 + 1;
  const offX = width / 2 - (x - x0) * T;
  const offY = height / 2 - (y - y0) * T;
  const tiles = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) tiles.push([x0 + i, y0 + j, i, j]);
  const px = (p) => { const t = tileXY(p.lat, p.lon, tz); return [width / 2 + (t.x - x) * T, height / 2 + (t.y - y) * T]; };
  const pts = boundaryN.map(px);
  const centre = px({ lat: Number(lat), lon: Number(lon) });

  return (
    <div className="keyplan-frame" style={{ width, height }}>
      {GOOGLE ? (
        <img src={staticMapUrl({ lat: cLat, lon: cLon, zoom, width: gw, height: gh, maptype: layer === 'satellite' ? 'satellite' : 'roadmap' })} alt="" width={width} height={height} style={{ left: 0, top: 0 }} onError={() => onGoogleFail?.()} />
      ) : tiles.map(([tx, ty, i, j]) => (
        <img key={`${tx}-${ty}`} src={src.url(tz, tx, ty)} alt="" width={T} height={T} style={{ left: offX + i * T, top: offY + j * T }} referrerPolicy="no-referrer" />
      ))}
      {(pts.length >= 2 || (numbered && pts.length)) && (
        <svg className="keyplan-outline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {pts.length >= 3 && (
            <polygon points={pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ')} fill={`${outline}26`} stroke={outline} strokeWidth="2.5" strokeLinejoin="round" />
          )}
          {pts.length === 2 && <polyline points={pts.map(([a, b]) => `${a},${b}`).join(' ')} stroke={outline} strokeWidth="2.5" fill="none" />}
          {numbered && pts.map(([a, b], i) => (
            <g key={i}>
              <circle cx={a} cy={b} r="9" fill="#facc15" stroke="#422006" strokeWidth="1.2" />
              <text x={a} y={b + 3.4} textAnchor="middle" fontSize="10" fontWeight="700" fill="#422006" fontFamily="Arial, sans-serif">{i + 1}</text>
            </g>
          ))}
          {numbered && Number.isFinite(centre[0]) && (
            <g>
              <circle cx={centre[0]} cy={centre[1]} r="5" fill="#dc2626" stroke="#fff" strokeWidth="2" />
            </g>
          )}
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

// Google until it refuses an image, then the free maps (and their credit)
const useGoogleImages = () => { const [failed, setFailed] = useState(false); return [!!GOOGLE_KEY && !failed, () => setFailed(true)]; };

export default function KeyPlanMap({ lat, lon, boundary, zoom = 17, width = 680, height = 380 }) {
  const [google, onGoogleFail] = useGoogleImages();
  return (
    <figure className="keyplan">
      <TileMap lat={lat} lon={lon} boundary={boundary} zoom={zoom} width={width} height={height} google={google} onGoogleFail={onGoogleFail} />
      <figcaption>
        {google ? GOOGLE_CREDIT.streets : SOURCES.streets.credit} ·{' '}
        <a className="no-print-link" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
      </figcaption>
    </figure>
  );
}

// how far across a map image is, e.g. "about 3 km across" (Web Mercator: metres per pixel at this zoom and latitude)
export function acrossText(lat, zoom, widthPx) {
  const m = ((156543.03392 * Math.cos((Number(lat) * Math.PI) / 180)) / 2 ** zoom) * widthPx;
  if (!Number.isFinite(m)) return '';
  return m >= 1000 ? `about ${(Math.round(m / 100) / 10).toLocaleString('en-IN')} km across` : `about ${Math.round(m / 10) * 10} m across`;
}

// The Key Plan page: a zoomed-out street map (where the property is: the neighbourhood and main roads) and a close-up
// satellite view (the property itself, with its outline when the corners were marked)
export const LOCATION_ZOOM = 15; // about 3 km across
export function LocationMaps({ lat, lon, boundary, width = 680, height = 330 }) {
  const [googleOut, failOut] = useGoogleImages();
  const [googleIn, failIn] = useGoogleImages();
  const pts = (boundary || []).filter((p) => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon)));
  // close-up zoom: fitted to the outline, else a fixed close view around the pin
  const closeZoom = pts.length >= 3 ? fitZoom(pts.map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) })), googleIn ? Math.min(640, width) : width, googleIn ? Math.min(640, Math.round((height * Math.min(640, width)) / width)) : height, 19, { fill: 0.6, maxZoom: googleIn ? 20 : 19 }) : 19;
  return (
    <div className="keyplan-pair">
      <figure className="keyplan">
        <TileMap lat={lat} lon={lon} boundary={pts} zoom={LOCATION_ZOOM} fit={false} width={width} height={height} google={googleOut} onGoogleFail={failOut} />
        <figcaption>
          <b>Location (zoomed out)</b> · {acrossText(lat, LOCATION_ZOOM, googleOut ? Math.min(640, width) : width)} · {googleOut ? GOOGLE_CREDIT.streets : SOURCES.streets.credit} ·{' '}
          <a className="no-print-link" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
        </figcaption>
      </figure>
      <figure className="keyplan">
        <TileMap lat={lat} lon={lon} boundary={pts} layer="satellite" zoom={closeZoom} fit={false} width={width} height={height} maxZoom={21} pin={pts.length < 3} outline="#facc15" google={googleIn} onGoogleFail={failIn} />
        <figcaption><b>Close-up of the property</b> · {acrossText(lat, closeZoom, googleIn ? Math.min(640, width) : width)} · {googleIn ? GOOGLE_CREDIT.satellite : SOURCES.satellite.credit}{pts.length >= 3 ? ' · outline: the points marked at site' : ' · pin: the GPS location'}</figcaption>
      </figure>
    </div>
  );
}

// close satellite view of the plot with its pinned points (numbered) and the centre (red dot)
export function SitePlanMap({ lat, lon, boundary, width = 680, height = 400 }) {
  const [google, onGoogleFail] = useGoogleImages();
  return (
    <figure className="keyplan">
      <TileMap lat={lat} lon={lon} boundary={boundary} layer="satellite" width={width} height={height} fill={0.78} maxZoom={21} numbered pin={false} outline="#facc15" google={google} onGoogleFail={onGoogleFail} />
      <figcaption>{google ? GOOGLE_CREDIT.satellite : SOURCES.satellite.credit} · numbered points as marked at site; red dot: centre (GPS location)</figcaption>
    </figure>
  );
}
