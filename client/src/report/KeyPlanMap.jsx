// Map images for the report, built from map tiles (no API key needed; they print as normal images).
//  - KeyPlanMap: street map (OpenStreetMap) with the plot outline and a pin at the centre
//  - SitePlanMap: close satellite view (Esri World Imagery) of the area under the pinned points, numbered as on the form
// A tile mosaic is positioned so the property sits in the middle of the frame. Beyond the imagery's own zoom
// (19), tiles are scaled up so a small plot still fills the frame.
const TILE = 256;
const SOURCES = {
  streets: { max: 19, url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, credit: 'Map data © OpenStreetMap contributors' },
  satellite: { max: 19, url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, credit: 'Imagery © Esri, Maxar, Earthstar Geographics' },
};

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

function TileMap({ lat, lon, boundary, layer = 'streets', zoom: zoomIn = 17, width = 680, height = 380, fill = 0.6, maxZoom = 19, numbered = false, pin = true, outline = '#dc2626' }) {
  const src = SOURCES[layer];
  const boundaryN = (boundary || []).map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) })).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  // centre of the frame: the middle of the points' extent (so the outline is centred), else the GPS location
  let cLat = Number(lat);
  let cLon = Number(lon);
  if (!pin && boundaryN.length) {
    cLat = (Math.min(...boundaryN.map((p) => p.lat)) + Math.max(...boundaryN.map((p) => p.lat))) / 2;
    cLon = (Math.min(...boundaryN.map((p) => p.lon)) + Math.max(...boundaryN.map((p) => p.lon))) / 2;
  }
  const zoom = fitZoom(boundaryN, width, height, zoomIn, { fill, maxZoom });
  const tz = Math.min(zoom, src.max); // zoom the tiles are fetched at
  const T = TILE * 2 ** (zoom - tz); // displayed tile size
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
      {tiles.map(([tx, ty, i, j]) => (
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

export default function KeyPlanMap({ lat, lon, boundary, zoom = 17, width = 680, height = 380 }) {
  return (
    <figure className="keyplan">
      <TileMap lat={lat} lon={lon} boundary={boundary} zoom={zoom} width={width} height={height} />
      <figcaption>
        {SOURCES.streets.credit} ·{' '}
        <a className="no-print-link" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
      </figcaption>
    </figure>
  );
}

// close satellite view of the plot with its pinned points (numbered) and the centre (red dot)
export function SitePlanMap({ lat, lon, boundary, width = 680, height = 400 }) {
  return (
    <figure className="keyplan">
      <TileMap lat={lat} lon={lon} boundary={boundary} layer="satellite" width={width} height={height} fill={0.78} maxZoom={21} numbered pin={false} outline="#facc15" />
      <figcaption>{SOURCES.satellite.credit} · numbered points as marked at site; red dot: centre (GPS location)</figcaption>
    </figure>
  );
}
