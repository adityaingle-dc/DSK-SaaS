import { useEffect, useRef, useState } from 'react';
import { ALLOWED_FILE_TYPES, MAX_FILE_BYTES, MAX_FILES } from '@dsk/shared';
import { api } from '../api/client.js';
import { alertDialog, confirmDialog } from './ConfirmDialog.jsx';

const MAX_DIMENSION = 2400; // px – plenty for reading a deed, keeps phone photos ~0.5–1.5 MB

// Downscale large JPEG/PNG/WEBP photos before upload (phone cameras produce 4–12 MB images)
async function compressImage(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5 * 1024 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file; // browser can't decode it – upload as is
  }
}

// ---------- GPS camera: the location, date and time are stamped on the photo (like a GPS camera app) ----------
const LOCATION_WAIT_MS = 25000;
// watch the position from the moment the camera button is tapped, so it is ready when the photo comes back
function startLocating() {
  if (!navigator.geolocation) return { promise: Promise.reject(new Error('This phone or browser cannot share its location.')), stop: () => {} };
  let best = null; let id = null; let settle;
  const promise = new Promise((resolve, reject) => {
    settle = { resolve, reject };
    id = navigator.geolocation.watchPosition(
      (p) => { if (!best || p.coords.accuracy < best.coords.accuracy) best = p; if (best.coords.accuracy <= 30) resolve(best); },
      (e) => reject(new Error(e.code === 1 ? 'Location is blocked. Allow location for this site (and turn on GPS) to take GPS photos.' : 'Could not get the location. Turn on GPS and try again.')),
      { enableHighAccuracy: true, maximumAge: 10000, timeout: LOCATION_WAIT_MS },
    );
  });
  const timer = setTimeout(() => (best ? settle.resolve(best) : settle.reject(new Error('Could not get the location in time. Turn on GPS, step outside if needed, and try again.'))), LOCATION_WAIT_MS);
  return { promise, stop: () => { clearTimeout(timer); if (id != null) navigator.geolocation.clearWatch(id); } };
}

async function stampPhoto(file, pos, address) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale); const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  const { latitude, longitude, accuracy } = pos.coords;
  const when = new Date(pos.timestamp || Date.now());
  const lines = [
    `Lat ${latitude.toFixed(6)}°  Long ${longitude.toFixed(6)}°  (±${Math.round(accuracy)} m)`,
    when.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }),
    ...(address ? [address] : []),
  ];
  const fs = Math.max(14, Math.round(Math.min(w, h) * 0.032));
  const pad = Math.round(fs * 0.7);
  const band = pad * 2 + lines.length * fs * 1.35;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, h - band, w, band);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  lines.forEach((t, i) => {
    ctx.font = `${i === 0 ? 700 : 500} ${fs}px Arial, sans-serif`;
    ctx.fillText(t, pad, h - band + pad + i * fs * 1.35, w - pad * 2);
  });
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  if (!blob) throw new Error('Could not prepare the photo');
  return new File([blob], `gps-${when.toISOString().slice(0, 19).replace(/[:T]/g, '-')}.jpg`, { type: 'image/jpeg' });
}

