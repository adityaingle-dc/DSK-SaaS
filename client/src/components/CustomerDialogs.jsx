import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SECTIONS } from '@dsk/shared';
import { api } from '../api/client.js';
import Modal from './Modal.jsx';
import { initials } from './Layout.jsx';
import { parseLatLon } from './SiteInfo.jsx';
import SearchBox from './SearchBox.jsx';
import { groupByProperty } from '../utils/properties.js';
import { IconChevron, IconPlus } from './Icons.jsx';
import { ROLE_LABELS, useAuth } from '../context/AuthContext.jsx';

const applicantOptions = (key) => SECTIONS.find((s) => s.key === 'applicant')?.fields.find((f) => f.key === key)?.options || [];
export const CUSTOMER_SOURCES = ['Walk-in', 'Phone call', 'Bank referral', 'Existing customer', 'Website', 'Contact person', 'Other'];
export const SERVICE_REQUESTS = ['Home loan valuation', 'Loan against property', 'Plot / land valuation', 'Construction stage valuation', 'Purchase / resale valuation', 'Other'];

const POC_ROLES = ['Agent / broker', 'Bank officer', 'Builder', 'Relative', 'Other'];
const EMPTY = {
  contactType: 'individual', pocName: '', pocPhone: '', pocRole: '',
  salutation: 'Sri.', name: '', relation: '', relativeName: '', occupation: '', phone1: '', phone2: '', email: '',
  houseNo: '', street: '', locality: '', district: '', pincode: '', bankName: '', branch: '', source: 'Phone call', serviceRequest: '', notes: '',
};
// fields kept under "More details" (open automatically when editing a customer who has any of them)
const MORE = ['phone2', 'email', 'bankName', 'branch', 'houseNo', 'street', 'locality', 'district', 'pincode', 'occupation', 'relation', 'relativeName'];
const mobileOk = (v) => /^[6-9][0-9]{9}$/.test(String(v || '').replace(/\D/g, '').slice(-10));

// what the user typed in the search becomes the new person's name or phone
const newPocFrom = (typed) => {
  const t = String(typed || '').trim();
  const digits = t.replace(/\D/g, '');
  return digits.length >= 6 && digits.length === t.replace(/[\s+\-()]/g, '').length ? { pocName: '', pocPhone: t, pocRole: '' } : { pocName: t, pocPhone: '', pocRole: '' };
};

// search the contact persons used before; pick one, or add a new one
function PocPicker({ selected, tried, onPick, onClear, onNew }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState(null);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (selected) return undefined;
    let live = true;
    const t = setTimeout(() => api.listPocs(q.trim()).then((r) => live && (setItems(r.items), setActive(0))).catch(() => live && setItems([])), q ? 200 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, selected]);

  if (selected) {
    return (
      <div className="poc-chosen">
        <span className="poc-avatar" aria-hidden="true">{(selected.pocName || '?').trim()[0]?.toUpperCase()}</span>
        <div className="poc-chosen-text">
          <strong>{selected.pocName}</strong>
          <small className="muted">{[selected.pocPhone, selected.pocRole].filter(Boolean).join(' · ')}</small>
        </div>
        <button type="button" className="btn small" onClick={onClear}>Change</button>
      </div>
    );
  }

  const list = items || [];
  const total = list.length + 1; // + "add new" row
  const choose = (i) => (i < list.length ? onPick(list[i]) : onNew(q));
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % total); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + total) % total); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
  };
  return (
    <div className={`poc-picker${tried ? ' has-error' : ''}`}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={onKey}
        placeholder="Search by name or phone"
        aria-label="Search contact persons"
      />
      <ul className="poc-list" role="listbox">
        {items === null && <li className="poc-empty muted">Loading…</li>}
        {list.map((x, i) => (
          <li key={x.pocPhone} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(i); }}>
            <span className="poc-avatar" aria-hidden="true">{(x.pocName || '?').trim()[0]?.toUpperCase()}</span>
            <span className="poc-main"><strong>{x.pocName}</strong><small className="muted">{[x.pocPhone, x.pocRole].filter(Boolean).join(' · ')}</small></span>
            <small className="poc-count muted">{x.customers} customer{x.customers === 1 ? '' : 's'}</small>
          </li>
        ))}
        {items && !list.length && <li className="poc-empty muted">{q ? 'No contact person matches.' : 'No contact persons yet.'}</li>}
        <li role="option" aria-selected={active === list.length} className={`poc-new${active === list.length ? ' on' : ''}`} onMouseEnter={() => setActive(list.length)} onMouseDown={(e) => { e.preventDefault(); choose(list.length); }}>
          <span className="poc-avatar plus" aria-hidden="true">+</span>
          <span className="poc-main"><strong>Add new contact person{q.trim() ? `: ${q.trim()}` : ''}</strong></span>
        </li>
      </ul>
      {tried && <small className="field-error">Choose a contact person or add a new one</small>}
    </div>
  );
}

