import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

// Uploaded photos need the auth token, so they are fetched as blobs first (same as thumbnails).
function Photo({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    api.fileUrl(file.id).then((u) => live && setUrl(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [file.id]);
  // GPS photos are shown whole (not cropped to the box), so the stamp along the bottom always prints
  const gps = file.gps && Number.isFinite(+file.gps.lat) ? file.gps : null;
  const when = gps?.takenAt ? new Date(gps.takenAt) : null;
  const caption = file.caption || (gps
    ? `GPS ${(+gps.lat).toFixed(6)}, ${(+gps.lon).toFixed(6)}${when && !Number.isNaN(when.getTime()) ? ` · ${when.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}`
    : file.name);
  return (
    <figure className={`photo${gps ? ' is-gps' : ''}`}>
      {url ? <img src={url} alt={file.name} /> : <div className="photo-loading">Loading…</div>}
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// one image filling the rest of the A4 page (a document's first page)
export function FullPagePhoto({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let live = true;
    api.fileUrl(file.id).then((u) => live && setUrl(u)).catch(() => {});
    return () => { live = false; };
  }, [file.id]);
  return <figure className="full-page-photo">{url ? <img src={url} alt={file.name} /> : <div className="photo-loading">Loading…</div>}</figure>;
}

export default function PhotoGrid({ files }) {
  return <div className="photo-grid">{files.slice(0, 6).map((f) => <Photo key={f.id} file={f} />)}</div>;
}
