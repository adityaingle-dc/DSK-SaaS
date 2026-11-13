// Key plan from OpenStreetMap tiles (no API key needed; prints as normal images).
// A 4×3 tile mosaic is positioned so the property sits exactly under the marker.
const TILE = 256;

function tileXY(lat, lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const r = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n;
  return { x, y };
}

export default function KeyPlanMap({ lat, lon, zoom = 17, width = 680, height = 380 }) {
  const { x, y } = tileXY(Number(lat), Number(lon), zoom);
  const cols = Math.ceil(width / TILE) + 1;
  const rows = Math.ceil(height / TILE) + 1;
  const x0 = Math.floor(x - cols / 2);
  const y0 = Math.floor(y - rows / 2);
  // pixel offset so (x, y) lands in the centre of the frame
  const offX = width / 2 - (x - x0) * TILE;
  const offY = height / 2 - (y - y0) * TILE;
  const tiles = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) tiles.push([x0 + i, y0 + j, i, j]);

  return (
    <figure className="keyplan">
      <div className="keyplan-frame" style={{ width, height }}>
        {tiles.map(([tx, ty, i, j]) => (
          <img
            key={`${tx}-${ty}`}
            src={`https://tile.openstreetmap.org/${zoom}/${tx}/${ty}.png`}
            alt=""
            width={TILE}
            height={TILE}
            style={{ left: offX + i * TILE, top: offY + j * TILE }}
            referrerPolicy="no-referrer"
          />
        ))}
        <svg className="keyplan-pin" width="34" height="46" viewBox="0 0 34 46" aria-hidden="true">
          <path d="M17 1C8.2 1 1 8 1 16.8 1 28.5 17 45 17 45s16-16.5 16-28.2C33 8 25.8 1 17 1z" fill="#dc2626" stroke="#fff" strokeWidth="2" />
          <circle cx="17" cy="17" r="6" fill="#fff" />
        </svg>
      </div>
      <figcaption>
        Map data © OpenStreetMap contributors ·{' '}
        <a className="no-print-link" href={`https://www.google.com/maps/search/?api=1&query=${lat},${lon}`} target="_blank" rel="noreferrer">Open in Google Maps</a>
      </figcaption>
    </figure>
  );
}
