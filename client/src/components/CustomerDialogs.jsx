import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isFirm, linkPerson, SECTIONS, SERVICES } from '@dsk/shared';
import { api } from '../api/client.js';
import Modal from './Modal.jsx';
import { confirmDialog } from './ConfirmDialog.jsx';
import SchemaSection from './SchemaForm.jsx';
import { initials } from './Layout.jsx';
import SearchBox from './SearchBox.jsx';
import { groupByProperty } from '../utils/properties.js';
import { IconChevron, IconPlus } from './Icons.jsx';
import { ROLE_LABELS, useAuth } from '../context/AuthContext.jsx';
import { STATUS_LABELS } from './StatusBadge.jsx';

const applicantField = (key) => SECTIONS.find((s) => s.key === 'applicant')?.fields.find((f) => f.key === key);
const applicantOptions = (key) => applicantField(key)?.options || [];
export const CUSTOMER_SOURCES = ['Walk-in', 'Phone call', 'Bank referral', 'Existing customer', 'Website', 'Contact person', 'Other'];
const generalField = (key) => SECTIONS.find((x) => x.key === 'general').fields.find((f) => f.key === key);
// what the customer asks for: Site Visit · Building Permission · Valuation
// service requested, property type and bank, drawn like the input sheet (buttons, bank → branch with IFSC)
const JOB_SECTION = {
  key: 'job',
  fields: [
    { key: 'service', label: 'Service requested', type: 'select', options: SERVICES, required: true },
    { ...generalField('propertyType'), required: true },
    { ...generalField('bankName'), label: 'Bank', required: false },
    { ...generalField('branch'), required: false },
  ],
};

const mobileOk = (v) => /^[6-9][0-9]{9}$/.test(String(v || '').replace(/\D/g, '').slice(-10));
const SitePinMap = lazy(() => import('./SitePinMap.jsx'));

