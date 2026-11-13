import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { computeValuation, emptyValuation, getContext, sanitize, sectionPath, validate, visibleSections } from '@dsk/shared';
import { api } from '../api/client.js';
import SchemaSection from '../components/SchemaForm.jsx';
import ResultsPanel from '../components/ResultsPanel.jsx';

// Merge a saved sheet over the defaults so every input stays controlled and new schema fields appear
function hydrate(saved = {}) {
  const base = emptyValuation();
  for (const [path, values] of Object.entries(saved)) base[path] = { ...(base[path] || {}), ...values };
  return base;
}

export default function ValuationForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(() => (id ? null : emptyValuation()));
  const [meta, setMeta] = useState(null);
  const [active, setActive] = useState('general');
  const [serverErrors, setServerErrors] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .getValuation(id)
      .then((v) => {
        setData(hydrate(v.data));
        setMeta(v);
      })
      .catch((e) => setMessage(e.message));
  }, [id]);

  const ctx = useMemo(() => (data ? getContext(data) : null), [data]);
  const sections = useMemo(() => (data ? visibleSections(ctx, data) : []), [ctx, data]);
  const results = useMemo(() => (data ? computeValuation(sanitize(data)) : null), [data]);
  const clientErrors = useMemo(() => (data ? validate(sanitize(data), { mode: showAllErrors ? 'submit' : 'draft' }) : []), [data, showAllErrors]);

  const errorMap = useMemo(() => {
    const m = {};
    for (const e of [...clientErrors, ...serverErrors]) m[e.field] ||= e.message;
    return m;
  }, [clientErrors, serverErrors]);

  const errorCount = (s) => Object.keys(errorMap).filter((f) => f.startsWith(`${sectionPath(s)}.`) && s.fields.some((x) => f.startsWith(`${sectionPath(s)}.${x.key}`))).length;

  if (!data) return <div className="center">{message || 'Loading…'}</div>;

  const current = sections.find((s) => s.key === active) || sections[0];
  const idx = sections.indexOf(current);
  const path = sectionPath(current);

  const setField = (key, value) => {
    setServerErrors((errs) => errs.filter((e) => !e.field.startsWith(`${path}.${key}`)));
    setData((d) => ({ ...d, [path]: { ...(d[path] || {}), [key]: value } }));
  };

  const goToField = (field) => {
    const [p, key] = field.split('.');
    const s = sections.find((x) => sectionPath(x) === p && x.fields.some((f) => f.key === key));
    if (s) {
      setActive(s.key);
      setTimeout(() => document.getElementById(`field-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  };

  const save = async (submit) => {
    setMessage('');
    setServerErrors([]);
    const payload = { data: sanitize(data), ...(submit ? { status: 'submitted' } : {}) };
    if (submit) {
      const errs = validate(payload.data, { mode: 'submit' });
      if (errs.length) {
        setShowAllErrors(true);
        setMessage(`Please complete ${errs.length} required / invalid field${errs.length > 1 ? 's' : ''} before submitting.`);
        goToField(errs[0].field);
        return;
      }
    }
    setBusy(true);
    try {
      const saved = id ? await api.updateValuation(id, payload) : await api.createValuation(payload);
      navigate(`/valuations/${saved._id}`);
    } catch (err) {
      setMessage(err.message);
      if (err.errors?.length) {
        setServerErrors(err.errors);
        goToField(err.errors[0].field);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sheet-layout">
      <aside className="sheet-nav">
        <div className="sheet-title">
          <span>{id ? meta?.referenceNo : 'New valuation'}</span>
          <small className="muted">Step {idx + 1} of {sections.length}</small>
        </div>
        <div className="progress"><span style={{ width: `${((idx + 1) / sections.length) * 100}%` }} /></div>
        <nav>
          {sections.map((s, i) => {
            const c = errorCount(s);
            return (
              <button key={s.key} type="button" className={`navitem${s.key === current.key ? ' active' : ''}`} onClick={() => setActive(s.key)}>
                <span className="step">{i + 1}</span>
                <span className="navlabel">{s.title}</span>
                {c > 0 && <span className="err-dot">{c}</span>}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="sheet-main">
        {message && <div className="alert">{message}</div>}
        <div className="card">
          <div className="section-head">
            <span className="section-step">{idx + 1}</span>
            <h2>{current.title}</h2>
          </div>
          <SchemaSection section={current} path={path} values={data[path]} onChange={setField} errors={errorMap} ctx={ctx} data={data} />
        </div>
        <div className="actions sticky">
          <button type="button" className="btn" disabled={idx <= 0} onClick={() => setActive(sections[idx - 1].key)}>‹ Previous</button>
          <button type="button" className="btn" disabled={idx >= sections.length - 1} onClick={() => setActive(sections[idx + 1].key)}>Next ›</button>
          <span className="spacer" />
          <button type="button" className="btn btn-cancel" onClick={() => navigate(-1)} disabled={busy}>Cancel</button>
          <button type="button" className="btn" onClick={() => save(false)} disabled={busy}>Save draft</button>
          <button type="button" className="btn primary" onClick={() => save(true)} disabled={busy}>{busy ? 'Saving…' : 'Submit for review'}</button>
        </div>
      </section>

      <aside className="sheet-results card">
        <h2><span className="live-dot" /> Live valuation</h2>
        <ResultsPanel results={results} compact onWarningClick={goToField} />
      </aside>
    </div>
  );
}
