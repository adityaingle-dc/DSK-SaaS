import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { DuoKey } from '../components/DuoIcons.jsx';
import { api } from '../api/client.js';
import { alertDialog, confirmDialog } from '../components/ConfirmDialog.jsx';

// The valuer's (superadmin's) signature and seal: printed on every report the superadmin approves.
const ITEMS = [
  { name: 'signature', title: 'Signature', hint: 'Signature with the name, qualification and address block.' },
  { name: 'stamp', title: 'Seal', hint: 'The round seal. Also printed small in the footer of every page.' },
];
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');

function BrandCard({ item, info, onChanged }) {
  const [url, setUrl] = useState(null);
  const [busy, setBusy] = useState(false);
  const pick = useRef(null);
  const load = useCallback(() => {
    setUrl(null);
    api.brandUrl(item.name).then(setUrl).catch(() => setUrl(''));
  }, [item.name]);
  useEffect(() => { load(); }, [load, info?.updatedAt, info?.custom]);

  const replace = async (file) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return alertDialog({ title: 'Choose an image', message: 'Upload a PNG or JPG image. A PNG with a transparent background prints best.' });
    setBusy(true);
    try {
      await api.uploadBrand(item.name, file);
      onChanged();
    } catch (e) {
      alertDialog({ title: `Couldn't replace the ${item.title.toLowerCase()}`, message: e.message });
    } finally {
      setBusy(false);
    }
  };
  const restore = async () => {
    if (!(await confirmDialog({ title: `Restore the original ${item.title.toLowerCase()}?`, message: 'The image you uploaded is removed and the original one is printed again.', confirmLabel: 'Restore' }))) return;
    setBusy(true);
    try { await api.resetBrand(item.name); onChanged(); } catch (e) { alertDialog({ title: "Couldn't restore it", message: e.message }); } finally { setBusy(false); }
  };

  return (
    <section className="card brand-card">
      <div className="brand-head">
        <h2>{item.title}</h2>
        <span className="muted small">{info?.custom ? `Replaced ${when(info.updatedAt)}${info.updatedBy ? ` by ${info.updatedBy}` : ''}` : 'Original'}</span>
      </div>
      <div className="brand-preview">{url ? <img src={url} alt={item.title} /> : <span className="muted">{url === '' ? 'Could not load the image' : 'Loading…'}</span>}</div>
      <p className="muted small">{item.hint}</p>
      <div className="brand-actions">
        <button type="button" className="btn primary" onClick={() => pick.current?.click()} disabled={busy}>{busy ? 'Saving…' : 'Replace'}</button>
        {info?.custom && <button type="button" className="btn" onClick={restore} disabled={busy}>Restore original</button>}
      </div>
      <input ref={pick} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { replace(e.target.files?.[0]); e.target.value = ''; }} />
    </section>
  );
}

export default function SignatureSeal() {
  const { isSuperadmin } = useAuth();
  const [info, setInfo] = useState(null);
  const refresh = useCallback(() => api.brandingInfo().then(setInfo).catch(() => setInfo({})), []);
  useEffect(() => { if (isSuperadmin) refresh(); }, [isSuperadmin, refresh]);
  if (!isSuperadmin) return <Navigate to="/" replace />;
  return (
    <div className="page brand-page">
      <PageHeader icon={DuoKey} title="Signature & seal" subtitle="Printed on every report you approve. Drafts and reports waiting for approval are never signed." />
      <div className="brand-grid">
        {ITEMS.map((item) => <BrandCard key={item.name} item={item} info={info?.[item.name]} onChanged={refresh} />)}
      </div>
    </div>
  );
}