// "Village, Mandal, District 503224" for the stamp (skipped quickly if the lookup is slow or offline)
async function shortAddress(lat, lon) {
  try {
    const r = await Promise.race([api.reverseGeocode(lat, lon), new Promise((res) => setTimeout(() => res(null), 4000))]);
    const f = r?.fields || {};
    return [f.street, f.village, f.localBodyName !== f.village ? f.localBodyName : '', [f.district, f.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  } catch { return ''; }
}

const sizeText = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export function FileThumb({ file, onRemove }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const isImage = file.type?.startsWith('image/') && !/hei[cf]/.test(file.type);

  useEffect(() => {
    let live = true;
    if (isImage) api.fileUrl(file.id).then((u) => live && setUrl(u)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [file.id, isImage]);

  const open = async () => {
    const w = window.open('', '_blank');
    try {
      w.location.href = await api.fileUrl(file.id);
    } catch (e) {
      w?.close();
      alertDialog({ title: "Couldn't open the file", message: e.message });
    }
  };

  return (
    <div className="thumb" title={`${file.name} · ${sizeText(file.size)}`}>
      <button type="button" className="thumb-body" onClick={open}>
        {isImage && url ? <img src={url} alt={file.name} /> : <span className="thumb-icon">{failed ? '⚠' : file.type === 'application/pdf' ? 'PDF' : 'IMG'}</span>}
      </button>
      <span className="thumb-name">{file.gps && <span className="thumb-gps" title={`GPS ${file.gps.lat}, ${file.gps.lon}`}>GPS</span>}{file.name}</span>
      {onRemove && (
        <button type="button" className="thumb-remove" aria-label={`Remove ${file.name}`} onClick={onRemove}>✕</button>
      )}
    </div>
  );
}

// gpsCamera: the camera button takes a GPS photo (location, date and time stamped on it); a photo without a location
// is not added. "+ Upload" still adds photos from the gallery / files.
// compact: a small version for a table cell (thumbnails + short buttons)
export default function FilesInput({ value = [], onChange, accept = 'image/*,application/pdf', max = MAX_FILES, noun = 'files per document', gpsCamera = false, compact = false, addLabel }) {
  const pickRef = useRef(null);
  const cameraRef = useRef(null);
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState('');
  const latest = useRef(value);
  latest.current = value;
  const locating = useRef(null);
  const [status, setStatus] = useState('');

  const openGpsCamera = () => {
    setError('');
    locating.current?.stop();
    locating.current = startLocating();
    locating.current.promise.catch(() => {}); // handled when the photo comes back
    cameraRef.current?.click();
  };
  const addGpsPhoto = async (fileList) => {
    const original = fileList?.[0];
    const loc = locating.current;
    if (!original || !loc) return;
    if (latest.current.length >= max) { loc.stop(); return setError(`Up to ${max} ${noun}.`); }
    setUploading((n) => n + 1);
    setStatus('Getting the location…');
    try {
      const pos = await loc.promise;
      setStatus('Stamping the location on the photo…');
      const address = await shortAddress(pos.coords.latitude, pos.coords.longitude);
      const file = await stampPhoto(original, pos, address);
      const gps = { lat: +pos.coords.latitude.toFixed(7), lon: +pos.coords.longitude.toFixed(7), accuracy: Math.round(pos.coords.accuracy), takenAt: new Date(pos.timestamp || Date.now()).toISOString() };
      const ref = await api.uploadFile(file, { gps });
      const withGps = { ...ref, gps: ref.gps || gps };
      onChange([...latest.current, withGps]);
      latest.current = [...latest.current, withGps];
    } catch (e) {
      setError(`${e.message} The photo was not added.`);
    } finally {
      loc.stop();
      setStatus('');
      setUploading((n) => n - 1);
    }
  };

  const addFiles = async (fileList) => {
    setError('');
    const files = [...fileList];
    // a one-file slot (e.g. a document's first page): a new file replaces the old one
    const single = max === 1;
    const room = single ? 1 : max - latest.current.length;
    if (files.length > room) setError(`Up to ${max} ${noun}.`);
    for (const original of files.slice(0, Math.max(room, 0))) {
      if (original.type && !ALLOWED_FILE_TYPES.includes(original.type)) {
        setError(`${original.name}: only images (JPG, PNG, WEBP, HEIC) or PDF.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const file = await compressImage(original);
        if (file.size > MAX_FILE_BYTES) throw new Error(`${original.name} is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB`);
        const ref = await api.uploadFile(file);
        const old = single ? latest.current : [];
        const next = single ? [ref] : [...latest.current, ref];
        onChange(next);
        latest.current = next;
        old.forEach((f) => api.deleteFile(f.id).catch(() => {})); // succeeds only for files not yet saved on a sheet
      } catch (e) {
        setError(e.message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const remove = async (id) => {
    const f = value.find((x) => x.id === id);
    const photo = f?.type?.startsWith('image/');
    if (!(await confirmDialog({ title: photo ? 'Remove this photo?' : 'Remove this file?', message: `${f?.name || 'It'} will be removed from the input sheet.`, confirmLabel: 'Remove', tone: 'danger', icon: 'trash' }))) return;
    onChange(latest.current.filter((x) => x.id !== id));
    api.deleteFile(id).catch(() => {}); // succeeds only for files not yet saved on a valuation
  };

  return (
    <div className={`files-input${compact ? ' compact' : ''}`}>
      <div className="thumbs">
        {value.map((f) => <FileThumb key={f.id} file={f} onRemove={() => remove(f.id)} />)}
        {uploading > 0 && <div className="thumb uploading"><span className="thumb-icon">…</span><span className="thumb-name">Uploading</span></div>}
      </div>
      <div className="files-actions">
        <button type="button" className="btn small" onClick={() => pickRef.current?.click()} disabled={max > 1 && value.length >= max}>{addLabel || (compact ? (/pdf/.test(accept) ? '+ Scan / photo' : '+ Photo') : '+ Upload')}</button>
        {gpsCamera
          ? <button type="button" className="btn small camera-btn gps-camera-btn" onClick={openGpsCamera} disabled={value.length >= max}>GPS camera</button>
          : <button type="button" className="btn small camera-btn" onClick={() => cameraRef.current?.click()}>Camera</button>}
      </div>
      <input ref={pickRef} type="file" accept={accept} multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files; if (gpsCamera) addGpsPhoto(f); else addFiles(f); e.target.value = ''; }} />
      {status && <span className="hint">{status}</span>}
      {error && <span className="error-text">{error}</span>}
    </div>
  );
}