// Add / edit a customer: an individual, or a customer brought by a contact person (POC).
// Only the essentials are shown; everything else sits under "More details".
export function CustomerFormModal({ customer, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(customer || {}), contactType: customer?.contactType || 'individual' }));
  const [more, setMore] = useState(() => MORE.some((k) => customer?.[k]));
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [dupeId, setDupeId] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const poc = form.contactType === 'poc';
  // pick from previous contact persons, or type a new one (editing a saved POC customer starts on its saved person)
  const [pocMode, setPocMode] = useState('pick');

  const errors = {
    name: !form.name.trim() ? (poc ? "Customer's name is required" : 'Full name is required') : null,
    phone1: poc ? (form.phone1 && !mobileOk(form.phone1) ? 'Enter a 10-digit mobile number' : null) : !mobileOk(form.phone1) ? 'Enter a 10-digit mobile number' : null,
    pocName: poc && !form.pocName.trim() ? "Contact person's name is required" : null,
    pocPhone: poc && !mobileOk(form.pocPhone) ? 'Enter a 10-digit mobile number' : null,
    serviceRequest: !poc && !form.serviceRequest ? 'Choose the service needed' : null,
  };
  const show = (k) => tried && errors[k];

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (Object.values(errors).some(Boolean)) return;
    setError('');
    setDupeId(null);
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, form[k] ?? '']));
      if (!poc) Object.assign(payload, { pocName: '', pocPhone: '', pocRole: '' });
      const saved = customer ? await api.updateCustomer(customer._id, payload) : await api.createCustomer(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setDupeId(err.errors?.[0]?.customerId || null);
    } finally {
      setBusy(false);
    }
  };

  const field = (k, label, input, { required } = {}) => (
    <label className={show(k) ? 'has-error' : ''}>
      <span>{label}{required && <span className="req"> *</span>}</span>
      {input}
      {show(k) && <small className="field-error">{errors[k]}</small>}
    </label>
  );

  return (
    <Modal title={customer ? 'Edit customer' : 'Add customer'} onClose={onClose}>
      <form className="stack customer-form" onSubmit={submit} noValidate>
        {error && (
          <div className="alert">
            {error}
            {dupeId && <> · <Link to={`/customers/${dupeId}`} onClick={onClose}>Open that customer</Link></>}
          </div>
        )}

        <div className="ctype" role="radiogroup" aria-label="Customer type">
          {[['individual', 'Individual', 'The customer contacts us directly'], ['poc', 'Through a contact person', 'An agent, bank officer, builder or relative brings them']].map(([v, t, d]) => (
            <label key={v} className={`ctype-opt${form.contactType === v ? ' on' : ''}`}>
              <input type="radio" name="contactType" checked={form.contactType === v} onChange={() => setForm((f) => ({ ...f, contactType: v, source: v === 'individual' && f.source === 'Contact person' ? 'Phone call' : f.source }))} />
              <strong>{t}</strong>
              <small>{d}</small>
            </label>
          ))}
        </div>

        {poc && (
          <fieldset>
            <legend>Contact person</legend>
            {pocMode === 'pick' ? (
              <PocPicker
                selected={form.pocPhone ? form : null}
                tried={tried}
                onPick={(x) => setForm((f) => ({ ...f, pocName: x.pocName, pocPhone: x.pocPhone, pocRole: x.pocRole || '' }))}
                onClear={() => setForm((f) => ({ ...f, pocName: '', pocPhone: '', pocRole: '' }))}
                onNew={(typed) => { setPocMode('new'); setForm((f) => ({ ...f, ...newPocFrom(typed) })); }}
              />
            ) : (
              <>
                <div className="row">
                  {field('pocName', 'Name', <input autoFocus value={form.pocName} onChange={set('pocName')} placeholder="Who brought the customer" />, { required: true })}
                  {field('pocPhone', 'Phone', <input type="tel" inputMode="tel" value={form.pocPhone} onChange={set('pocPhone')} placeholder="10-digit mobile" />, { required: true })}
                </div>
                <label>Role
                  <select value={form.pocRole} onChange={set('pocRole')}>
                    <option value="">—</option>
                    {POC_ROLES.map((o) => <option key={o}>{o}</option>)}
                  </select>
                </label>
                <button type="button" className="link-btn" onClick={() => { setPocMode('pick'); setForm((f) => ({ ...f, pocName: '', pocPhone: '', pocRole: '' })); }}>← Choose a previous contact person</button>
              </>
            )}
          </fieldset>
        )}

        <fieldset>
          <legend>{poc ? 'Customer' : 'Contact'}</legend>
          <div className="row salute-row">
            <label>Title
              <select value={form.salutation} onChange={set('salutation')}>
                {applicantOptions('salutation').map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            {field('name', 'Full name', <input autoFocus={!poc} value={form.name} onChange={set('name')} placeholder="e.g. Ramesh Kulkarni" />, { required: true })}
          </div>
          {field('phone1', poc ? 'Customer phone (optional)' : 'Phone', <input type="tel" inputMode="tel" value={form.phone1} onChange={set('phone1')} placeholder="10-digit mobile" />, { required: !poc })}
          {!poc && (
            <div className="row">
              {field('serviceRequest', 'Service needed', (
                <select value={form.serviceRequest} onChange={set('serviceRequest')}>
                  <option value="">Choose…</option>
                  {SERVICE_REQUESTS.map((o) => <option key={o}>{o}</option>)}
                </select>
              ), { required: true })}
              <label>How did they reach us?
                <select value={form.source} onChange={set('source')}>
                  {CUSTOMER_SOURCES.filter((o) => o !== 'Contact person').map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
            </div>
          )}
          <label>Notes
            <textarea rows={2} value={form.notes} onChange={set('notes')} placeholder="What they asked for, property, preferred visit time…" />
          </label>
        </fieldset>

        <details className="more-details" open={more} onToggle={(e) => setMore(e.currentTarget.open)}>
          <summary>More details <span className="muted small">(optional: email, bank, address…)</span></summary>
          <div className="stack">
            <div className="row">
              <label>Alternate phone<input type="tel" inputMode="tel" value={form.phone2} onChange={set('phone2')} /></label>
              <label>Email<input type="email" value={form.email} onChange={set('email')} placeholder="name@example.com" /></label>
            </div>
            <div className="row">
              <label>Bank<input value={form.bankName} onChange={set('bankName')} placeholder="Bank receiving the report" list="bank-suggestions" /></label>
              <label>Branch<input value={form.branch} onChange={set('branch')} /></label>
            </div>
            <datalist id="bank-suggestions">
              {['Canara Bank', 'State Bank of India', 'Union Bank of India', 'Bank of Baroda', 'Indian Bank', 'Bank of Maharashtra'].map((x) => <option key={x} value={x} />)}
            </datalist>
            <div className="row">
              <label>Plot / H.No.<input value={form.houseNo} onChange={set('houseNo')} /></label>
              <label>Road / street / colony<input value={form.street} onChange={set('street')} /></label>
            </div>
            <div className="row">
              <label>Village / mandal / municipality<input value={form.locality} onChange={set('locality')} /></label>
              <label>District<input value={form.district} onChange={set('district')} /></label>
            </div>
            <div className="row">
              <label>Pincode<input inputMode="numeric" maxLength={6} value={form.pincode} onChange={set('pincode')} /></label>
              <label>Occupation<input value={form.occupation} onChange={set('occupation')} /></label>
            </div>
            <div className="row">
              <label>Relation
                <select value={form.relation} onChange={set('relation')}>
                  <option value="">—</option>
                  {applicantOptions('relation').map((o) => <option key={o}>{o}</option>)}
                </select>
              </label>
              <label>Father / husband name<input value={form.relativeName} onChange={set('relativeName')} /></label>
            </div>
          </div>
        </details>

        <p className="muted small">These details are copied into the input sheet when you start one for this customer.</p>
        <div className="actions">
          <button type="button" className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" disabled={busy}>{busy ? 'Saving…' : customer ? 'Save changes' : 'Add customer'}</button>
        </div>
      </form>
    </Modal>
  );
}

// The "new input sheet" form: which property, its site address, and who fills it in.
// Renders its own sticky footer (Back / Cancel · Create & assign).
function AssignForm({ customer, properties = [], initialFrom = '', onAssigned, onBack, onCancel }) {
  const { user, isSuperadmin } = useAuth();
  // evaluators start the sheet for themselves: no "assign to" choice
  const self = !isSuperadmin;
  const [people, setPeople] = useState(self ? [user] : null);
  const [pick, setPick] = useState(self ? user?._id || user?.id || 'me' : '');
  const [from, setFrom] = useState(initialFrom);
  const known = properties.filter((g) => g.identified);
  // site address for a new property (what the evaluator will visit)
  const [site, setSite] = useState({ description: '', number: '', surveyNo: '', street: '', village: '', district: '', pincode: '', landmark: '', gps: '' });
  const setS = (k) => (e) => setSite((x) => ({ ...x, [k]: e.target.value }));
  const newProperty = !from;
  const siteOk = !newProperty || site.street.trim() || site.village.trim();
  const gps = site.gps.trim() ? parseLatLon(site.gps) : null;
  const gpsBad = site.gps.trim() && !gps;
  const [tried, setTried] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (self) return;
    api.listUsers({ status: 'active' })
      .then((r) => {
        const order = { evaluator: 0, admin: 1, superadmin: 2 };
        const list = (r.items || []).filter((u) => u.status === 'active').sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
        setPeople(list);
        if (list.length === 1) setPick(list[0]._id);
      })
      .catch((e) => setError(e.message));
  }, []);

  const assign = async () => {
    setTried(true);
    if (!pick || !siteOk || gpsBad) return;
    setBusy(true);
    setError('');
    try {
      const { gps: _gps, ...fields } = site;
      const sitePayload = newProperty ? { ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.trim()])), ...(gps ? { location: gps } : {}) } : undefined;
      onAssigned(await api.startCustomerValuation(customer._id, pick, from || undefined, sitePayload));
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  let n = 0; // section numbers
  return (
    <div className="nv-form">
      {error && <div className="alert">{error}</div>}

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
          <h3 className="nv-section-title"><span>{++n}</span> Site address</h3>
          <p className="nv-section-hint">Where the evaluator goes. It's copied into the sheet's "Property location".</p>
          <div className="site-form nv-site">
            <label className="wide">Property description<input value={site.description} onChange={setS('description')} placeholder="e.g. Independent house, G+1" /></label>
            <label>Plot / H.No. / Flat No.<input value={site.number} onChange={setS('number')} /></label>
            <label>Sy.No. / LP No.<input value={site.surveyNo} onChange={setS('surveyNo')} /></label>
            <label className={tried && !siteOk ? 'has-error' : ''}><span>Road / street / colony <span className="req">*</span></span><input value={site.street} onChange={setS('street')} /></label>
            <label className={tried && !siteOk ? 'has-error' : ''}><span>Village / area <span className="req">*</span></span><input value={site.village} onChange={setS('village')} /></label>
            <label>District<input value={site.district} onChange={setS('district')} /></label>
            <label>Pincode<input inputMode="numeric" maxLength={6} value={site.pincode} onChange={setS('pincode')} /></label>
            <label className="wide">Landmark<input value={site.landmark} onChange={setS('landmark')} placeholder="e.g. Opposite the post office" /></label>
            <label className={`wide${gpsBad ? ' has-error' : ''}`}><span>Google Maps location <span className="muted small">(optional)</span></span>
              <input value={site.gps} onChange={setS('gps')} placeholder='Paste "lat, lon", e.g. 18.5602, 73.8076' />
              {gpsBad && <span className="error-text">Paste it as "latitude, longitude", e.g. 18.5602, 73.8076</span>}
            </label>
          </div>
          {tried && !siteOk && <span className="error-text">Enter the street or the village so the evaluator can find the site.</span>}
        </section>
      )}

      {!self && <section className="nv-section">
        <h3 className="nv-section-title"><span>{++n}</span> Assign to</h3>
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
                  <strong>{u.name}</strong>
                  <small>{[ROLE_LABELS[u.role], u.branch].filter(Boolean).join(' · ')}</small>
                </span>
                {u.stats && <span className="assign-load" title="Input sheets handled">{u.stats.total} done</span>}
              </label>
            ))}
          </div>
        )}
        {tried && !pick && people?.length > 0 && <span className="error-text">Choose who will fill in the input sheet.</span>}
      </section>}

      <div className="nv-foot">
        {onBack
          ? <button type="button" className="btn" onClick={onBack} disabled={busy}>‹ Back</button>
          : <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="button" className="btn primary" onClick={assign} disabled={busy || !people?.length}>{busy ? 'Creating…' : self ? 'Create input sheet' : 'Create & assign'}</button>
      </div>
    </div>
  );
}

// Customer page → New input sheet (customer already known)
export function AssignValuationModal({ customer, properties = [], initialFrom = '', onClose, onAssigned }) {
  return (
    <Modal title={`New input sheet · ${customer.name}`} onClose={onClose} className="nv-modal">
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
        <span className="nv-step-label"><span className="nv-dot">2</span> Property & evaluator</span>
      </li>
    </ol>
  );
}

// Input Sheets → New input sheet: one dialog, two steps (customer → property & evaluator)
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
    return <CustomerFormModal onClose={() => setStep('customer')} onSaved={(c) => choose(c._id)} />;
  }

  const c = picked?.customer;
  return (
    <Modal title="New input sheet" onClose={onClose} className="nv-modal">
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
