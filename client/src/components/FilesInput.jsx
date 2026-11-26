import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
// After the photo comes back: a location found while the camera was open is used at once if it is within
// GOOD_ENOUGH_M (like a GPS camera app); otherwise the best one is waited for, up to LOCATION_WAIT_MS.
const LOCATION_WAIT_MS = 15000;
const GOOD_ENOUGH_M = 100;
const metres = (a, b) => {
  const r = Math.PI / 180;
  const x = (b.longitude - a.longitude) * r * Math.cos(((a.latitude + b.latitude) / 2) * r);
  const y = (b.latitude - a.latitude) * r;
  return Math.sqrt(x * x + y * y) * 6371000;
};
// watch the position from the moment the camera button is tapped (and look up the address of the first fix in the
// background), so both are ready when the photo comes back
function startLocating() {
  if (!navigator.geolocation) {
    const no = new Error('This phone or browser cannot share its location.');
    return { get: () => Promise.reject(no), addressFor: () => Promise.resolve(''), stop: () => {} };
  }
  let best = null; let blocked = null; let lookup = null;
  const waiters = new Set();
  const id = navigator.geolocation.watchPosition(
    (p) => {
      if (!best || p.coords.accuracy < best.coords.accuracy) best = p;
      if (!lookup) lookup = { at: p.coords, address: shortAddress(p.coords.latitude, p.coords.longitude) };
      waiters.forEach((w) => w());
    },
    (e) => {
      // blocked: give up now; no signal / timed out: keep watching until the wait runs out
      if (e.code === 1) { blocked = new Error('Location is blocked. Allow location for this site (and turn on GPS) to take GPS photos.'); waiters.forEach((w) => w()); }
    },
    { enableHighAccuracy: true, maximumAge: 10000 },
  );
  const get = () => new Promise((resolve, reject) => {
    let timer;
    const finish = (fn) => { clearTimeout(timer); waiters.delete(check); fn(); };
    function check() {
      if (best && best.coords.accuracy <= GOOD_ENOUGH_M) finish(() => resolve(best));
      else if (blocked) finish(() => reject(blocked));
    }
    waiters.add(check);
    timer = setTimeout(() => finish(() => (best ? resolve(best) : reject(new Error('Could not get the location in time. Turn on GPS, step outside if needed, and try again.')))), LOCATION_WAIT_MS);
    check();
  });
  // the address looked up already, when the photo's position is near it; else a fresh (quick) lookup
  const addressFor = (pos) => (lookup && metres(lookup.at, pos.coords) < 250 ? lookup.address : shortAddress(pos.coords.latitude, pos.coords.longitude));
  return { get, addressFor, stop: () => navigator.geolocation.clearWatch(id) };
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
    const r = await Promise.race([api.reverseGeocode(lat, lon), new Promise((res) => setTimeout(() => res(null), 3000))]);
    const f = r?.fields || {};
    return [f.street, f.village, f.localBodyName !== f.village ? f.localBodyName : '', [f.district, f.pincode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  } catch { return ''; }
}

// running inside the DSKRISHNA Android app (its WebView adds this to the user agent)
const IN_APP = typeof navigator !== 'undefined' && /DSKRISHNA-App/.test(navigator.userAgent || '');

const sizeText = (b) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// a photo on the whole screen: after taking a GPS photo (Use photo / Retake) and when a thumbnail is tapped
export function PhotoPreview({ url, title, info, actions = [], onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = before; };
  }, [onClose]);
  return createPortal(
    <div className="photo-preview" role="dialog" aria-modal="true" aria-label={title || 'Photo'}>
      <div className="pp-top">
        <span className="pp-title">{title}</span>
        <button type="button" className="pp-close" aria-label="Close" onClick={onClose}>✕</button>
      </div>
      <div className="pp-image">{url ? <img src={url} alt={title || 'Photo'} /> : <span className="pp-loading">Loading…</span>}</div>
      {info && <div className="pp-info">{info}</div>}
      {actions.length > 0 && (
        <div className="pp-actions">
          {actions.map((a) => <button key={a.label} type="button" className={`btn${a.primary ? ' primary' : ''}`} onClick={a.onClick} disabled={a.disabled}>{a.label}</button>)}
        </div>
      )}
    </div>,
    document.body,
  );
}

