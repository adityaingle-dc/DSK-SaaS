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
import { ROLE_LABELS } from '../context/AuthContext.jsx';

const applicantOptions = (key) => SECTIONS.find((s) => s.key === 'applicant')?.fields.find((f) => f.key === key)?.options || [];
export const CUSTOMER_SOURCES = ['Walk-in', 'Phone call', 'Bank referral', 'Existing customer', 'Website', 'Other'];

const EMPTY = {
  salutation: 'Sri.', name: '', relation: '', relativeName: '', occupation: '', phone1: '', phone2: '', email: '',
  houseNo: '', street: '', locality: '', district: '', pincode: '', bankName: '', branch: '', source: 'Phone call', notes: '',
};

// Add / edit a customer. On a duplicate phone the server answers 409 with the existing customer's id.
export function CustomerFormModal({ customer, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({ ...EMPTY, ...(customer || {}) }));
  const [error, setError] = useState('');
  const [dupeId, setDupeId] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setDupeId(null);
    setBusy(true);
    try {
      const payload = Object.fromEntries(Object.keys(EMPTY).map((k) => [k, form[k] ?? '']));
      const saved = customer ? await api.updateCustomer(customer._id, payload) : await api.createCustomer(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setDupeId(err.errors?.[0]?.customerId || null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={customer ? 'Edit customer' : 'Add customer'} onClose={onClose}>
      <form className="stack customer-form" onSubmit={submit}>
        {error && (
          <div className="alert">
            {error}
            {dupeId && <> · <Link to={`/customers/${dupeId}`} onClick={onClose}>Open that customer</Link></>}
          </div>
        )}

        <fieldset>
          <legend>Contact</legend>
          <div className="row salute-row">
            <label>Title
              <select value={form.salutation} onChange={set('salutation')}>
                {applicantOptions('salutation').map((o) => <option key={o}>{o}</option>)}
              </select>
            </label>
            <label><span>Full name <span className="req">*</span></span>
              <input required autoFocus value={form.name} onChange={set('name')} placeholder="e.g. Ramesh Kulkarni" />
            </label>
          </div>
          <div className="row">
            <label><span>Phone <span className="req">*</span></span>
              <input required type="tel" inputMode="tel" value={form.phone1} onChange={set('phone1')} placeholder="10-digit mobile" />
            </label>
            <label>Alternate phone
              <input type="tel" inputMode="tel" value={form.phone2} onChange={set('phone2')} />
            </label>
          </div>
          <label>Email
            <input type="email" value={form.email} onChange={set('email')} placeholder="name@example.com" />
          </label>
        </fieldset>

        <fieldset>
          <legend>Valuation request</legend>
          <div className="row">
            <label>Bank
              <input value={form.bankName} onChange={set('bankName')} placeholder="Bank receiving the report" list="bank-suggestions" />
            </label>
            <label>Branch
              <input value={form.branch} onChange={set('branch')} />
            </label>
          </div>
          <datalist id="bank-suggestions">
            {['Canara Bank', 'State Bank of India', 'Union Bank of India', 'Bank of Baroda', 'Indian Bank', 'Bank of Maharashtra'].map((b) => <option key={b} value={b} />)}
          </datalist>
          <label>How did they reach us?
            <select value={form.source} onChange={set('source')}>
              {CUSTOMER_SOURCES.map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
          <label>Notes
            <textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="What they asked for, property details, preferred visit time…" />
          </label>
        </fieldset>

        <fieldset>
          <legend>Address</legend>
          <div className="row">
            <label>Plot / H.No.<input value={form.houseNo} onChange={set('houseNo')} /></label>
            <label>Road / street / colony<input value={form.street} onChange={set('street')} /></label>
          </div>
          <div className="row">
            <label>Village / mandal / municipality<input value={form.locality} onChange={set('locality')} /></label>
            <label>District<input value={form.district} onChange={set('district')} /></label>
          </div>
          <div className="row">
            <label>Pincode<input inputMode="numeric" value={form.pincode} onChange={set('pincode')} /></label>
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
        </fieldset>

        <p className="muted small">These details are copied into the input sheet when you start an input sheet for this customer.</p>
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
  const [people, setPeople] = useState(null);
  const [pick, setPick] = useState('');
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

      <section className="nv-section">
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
      </section>

      <div className="nv-foot">
        {onBack
          ? <button type="button" className="btn" onClick={onBack} disabled={busy}>‹ Back</button>
          : <button type="button" className="btn" onClick={onCancel} disabled={busy}>Cancel</button>}
        <button type="button" className="btn primary" onClick={assign} disabled={busy || !people?.length}>{busy ? 'Creating…' : 'Create & assign'}</button>
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
