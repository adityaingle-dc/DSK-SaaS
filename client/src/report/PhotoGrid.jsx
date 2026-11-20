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
  return (
    <figure className="photo">
      {url ? <img src={url} alt={file.name} /> : <div className="photo-loading">Loading…</div>}
      <figcaption>{file.caption || file.name}</figcaption>
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