export function FileThumb({ file, onRemove }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState(false);
  const isImage = file.type?.startsWith('image/') && !/hei[cf]/.test(file.type);

  useEffect(() => {
    let live = true;
    if (isImage) api.fileUrl(file.id).then((u) => live && setUrl(u)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [file.id, isImage]);

  const open = async () => {
    // photos open on the whole screen here (with their stamp); PDFs and others in their own viewer
    if (isImage) { setViewing(true); return; }
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
      {viewing && (
        <PhotoPreview
          url={url}
          title={file.name}
          info={file.gps ? `GPS ${file.gps.lat}, ${file.gps.lon}${file.gps.takenAt ? ` · ${new Date(file.gps.takenAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}` : null}
          onClose={() => setViewing(false)}
        />
      )}
    </div>
  );
}

// gpsCamera: the camera button takes a GPS photo (location, date and time stamped on it). Location off: the phone is
// asked to turn it on; if it stays off, a normal photo is offered instead. "+ Upload" adds from the gallery / files.
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
  const [preview, setPreview] = useState(null); // a GPS photo just taken: { file, gps, url }

  // which photo the camera is taking: 'gps' (stamped) or 'plain' (a normal photo, when location is not available)
  const mode = useRef('gps');
  const openPlainCamera = () => { mode.current = 'plain'; cameraRef.current?.click(); };
  const launchGps = () => {
    mode.current = 'gps';
    locating.current?.stop();
    locating.current = startLocating();
    cameraRef.current?.click();
  };
  // location not available: offer a normal photo instead (the camera opens from the button tap in the dialog)
  const offerPlain = async (why) => {
    if (await confirmDialog({ title: 'Take a normal photo?', message: `${why} You can take a normal photo instead, without the location stamp.`, confirmLabel: 'Take normal photo', cancelLabel: 'Cancel' })) openPlainCamera();
  };
  // inside the Android app the WebView may answer "prompt" every time even after location was allowed: once location
  // has worked on this phone it is treated as allowed (if it fails later, the photo is offered as a normal one)
  const GEO_OK = 'dsk_geo_ok';
  const geoWorked = () => { try { return localStorage.getItem(GEO_OK) === '1'; } catch { return false; } };
  const markGeoWorked = () => { try { localStorage.setItem(GEO_OK, '1'); } catch { /* storage off: just ask again */ } };
  const locationPermission = async () => {
    let state = 'unknown';
    try { if (navigator.permissions?.query) state = (await navigator.permissions.query({ name: 'geolocation' })).state; } catch { /* unknown */ }
    return state === 'prompt' && geoWorked() ? 'granted' : state;
  };
  // ask for location once (the phone shows its own prompt): true · false (not allowed) · 'off' (allowed, GPS off)
  const askLocation = () => new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(() => resolve(true), (e) => resolve(e.code === 1 ? false : 'off'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  });
  const openGpsCamera = async () => {
    setError('');
    if (!navigator.geolocation) return offerPlain('This phone cannot share its location.');
    // in the DSKRISHNA app, Android itself asks for location (once, when the app opens): no extra question here
    if (IN_APP) return launchGps();
    const state = await locationPermission();
    // allowed (or the browser can't tell): straight to the camera; GPS being off is handled when the photo comes back
    if (state === 'granted' || state === 'unknown') return launchGps();
    if (state === 'denied') {
      return offerPlain('Location is blocked. To stamp photos with the location, allow it in the phone settings (Settings → Apps → DSKRISHNA or your browser → Permissions → Location).');
    }
    // not asked yet: ask to turn it on first
    const allow = await confirmDialog({ title: 'Turn on location?', message: 'GPS photos get the location, date and time stamped on them. Allow location when the phone asks.', confirmLabel: 'Allow location', cancelLabel: 'Normal photo' });
    if (!allow) return openPlainCamera();
    const got = await askLocation();
    if (got === true) {
      markGeoWorked();
      if (await confirmDialog({ title: 'Location is on', message: 'Now take the photo: the location, date and time are stamped on it.', confirmLabel: 'Open GPS camera', cancelLabel: 'Cancel' })) launchGps();
      return;
    }
    return offerPlain(got === 'off' ? 'Could not get the location. Turn on Location (GPS) in the phone settings to take GPS photos.' : 'Location was not allowed.');
  };
  const addGpsPhoto = async (fileList) => {
    const original = fileList?.[0];
    const loc = locating.current;
    if (!original || !loc) return;
    if (latest.current.length >= max) { loc.stop(); return setError(`Up to ${max} ${noun}.`); }
    setUploading((n) => n + 1);
    setStatus('Getting the location…');
    let pos = null; let why = null;
    try { pos = await loc.get(); } catch (e) { why = e; } finally { loc.stop(); }
    if (!pos) {
      // no location (GPS off, no signal, not allowed): keep the photo as a normal one if wanted
      setStatus('');
      setUploading((n) => n - 1);
      const keep = await confirmDialog({ title: 'No location for this photo', message: `${why?.message || 'Could not get the location.'} Add it as a normal photo, without the location stamp?`, confirmLabel: 'Add as normal photo', cancelLabel: 'Discard' });
      if (keep) addFiles([original]);
      return;
    }
    markGeoWorked();
    try {
      setStatus('Stamping the location on the photo…');
      const address = await loc.addressFor(pos); // looked up while the camera was open
      const file = await stampPhoto(original, pos, address);
      const gps = { lat: +pos.coords.latitude.toFixed(7), lon: +pos.coords.longitude.toFixed(7), accuracy: Math.round(pos.coords.accuracy), takenAt: new Date(pos.timestamp || Date.now()).toISOString() };
      // show the stamped photo first: it is added only on "Use photo"
      setPreview({ file, gps, url: URL.createObjectURL(file) });
    } catch (e) {
      setError(`${e.message} The photo was not added.`);
    } finally {
      setStatus('');
      setUploading((n) => n - 1);
    }
  };
  const closePreview = () => setPreview((p) => { if (p?.url) URL.revokeObjectURL(p.url); return null; });
  const usePreviewPhoto = async () => {
    const p = preview;
    if (!p) return;
    closePreview();
    setUploading((n) => n + 1);
    try {
      const ref = await api.uploadFile(p.file, { gps: p.gps });
      const withGps = { ...ref, gps: ref.gps || p.gps };
      onChange([...latest.current, withGps]);
      latest.current = [...latest.current, withGps];
    } catch (e) {
      setError(`${e.message} The photo was not added.`);
    } finally {
      setUploading((n) => n - 1);
    }
  };
  // "Retake": the tap opens the camera again straight away
  const retake = () => { closePreview(); launchGps(); };

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
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = [...(e.target.files || [])]; if (gpsCamera && mode.current === 'gps') addGpsPhoto(f); else addFiles(f); e.target.value = ''; }} />
      {status && <span className="hint">{status}</span>}
      {error && <span className="error-text">{error}</span>}
      {preview && (
        <PhotoPreview
          url={preview.url}
          title="GPS photo"
          info={`Location, date and time are stamped on the photo · ±${preview.gps.accuracy} m`}
          onClose={closePreview}
          actions={[
            { label: 'Retake', onClick: retake },
            { label: 'Use photo', onClick: usePreviewPhoto, primary: true },
          ]}
        />
      )}
    </div>
  );
}
