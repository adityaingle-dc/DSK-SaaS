import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { computeValuation, emptyValuation, getContext, sanitize, sectionPath, validate, visibleSections } from '@dsk/shared';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import SchemaSection from '../components/SchemaForm.jsx';
import { LivePanel, LiveSheet, LiveSummaryButton, useLiveValuation } from '../components/LiveValuation.jsx';
import SectionIcon from '../components/SectionIcons.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { CustomerInline } from '../components/CustomerContact.jsx';
import { SiteLine, siteFromProperty } from '../components/SiteInfo.jsx';
import { DuoSheet } from '../components/DuoIcons.jsx';

// Merge a saved sheet over the defaults so every input stays controlled and new schema fields appear
function hydrate(saved = {}) {
  const base = emptyValuation();
  for (const [path, values] of Object.entries(saved)) base[path] = { ...(base[path] || {}), ...values };
  return base;
}

export default function ValuationForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSuperadmin } = useAuth();
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

  // bring the start of a newly opened section into view (not on first load)
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [active]);

  // live valuation state is shared by the side panel and the action-bar summary
  const goToFieldRef = useRef(null);
  const live = useLiveValuation(results, (f) => goToFieldRef.current?.(f));

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

  goToFieldRef.current = goToField;

  // status: undefined = keep current, 'submitted' (evaluator) or 'approved' (superadmin: no review step needed)
  const save = async (status) => {
    setMessage('');
    setServerErrors([]);
    const payload = { data: sanitize(data), ...(status ? { status } : {}) };
    // submitted / approved sheets must stay complete
    const complete = status || ['submitted', 'approved'].includes(meta?.status);
    if (complete) {
      const errs = validate(payload.data, { mode: 'submit' });
      if (errs.length) {
        setShowAllErrors(true);
        setMessage(`Please complete ${errs.length} required / invalid field${errs.length > 1 ? 's' : ''} before ${status === 'approved' ? 'approving' : status ? 'submitting' : 'saving'}.`);
        goToField(errs[0].field);
        return;
      }
    }
    setBusy(true);
    try {
      const saved = id ? await api.updateValuation(id, payload) : await api.createValuation(payload);
      navigate(`/valuations/${saved._id}`, { replace: true });
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
      <PageHeader
        icon={DuoSheet}
        back={id ? { to: `/valuations/${id}`, label: 'Valuation details' } : { to: '/valuations', label: 'Valuations' }}
        title={id ? 'Edit valuation' : 'New valuation'}
        meta={meta?.referenceNo && <span className="badge">{meta.referenceNo}</span>}
        subtitle={meta?.customer && (
          <span className="form-sub">
            <CustomerInline customer={meta.customer} />
            <SiteLine site={siteFromProperty(data.property)} />
          </span>
        )}
      />
      <nav className="stepper" aria-label="Form sections">
        <ol className="stepper-track">
          {sections.map((s, i) => {
            const c = errorCount(s);
            const state = c > 0 ? 'error' : i < idx ? 'done' : i === idx ? 'current' : 'upcoming';
            const label = `Step ${i + 1}: ${s.title}${c ? ` (${c} to fix)` : state === 'done' ? ' (visited)' : ''}`;
            return (
              <li key={s.key} className={`stepper-item is-${state}${i === idx ? ' is-active' : ''}`}>
                <button type="button" aria-current={i === idx ? 'step' : undefined} aria-label={label} title={s.title} onClick={() => setActive(s.key)}>
                  <span className="stepper-dot">{state === 'error' ? c : <SectionIcon section={s} size={16} />}</span>
                  <span className="stepper-label">{s.title}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="sheet-main">
        {message && <div className="alert">{message}</div>}
        <div className="card">
          <div className="section-head">
            <span className="section-step"><SectionIcon section={current} size={20} /></span>
            <h2>{current.title}</h2>
            <span className="section-count">Step {idx + 1} of {sections.length}</span>
          </div>
          <SchemaSection section={current} path={path} values={data[path]} onChange={setField} errors={errorMap} ctx={ctx} data={data} />
        </div>
        <div className="actions sticky">
          <LiveSummaryButton live={live} onOpen={() => live.setOpen(true)} />
          <button type="button" className="btn" disabled={idx <= 0} onClick={() => setActive(sections[idx - 1].key)}>‹ Previous</button>
          <button type="button" className="btn" disabled={idx >= sections.length - 1} onClick={() => setActive(sections[idx + 1].key)}>Next ›</button>
          <span className="spacer" />
          <button type="button" className="btn btn-cancel" onClick={() => navigate(-1)} disabled={busy}>Cancel</button>
          {!isSuperadmin ? (
            <>
              <button type="button" className="btn" onClick={() => save()} disabled={busy}>Save draft</button>
              <button type="button" className="btn primary" onClick={() => save('submitted')} disabled={busy}>{busy ? 'Saving…' : 'Submit for review'}</button>
            </>
          ) : meta?.status === 'approved' ? (
            <button type="button" className="btn primary" onClick={() => save()} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => save()} disabled={busy}>{meta?.status === 'submitted' ? 'Save changes' : 'Save draft'}</button>
              <button type="button" className="btn primary" onClick={() => save('approved')} disabled={busy}>{busy ? 'Saving…' : 'Save & approve'}</button>
            </>
          )}
        </div>
      </section>

      <aside className="sheet-results card" aria-label="Live valuation">
        <LivePanel results={results} delta={live.delta} onWarningClick={goToField} />
      </aside>
      <LiveSheet results={results} live={live} />
    </div>
  );
}