// The site address on a map: found from the typed address (a moment after typing stops), then a tap or a drag puts the
// pin exactly on the plot, or "My location" when standing at the site. The pin is saved with the job, so the site
// inspection's map opens on it. It stops following the typed address once the pin is placed by hand.
function SiteMap({ site, pin, onPin }) {
  const [focus, setFocus] = useState(() => (pin ? { ...pin, zoom: 18 } : null));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const byHand = useRef(false);
  const t = (k) => String(site[k] || '').trim();
  const findable = t('village') || /^[1-9][0-9]{5}$/.test(t('pincode')) || (t('street').length > 3 && t('district'));
  // the full address first, then with fewer parts (house numbers and colony names are often not on the map)
  const tries = [
    [t('number'), t('street'), t('village'), t('district'), t('pincode')],
    [t('street'), t('village'), t('district'), t('pincode')],
    [t('village'), t('district'), t('pincode')],
    [t('village'), t('district')],
    [t('pincode')],
  ].map((parts) => parts.filter(Boolean).join(', ')).filter((q, i, all) => q.length >= 3 && all.indexOf(q) === i);
  const key = tries[0] || '';
  const find = async () => {
    if (!tries.length) { setMsg('Type the site address first.'); return; }
    setBusy(true);
    setMsg('Finding the address on the map…');
    try {
      for (const [i, q] of tries.entries()) {
        const { result } = await api.geocode(q);
        if (result) {
          const exact = result.exact ?? i <= 1; // Google says when it found the exact address
          setFocus({ lat: result.lat, lon: result.lon, zoom: exact ? 18 : 15 });
          onPin({ lat: result.lat, lon: result.lon });
          setMsg(exact ? 'Found the address. Drag the pin or tap to put it exactly on the plot.' : `Found ${q}: the area only. Tap the exact plot on the map.`);
          return;
        }
      }
      setMsg('This address is not on the map. Zoom in and tap the site on the map.');
    } catch (e) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (byHand.current || !findable) return undefined;
    const h = setTimeout(find, 1200);
    return () => clearTimeout(h);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const place = (p) => { byHand.current = true; onPin(p); setMsg('Pin placed. Drag it to adjust.'); };
  const locate = () => {
    if (!navigator.geolocation) { setMsg('Location is not available on this device.'); return; }
    setMsg('Locating…');
    navigator.geolocation.getCurrentPosition(
      (p) => { const pt = { lat: +p.coords.latitude.toFixed(7), lon: +p.coords.longitude.toFixed(7) }; byHand.current = true; setFocus({ ...pt, zoom: 19 }); onPin(pt); setMsg(`Your location (±${Math.round(p.coords.accuracy)} m). Drag the pin if needed.`); },
      (e) => setMsg(e.code === 1 ? 'Location is blocked for this site.' : 'Could not get the location.'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };
  return (
    <div className="site-map">
      <div className="site-map-head">
        <span className="site-map-title">Site on the map <span className="muted small">(optional)</span></span>
        <span className="site-map-actions">
          <button type="button" className="btn small" onClick={() => { byHand.current = false; find(); }} disabled={busy}>Find address</button>
          <button type="button" className="btn small" onClick={locate}>My location</button>
          {pin && <button type="button" className="link-btn" onClick={() => { byHand.current = true; onPin(null); setMsg(''); }}>Clear</button>}
        </span>
      </div>
      <Suspense fallback={<div className="bm-map sp-map bm-loading">Loading map…</div>}>
        <SitePinMap pin={pin} focus={focus} onChange={place} />
      </Suspense>
      <small className="muted site-map-note">{msg || (pin ? 'Drag the pin or tap to move it.' : 'Type the address above to find it, or tap the site on the map.')}{pin && <span className="site-map-ll"> · {pin.lat.toFixed(6)}, {pin.lon.toFixed(6)}</span>}</small>
    </div>
  );
}
// the site address asked when a job starts (copied into the sheet's "Property location")
const SITE_FIELDS = [['number', 'Plot / H.No. / Flat No.'], ['street', 'Road / street / colony'], ['village', 'Village / area'], ['district', 'District'], ['pincode', 'Pincode']];
const EMPTY_SITE = Object.fromEntries(SITE_FIELDS.map(([k]) => [k, '']));
const EMPTY = {
  contactType: 'individual', pocName: '', pocPhone: '', salutation: 'Sri.', name: '', phone1: '',
  service: '', propertyType: '', bankName: '', branch: '', ifsc: '', site: EMPTY_SITE, siteLocation: null, evaluator: '',
};
// service and bank when editing a customer (the property and the site belong to each job)
const EDIT_SECTION = { key: 'job', fields: JOB_SECTION.fields.filter((f) => f.key !== 'propertyType') };

// a new customer's entries are kept on this device until they are saved
const draftKey = (userId) => `dsk_customer_draft2:${userId || 'me'}`;
const readDraft = (userId) => {
  try { return JSON.parse(localStorage.getItem(draftKey(userId)) || 'null'); } catch { return null; }
};
const writeDraft = (userId, value) => {
  try {
    if (value) localStorage.setItem(draftKey(userId), JSON.stringify(value));
    else localStorage.removeItem(draftKey(userId));
  } catch { /* storage unavailable: the form still works, only the draft is not kept */ }
};

// who does the site inspection (superadmin): "Myself" first, then the field evaluators
function useInspectors(enabled, myId) {
  const [people, setPeople] = useState(null);
  useEffect(() => {
    if (!enabled) return;
    api.listUsers({ status: 'active' })
      .then((r) => setPeople((r.items || [])
        .filter((u) => u.status === 'active' && u.role !== 'drafter')
        .sort((a, b) => (b._id === myId) - (a._id === myId) || (a.role === 'evaluator' ? 0 : 1) - (b.role === 'evaluator' ? 0 : 1) || a.name.localeCompare(b.name))))
      .catch(() => setPeople([]));
  }, [enabled, myId]);
  return people;
}

// Add a customer on one page, everything visible: new customer or POC, name and contact, the service requested, request,
// type of property, bank, site address, and who does the site inspection. Saving adds the customer and creates the
// site inspection sheet, filled in from these details. Editing a customer shows only the customer's own details.
export function CustomerFormModal({ customer, onClose, onSaved }) {
  const { user, isSuperadmin } = useAuth();
  const navigate = useNavigate();
  const myId = user?._id || user?.id;
  const editing = !!customer;
  const [initial] = useState(() => (customer
    ? { ...EMPTY, ...customer, contactType: customer.contactType || 'individual', service: SERVICES.includes(customer.serviceRequest) ? customer.serviceRequest : '' }
    : EMPTY));
  const [draft] = useState(() => (editing ? null : readDraft(user?._id)));
  const [form, setForm] = useState(() => (draft ? { ...EMPTY, ...draft, site: { ...EMPTY_SITE, ...(draft.site || {}) } } : initial));
  const [restored, setRestored] = useState(!!draft);
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [dupeId, setDupeId] = useState(null);
  const [busy, setBusy] = useState(false);
  const people = useInspectors(!editing && isSuperadmin, myId);
  const poc = form.contactType === 'poc';
  const assignee = isSuperadmin ? form.evaluator : myId;
  const mine = !isSuperadmin || assignee === myId;
  // previous POCs matching what is typed, to fill the name and phone in one tap
  const [pocHints, setPocHints] = useState([]);

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // salutation and name keep each other in step (typing "Mrs " picks Smt.)
  const setPerson = (k) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, ...linkPerson(f, k, v) })); };
  const setSite = (k) => (e) => { const v = e.target.value; setForm((f) => ({ ...f, site: { ...f.site, [k]: v } })); };

  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  useEffect(() => { if (!editing) writeDraft(user?._id, dirty ? form : null); }, [form, dirty, editing, user?._id]);
  useEffect(() => {
    if (!poc || form.pocName.trim().length < 2) { setPocHints([]); return undefined; }
    let live = true;
    const t = setTimeout(() => api.listPocs(form.pocName.trim()).then((r) => live && setPocHints((r.items || []).filter((x) => x.pocPhone !== form.pocPhone).slice(0, 4))).catch(() => {}), 250);
    return () => { live = false; clearTimeout(t); };
  }, [poc, form.pocName, form.pocPhone]);

  const siteGiven = form.site.street.trim() || form.site.village.trim();
  const errors = {
    name: !form.name.trim() ? "Customer's name is required" : null,
    phone1: poc ? (form.phone1 && !mobileOk(form.phone1) ? 'Enter a 10-digit mobile number' : null) : !mobileOk(form.phone1) ? 'Enter a 10-digit mobile number' : null,
    pocName: poc && !form.pocName.trim() ? "POC's name is required" : null,
    pocPhone: poc && !mobileOk(form.pocPhone) ? 'Enter a 10-digit mobile number' : null,
    'job.service': !editing && !form.service ? 'Choose the service requested' : null,
    'job.propertyType': !editing && !form.propertyType ? 'Choose the type of property' : null,
    site: !editing && !mine && !siteGiven ? 'Enter the street or the village so the evaluator can find the site' : null,
    evaluator: !editing && isSuperadmin && !form.evaluator ? 'Choose who will do the site inspection' : null,
  };
  const show = (k) => tried && errors[k];

  const requestClose = async () => {
    if (busy) return;
    if (dirty && !(await confirmDialog({
      title: editing ? 'Discard your changes?' : 'Discard this customer?',
      message: editing ? 'The changes you made to this customer will be lost.' : 'The details you have filled in will be cleared.',
      confirmLabel: 'Discard', cancelLabel: 'Keep editing', tone: 'danger',
    }))) return;
    if (!editing) writeDraft(user?._id, null);
    onClose();
  };
  const startOver = () => { setForm(EMPTY); setRestored(false); setTried(false); writeDraft(user?._id, null); };

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) {
      setTimeout(() => document.querySelector('.cf-form .has-error, .cf-form .field-error, .cf-form .error-text')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 30);
      return;
    }
    setError('');
    setDupeId(null);
    setBusy(true);
    const person = {
      contactType: form.contactType, salutation: form.salutation, name: form.name.trim(), phone1: form.phone1,
      pocName: poc ? form.pocName.trim() : '', pocPhone: poc ? form.pocPhone : '',
      bankName: form.bankName, branch: form.branch, ifsc: form.ifsc || '', ...(form.service ? { serviceRequest: form.service } : {}),
    };
    try {
      if (editing) { onSaved(await api.updateCustomer(customer._id, person)); return; }
      const site = Object.fromEntries(Object.entries(form.site).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      if (form.siteLocation) site.location = form.siteLocation;
      const job = {
        evaluator: isSuperadmin ? form.evaluator : undefined, service: form.service, propertyType: form.propertyType,
        bankName: form.bankName, branch: form.branch, ifsc: form.ifsc, site: Object.keys(site).length ? site : undefined,
      };
      const saved = await api.createCustomer({ ...person, job });
      writeDraft(user?._id, null);
      // doing the site inspection yourself: straight into the sheet
      if (saved.valuation?.self) { navigate(`/valuations/${saved.valuation._id}/edit`); return; }
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setDupeId(err.errors?.[0]?.customerId || null);
      document.querySelector('.cf-form')?.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setBusy(false);
    }
  };

  const field = (k, label, input, { required, cls = '' } = {}) => (
    <label className={`${cls}${show(k) ? ' has-error' : ''}`}>
      <span>{label}{required && <span className="req"> *</span>}</span>
      {input}
      {show(k) && <small className="field-error">{errors[k]}</small>}
    </label>
  );
  let n = 0;

  return (
    <Modal title={editing ? 'Edit customer' : 'Add customer'} onClose={requestClose} closeOnBackdrop={false} className="cf-modal">
      <form className="cf-form" onSubmit={submit} noValidate>
        {restored && (
          <div className="draft-note" role="status">
            <span>Restored the details you were filling in.</span>
            <button type="button" className="link-btn" onClick={startOver}>Start over</button>
          </div>
        )}
        {error && (
          <div className="alert">
            {error}
            {dupeId && <> · <Link to={`/customers/${dupeId}`} onClick={onClose}>Open that customer</Link></>}
          </div>
        )}

        <section className="cf-section">
          <h3 className="cf-title"><span>{++n}</span> Customer</h3>
          <div className="cf-type" role="radiogroup" aria-label="New customer or POC">
            {[['individual', 'New customer'], ['poc', 'Through a POC']].map(([v, t]) => (
              <button key={v} type="button" role="radio" aria-checked={form.contactType === v} className={`cf-type-opt${form.contactType === v ? ' on' : ''}`} onClick={() => setF('contactType', v)}>{t}</button>
            ))}
          </div>
          {poc && (
            <div className="cf-grid">
              {field('pocName', 'POC name', <input value={form.pocName} onChange={(e) => setF('pocName', e.target.value)} placeholder="Who brought the customer" autoComplete="off" />, { required: true })}
              {field('pocPhone', 'POC phone', <input type="tel" inputMode="tel" value={form.pocPhone} onChange={(e) => setF('pocPhone', e.target.value)} placeholder="10-digit mobile" />, { required: true })}
              {pocHints.length > 0 && (
                <div className="cf-hints wide">
                  <small className="muted">Used before:</small>
                  {pocHints.map((x) => (
                    <button key={x.pocPhone} type="button" className="chip" onClick={() => setForm((f) => ({ ...f, pocName: x.pocName, pocPhone: x.pocPhone }))}>{x.pocName} · {x.pocPhone}</button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="cf-grid">
            <div className="cf-name wide">
              <label className="cf-salute">
                <span>Title</span>
                <select value={form.salutation} onChange={setPerson('salutation')}>
                  {applicantOptions('salutation').map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
              {field('name', isFirm(form.salutation) ? 'Firm name' : "Customer's name", <input value={form.name} onChange={setPerson('name')} placeholder="e.g. Ramesh Kulkarni" autoFocus={!restored} />, { required: true })}
            </div>
            {field('phone1', poc ? 'Customer phone (optional)' : 'Contact number', <input type="tel" inputMode="tel" value={form.phone1} onChange={(e) => setF('phone1', e.target.value)} placeholder="10-digit mobile" />, { required: !poc })}
          </div>
        </section>

        <section className="cf-section">
          <h3 className="cf-title"><span>{++n}</span> Service & property</h3>
          <SchemaSection
            section={editing ? EDIT_SECTION : JOB_SECTION}
            path="job"
            values={form}
            onChange={(k, v) => setF(k, v)}
            errors={tried ? Object.fromEntries(['job.service', 'job.propertyType'].filter((k) => errors[k]).map((k) => [k, errors[k]])) : {}}
            ctx={{}}
            data={{}}
          />
        </section>

        {!editing && (
          <section className="cf-section">
            <h3 className="cf-title"><span>{++n}</span> Site address{mine && <span className="muted small"> (optional when you inspect it yourself)</span>}</h3>
            <div className="cf-grid">
              {SITE_FIELDS.map(([k, label]) => (
                <label key={k} className={`${k === 'street' ? 'wide ' : ''}${show('site') && (k === 'street' || k === 'village') ? 'has-error' : ''}`}>
                  <span>{label}{!mine && (k === 'street' || k === 'village') && <span className="req"> *</span>}</span>
                  <input value={form.site[k]} onChange={setSite(k)} inputMode={k === 'pincode' ? 'numeric' : undefined} maxLength={k === 'pincode' ? 6 : undefined} />
                </label>
              ))}
            </div>
            {show('site') && <span className="error-text">{errors.site}</span>}
            <SiteMap site={form.site} pin={form.siteLocation} onPin={(p) => setF('siteLocation', p)} />
          </section>
        )}

        {!editing && isSuperadmin && (
          <section className="cf-section">
            <h3 className="cf-title"><span>{++n}</span> Site inspection by</h3>
            {!people ? <div className="skeleton" style={{ height: 48 }} /> : (
              <div className="cf-people" role="radiogroup" aria-label="Site inspection by">
                {people.map((u) => (
                  <button key={u._id} type="button" role="radio" aria-checked={form.evaluator === u._id} className={`cf-person${form.evaluator === u._id ? ' on' : ''}`} onClick={() => setF('evaluator', u._id)}>
                    <span className="avatar soft sm">{initials(u.name)}</span>
                    <span>{u._id === myId ? 'Myself' : u.name}</span>
                  </button>
                ))}
              </div>
            )}
            {show('evaluator') && <span className="error-text">{errors.evaluator}</span>}
          </section>
        )}

        <div className="cf-foot">
          <button type="button" className="btn" onClick={requestClose} disabled={busy}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add customer & create sheet'}</button>
        </div>
      </form>
    </Modal>
  );
}

// A new job for a customer: the service requested, the type of property, the bank, which property and its site
// address, and who does the site inspection. Creates the site inspection sheet, filled in from all of this.
// onSubmit(job) (optional): the customer isn't saved yet (Add customer, step 2); resolves to an error message or null.
// Renders its own sticky footer (Back / Cancel · Create).
function AssignForm({ customer, properties = [], initialFrom = '', onAssigned, onBack, onCancel, onSubmit, submitLabel }) {
  const { user, isSuperadmin } = useAuth();
  const navigate = useNavigate();
  const myId = user?._id || user?.id;
  // evaluators start the sheet for themselves: no "assign to" choice
  const self = !isSuperadmin;
  const [people, setPeople] = useState(self ? [user] : null);
  // the request itself (bank and branch start from the customer's)
  const [job, setJob] = useState(() => ({
    service: SERVICES.includes(customer.serviceRequest) ? customer.serviceRequest : '',
    propertyType: '', bankName: customer.bankName || '', branch: customer.branch || '', ifsc: '',
  }));
  const jobErrors = { 'job.service': !job.service ? 'Choose the service requested' : null, 'job.propertyType': !job.propertyType ? 'Choose the type of property' : null };
  const [pick, setPick] = useState(self ? myId || 'me' : '');
  // filling it in yourself (evaluator, or the superadmin picking "Myself"): the site is marked in the sheet itself
  const mine = self || (pick && pick === myId);
  const [dupes, setDupes] = useState(null); // open sheets of this customer, shown before creating another
  const [from, setFrom] = useState(initialFrom);
  const known = properties.filter((g) => g.identified);
  // site address for a new property (what the evaluator will visit)
  const [site, setSite] = useState(EMPTY_SITE);
  const [pin, setPin] = useState(null); // the site on the map
  const setS = (k) => (e) => setSite((x) => ({ ...x, [k]: e.target.value }));
  const newProperty = !from;
  const siteStarted = Object.values(site).some((v) => v.trim());
  // the address is needed to send someone else to the site; for yourself it is optional
  const siteOk = !newProperty || site.street.trim() || site.village.trim() || (mine && !siteStarted);
  // the customer's own address, to copy in one tap when the property is where they live
  const custAddr = { number: customer.houseNo || '', street: customer.street || '', village: customer.locality || '', district: customer.district || '', pincode: customer.pincode || '' };
  const hasCustAddr = Boolean(custAddr.street || custAddr.village);
  const useCustomerAddress = () => setSite((x) => ({ ...x, ...custAddr }));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (self) return;
    api.listUsers({ status: 'active' })
      .then((r) => {
        const order = { evaluator: 0, admin: 1, superadmin: 2 };
        // "Myself" first, then evaluators, admins (drafters complete the sheet after the site visit)
        const list = (r.items || []).filter((u) => u.status === 'active' && u.role !== 'drafter')
          .sort((a, b) => (b._id === myId) - (a._id === myId) || order[a.role] - order[b.role] || a.name.localeCompare(b.name));
        setPeople(list);
        if (list.length === 1) setPick(list[0]._id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const assign = async (allowDuplicate = false) => {
    setTried(true);
    if (!pick || !siteOk || Object.values(jobErrors).some(Boolean)) return;
    setBusy(true);
    setError('');
    try {
      const typed = Object.fromEntries(Object.entries(site).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
      const sitePayload = newProperty && (siteStarted || pin) ? { ...typed, ...(pin ? { location: pin } : {}) } : undefined;
      const body = { ...job, evaluator: pick === 'me' ? undefined : pick, fromValuation: from || undefined, site: sitePayload, allowDuplicate: allowDuplicate || undefined };
      if (onSubmit) {
        const problem = await onSubmit(body);
        if (problem) { setError(problem); setBusy(false); }
        return;
      }
      const r = await api.startCustomerValuation(customer._id, body);
      // your own job: straight into the sheet
      if (r.self || String(r.evaluator?._id) === String(myId)) return navigate(`/valuations/${r._id}/edit`);
      onAssigned(r);
    } catch (e) {
      if (e.status === 409 && e.data?.open?.length) setDupes(e.data.open);
      else setError(e.message);
      setBusy(false);
    }
  };

  if (dupes) {
    return (
      <div className="nv-form">
        <section className="nv-section nv-dupes">
          <h3 className="nv-section-title">Already open for {customer.name}</h3>
          <p className="nv-section-hint">Continue the open sheet instead of starting the same job twice.</p>
          <ul className="nv-dupe-list">
            {dupes.map((d) => {
              const yours = String(d.evaluator?._id) === String(myId);
              return (
                <li key={d._id}>
                  <span className="nv-main">
                    <strong>{d.referenceNo} <span className={`badge status-${d.status}`}>{STATUS_LABELS[d.status] || d.status}</span></strong>
                    <small>{[yours ? 'You' : d.evaluator?.name, d.site, `updated ${new Date(d.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}`].filter(Boolean).join(' · ')}</small>
                  </span>
                  <Link className="btn primary small" to={yours && ['draft', 'rejected'].includes(d.status) ? `/valuations/${d._id}/edit` : `/valuations/${d._id}`}>{yours ? 'Continue' : 'Open'}</Link>
                </li>
              );
            })}
          </ul>
        </section>
        <div className="nv-foot">
          <button type="button" className="btn" onClick={() => setDupes(null)} disabled={busy}>‹ Back</button>
          <button type="button" className="btn" onClick={() => { setDupes(null); assign(true); }} disabled={busy}>It's a different job: create another</button>
        </div>
      </div>
    );
  }

  let n = 0; // section numbers
  return (
    <div className="nv-form">
      {error && <div className="alert">{error}</div>}

      <section className="nv-section">
        <h3 className="nv-section-title"><span>{++n}</span> Service & property</h3>
        <SchemaSection
          section={JOB_SECTION}
          path="job"
          values={job}
          onChange={(k, v) => setJob((j) => ({ ...j, [k]: v }))}
          errors={tried ? Object.fromEntries(Object.entries(jobErrors).filter(([, m]) => m)) : {}}
          ctx={{}}
          data={{}}
        />
      </section>

      {/* who: picking "Myself" makes the site address optional below */}
      {!self && <section className="nv-section">
        <h3 className="nv-section-title"><span>{++n}</span> Site inspection by</h3>
        {!people ? (
          <div className="skeleton" style={{ height: 120 }} />
        ) : people.length === 0 ? (
          <p className="muted">No active team members yet. Add one under Team first.</p>
        ) : (
          <div className="nv-options nv-people" role="radiogroup" aria-label="Assign to">
            {people.map((u) => (
              <label key={u._id} className={`assign-opt${pick === u._id ? ' on' : ''}`}>
                <input type="radio" name="assignee" value={u._id} checked={pick === u._id} onChange={() => setPick(u._id)} />
                <span className="avatar soft sm">{initials(u.name)}</span>
                <span className="assign-text">
                  <strong>{u._id === myId ? 'Myself' : u.name}</strong>
                  <small>{u._id === myId ? 'Do the site inspection yourself: the sheet opens straight away' : [ROLE_LABELS[u.role], u.branch].filter(Boolean).join(' · ')}</small>
                </span>
                {u.stats && <span className="assign-load" title="Input sheets handled">{u.stats.total} done</span>}
              </label>
            ))}
          </div>
        )}
        {tried && !pick && people?.length > 0 && <span className="error-text">Choose who will do the site inspection.</span>}
      </section>}

      {known.length > 0 && (
        <section className="nv-section">
          <h3 className="nv-section-title"><span>{++n}</span> Property</h3>
          <div className="nv-options" role="radiogroup" aria-label="Property">
            <label className={`assign-opt${!from ? ' on' : ''}`}>
              <input type="radio" name="property" checked={!from} onChange={() => setFrom('')} />
              <span className="assign-text"><strong>A new property</strong><small>Enter its site address</small></span>
            </label>
            {known.map((g) => (
              <label key={g.key} className={`assign-opt${from === g.latest._id ? ' on' : ''}`}>
                <input type="radio" name="property" checked={from === g.latest._id} onChange={() => setFrom(g.latest._id)} />
                <span className="assign-text">
                  <strong>{g.address}</strong>
                  <small>Re-valuation · last {new Date(g.latest.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · location & boundaries copied</small>
                </span>
              </label>
            ))}
          </div>
        </section>
      )}

      {newProperty && (
        <section className="nv-section">
          <h3 className="nv-section-title"><span>{++n}</span> Site address{mine && <span className="muted small"> (optional)</span>}</h3>
          <p className="nv-section-hint">
            {mine ? 'You can skip this: mark the plot on the map in the sheet and the address fills in.' : 'Where the evaluator goes. It\u2019s copied into the sheet\u2019s \u201cProperty location\u201d.'}
            {hasCustAddr && <> <button type="button" className="link-btn" onClick={useCustomerAddress}>Same as the customer's address</button></>}
          </p>
          <div className="cf-grid">
            {SITE_FIELDS.map(([k, label]) => (
              <label key={k} className={`${k === 'street' ? 'wide ' : ''}${tried && !siteOk && (k === 'street' || k === 'village') ? 'has-error' : ''}`}>
                <span>{label}{!mine && (k === 'street' || k === 'village') && <span className="req"> *</span>}</span>
                <input value={site[k]} onChange={setS(k)} inputMode={k === 'pincode' ? 'numeric' : undefined} maxLength={k === 'pincode' ? 6 : undefined} />
              </label>
            ))}
          </div>
          <SiteMap site={site} pin={pin} onPin={setPin} />
          {tried && !siteOk && <span className="error-text">Enter the street or the village so the evaluator can find the site.</span>}
        </section>
      )}


      <div className="nv-foot">
        {onBack
          ? <button type="button" className="btn" onClick={onBack} disabled={busy}>‹ Back</button>
          : <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="button" className="btn primary" onClick={() => assign()} disabled={busy || !people?.length}>{busy ? 'Creating…' : submitLabel || (mine ? 'Create & open sheet' : 'Create site inspection')}</button>
      </div>
    </div>
  );
}

// Customer page → New request (customer already known)
export function AssignValuationModal({ customer, properties = [], initialFrom = '', onClose, onAssigned }) {
  return (
    <Modal title={`New request · ${customer.name}`} onClose={onClose} className="nv-modal">
      <AssignForm customer={customer} properties={properties} initialFrom={initialFrom} onAssigned={onAssigned} onCancel={onClose} />
    </Modal>
  );
}

function NvSteps({ step, onStep1 }) {
  return (
    <ol className="nv-stepper" aria-label="Steps">
      <li className={step === 1 ? 'on' : 'done'}>
        <button type="button" onClick={onStep1} disabled={step === 1}>
          <span className="nv-dot">{step === 1 ? '1' : '✓'}</span> Customer
        </button>
      </li>
      <li className="nv-line" aria-hidden="true" />
      <li className={step === 2 ? 'on' : ''}>
        <span className="nv-step-label"><span className="nv-dot">2</span> New inspection</span>
      </li>
    </ol>
  );
}

// Site Inspections → New inspection: one dialog, two steps (customer → new inspection)
export function NewValuationFlow({ onClose, onAssigned }) {
  const [step, setStep] = useState('customer'); // customer | add | assign
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [picked, setPicked] = useState(null); // { customer, valuations }
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState('');

  useEffect(() => {
    if (step !== 'customer') return undefined;
    let cancelled = false;
    api.listCustomers({ q, limit: 8 })
      .then((r) => { if (!cancelled) { setFound(r.items || []); setError(''); } })
      .catch((e) => !cancelled && setError(e.message));
    return () => { cancelled = true; };
  }, [q, step]);

  const choose = async (id) => {
    setLoadingId(id);
    setError('');
    try {
      setPicked(await api.getCustomer(id));
      setStep('assign');
    } catch (e) {
      setError(e.message);
      setStep('customer');
    } finally {
      setLoadingId('');
    }
  };

  if (step === 'add') {
    return <CustomerFormModal onClose={() => setStep('customer')} onSaved={(c) => (c.valuation ? onAssigned(c.valuation) : choose(c._id))} />;
  }

  const c = picked?.customer;
  return (
    <Modal title="New inspection" onClose={onClose} className="nv-modal">
      <NvSteps step={step === 'assign' && picked ? 2 : 1} onStep1={() => setStep('customer')} />

      {step === 'assign' && picked ? (
        <>
          <div className="nv-customer">
            <span className="avatar soft">{initials(c.name)}</span>
            <span className="nv-main">
              <strong>{c.name}{c.code && <span className="id-code id-inline">{c.code}</span>}</strong>
              <small>{[c.phone1, c.district, c.bankName].filter(Boolean).join(' · ')}</small>
            </span>
            <button type="button" className="btn small" onClick={() => setStep('customer')}>Change</button>
          </div>
          <AssignForm
            key={c._id}
            customer={c}
            properties={groupByProperty(picked.valuations || [])}
            onAssigned={onAssigned}
            onBack={() => setStep('customer')}
          />
        </>
      ) : (
        <div className="stack nv-pick-step">
          {error && <div className="alert">{error}</div>}
          <SearchBox value={q} onSearch={setQ} autoFocus delay={200} label="Search customers" placeholder="Search name, phone, district…" />
          <ul className="nv-list">
            {!found && [0, 1, 2].map((i) => <li key={i}><div className="skeleton" style={{ height: 52 }} /></li>)}
            {found && found.length === 0 && <li className="muted nv-empty">{q ? `No customer matches “${q}”.` : 'No customers yet.'}</li>}
            {(found || []).map((x) => (
              <li key={x._id}>
                <button type="button" className={`nv-pick${picked?.customer?._id === x._id ? ' on' : ''}`} onClick={() => choose(x._id)} disabled={Boolean(loadingId)}>
                  <span className="avatar soft sm">{initials(x.name)}</span>
                  <span className="nv-main">
                    <strong>{x.name}</strong>
                    <small>{[x.code, x.phone1, x.district, x.stats?.total ? `${x.stats.total} input sheet${x.stats.total === 1 ? '' : 's'}` : 'New enquiry'].filter(Boolean).join(' · ')}</small>
                  </span>
                  {loadingId === x._id ? <span className="muted small">Opening…</span> : <IconChevron size={16} />}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn nv-add" onClick={() => setStep('add')}><IconPlus size={16} /> New customer</button>
        </div>
      )}
    </Modal>
  );
}
