import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { computeValuation, emptyValuation, getContext, plotArea, sanitize, sectionPath, validate, visibleSections } from '@dsk/shared';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import SchemaSection from '../components/SchemaForm.jsx';
import { LivePanel, LiveSheet, LiveSummaryButton, useLiveValuation } from '../components/LiveValuation.jsx';
import SectionIcon from '../components/SectionIcons.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { CustomerInline } from '../components/CustomerContact.jsx';
import { SiteLine, siteFromProperty } from '../components/SiteInfo.jsx';
import { DuoSheet } from '../components/DuoIcons.jsx';
import { IconChevron, IconChevronLeft, IconEye } from '../components/Icons.jsx';
import { alertDialog, confirmDialog, promptDialog } from '../components/ConfirmDialog.jsx';
import { dateTime } from '../utils/format.js';

// Merge a saved sheet over the defaults so every input stays controlled and new schema fields appear
function hydrate(saved = {}) {
  const base = emptyValuation();
  for (const [path, values] of Object.entries(saved)) base[path] = { ...(base[path] || {}), ...values };
  return base;
}

// Unsaved entries are kept on this device as you type, so nothing is lost if the page is closed, reloaded or left
// before saving. The draft is restored when the sheet is opened again and removed once the sheet is saved.
const DRAFT_DELAY = 400;
const readDraft = (key) => {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
};
const writeDraft = (key, value) => {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch { /* storage full / unavailable: the form still works, only the draft is not kept */ }
};

export default function ValuationForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  // ?return=/reports/new?... : go back there after saving or cancelling (only in-app paths)
  const [searchParams] = useSearchParams();
  const returnTo = (searchParams.get('return') || '').startsWith('/') && !searchParams.get('return').startsWith('//') ? searchParams.get('return') : '';
  const { isSuperadmin, isReviewer, user } = useAuth();
  const draftKey = `dsk_sheet_draft:${user?._id || 'me'}:${id || 'new'}`;
  // the sheet as last saved on the server: what "unsaved changes" are compared against
  const savedJson = useRef(id ? null : JSON.stringify(emptyValuation()));
  const serverData = useRef(null);
  const [restored, setRestored] = useState(null); // { savedAt, stale } when a draft was put back
  const [data, setData] = useState(() => {
    if (id) return null;
    const d = readDraft(`dsk_sheet_draft:${user?._id || 'me'}:new`);
    return d?.data ? hydrate(d.data) : emptyValuation();
  });
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
        // a report has been generated from it: the evaluator can't change it any more (the sheet page says why)
        if (!isReviewer && v.status === 'approved') { navigate(`/valuations/${id}`, { replace: true }); return; }
        const server = hydrate(v.data);
        serverData.current = server;
        savedJson.current = JSON.stringify(server);
        const draft = readDraft(draftKey);
        if (draft?.data && JSON.stringify(hydrate(draft.data)) !== savedJson.current) {
          setData(hydrate(draft.data));
          if (draft.active) setActive(draft.active);
          // someone saved the sheet after this draft was started (no note when just back from the report preview)
          if (searchParams.get('from') !== 'preview') setRestored({ savedAt: draft.savedAt, stale: !!(draft.base && v.updatedAt && new Date(v.updatedAt) > new Date(draft.base)) });
        } else {
          writeDraft(draftKey, null);
          setData(server);
        }
        setMeta(v);
      })
      .catch((e) => setMessage(e.message));
  }, [id]);

  const ctx = useMemo(() => (data ? getContext(data) : null), [data]);
  const sections = useMemo(() => (data ? visibleSections(ctx, data) : []), [ctx, data]);
  const results = useMemo(() => (data ? computeValuation(sanitize(data)) : null), [data]);

  // site area from the measured sides → "Site area as per actual" (Land valuation), while that is empty or still
  // the figure worked out before; a figure typed in by hand is kept
  const areaSqyd = data ? plotArea(data.boundaries, data.property?.siteShape)?.sqyd : undefined;
  const lastArea = useRef(undefined);
  useEffect(() => {
    if (!data) return;
    const prev = lastArea.current;
    lastArea.current = areaSqyd;
    if (areaSqyd === undefined || ctx?.kind === 'flat') return;
    const cur = data.land?.siteAreaActual;
    const blank = cur === undefined || cur === null || cur === '';
    const followed = prev !== undefined && Number(cur) === Number(prev);
    if ((blank || followed) && Number(cur) !== areaSqyd) setField2('land', 'siteAreaActual', areaSqyd);
  }, [areaSqyd]); // eslint-disable-line react-hooks/exhaustive-deps
  const clientErrors = useMemo(() => (data ? validate(sanitize(data), { mode: showAllErrors ? 'submit' : 'draft' }) : []), [data, showAllErrors]);

  const errorMap = useMemo(() => {
    const m = {};
    for (const e of [...clientErrors, ...serverErrors]) m[e.field] ||= e.message;
    return m;
  }, [clientErrors, serverErrors]);

  const errorCount = (s) => Object.keys(errorMap).filter((f) => f.startsWith(`${sectionPath(s)}.`) && s.fields.some((x) => f.startsWith(`${sectionPath(s)}.${x.key}`))).length;

  // keep unsaved entries as a draft on this device while typing
  const keepDraft = () => {
    const changed = JSON.stringify(data) !== savedJson.current;
    writeDraft(draftKey, changed ? { data, active, savedAt: new Date().toISOString(), base: meta?.updatedAt || null } : null);
  };
  useEffect(() => {
    if (!data || savedJson.current === null) return undefined;
    const t = setTimeout(keepDraft, DRAFT_DELAY);
    return () => clearTimeout(t);
  }, [data, active, draftKey, meta?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // a field in another section (links between sections, e.g. corner plot, site area)
  const setField2 = (p, key, value) => setData((d) => ({ ...d, [p]: { ...(d[p] || {}), [key]: value } }));
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

  // status: undefined = keep current, 'submitted' (evaluator) or 'received' (superadmin finishing a sheet: ready for a report)
  const save = async (status) => {
    setMessage('');
    setServerErrors([]);
    const payload = { data: sanitize(data), ...(status ? { status } : {}) };
    // submitted / received / completed sheets must stay complete
    const complete = status || ['submitted', 'received', 'approved'].includes(meta?.status);
    if (complete) {
      const errs = validate(payload.data, { mode: 'submit' });
      if (errs.length) {
        setShowAllErrors(true);
        setMessage(`Please complete ${errs.length} required / invalid field${errs.length > 1 ? 's' : ''} before ${status === 'received' ? 'finishing' : status ? 'submitting' : 'saving'}.`);
        goToField(errs[0].field);
        return;
      }
    }
    setBusy(true);
    try {
      const saved = id ? await api.updateValuation(id, payload) : await api.createValuation(payload);
      savedJson.current = JSON.stringify(data);
      writeDraft(draftKey, null);
      navigate(returnTo || `/valuations/${saved._id}`, { replace: true });
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

  const unsaved = () => JSON.stringify(data) !== savedJson.current;
  const discardDraft = async () => {
    if (!(await confirmDialog({
      title: 'Discard the restored changes?',
      message: 'The sheet goes back to how it was last saved.',
      confirmLabel: 'Discard changes',
      cancelLabel: 'Keep them',
      tone: 'danger',
    }))) return;
    writeDraft(draftKey, null);
    setData(serverData.current || emptyValuation());
    setRestored(null);
  };
  const isLast = idx >= sections.length - 1;
  const goNext = () => setActive(sections[idx + 1].key);

  // only Previous / Next on the way; the last step ends with:
  //  - evaluator: Submit (first time / after being sent back), then Save changes (they can edit until the report)
  //  - superadmin: Save & finish on a sheet not handed in yet (ready for a report, no approval), else Save
  const handedIn = ['submitted', 'received', 'approved'].includes(meta?.status);
  const ownSheet = !id || String(meta?.evaluator?._id || meta?.evaluator) === String(user?._id);
  const finalAction = !isSuperadmin
    ? (handedIn
      ? { label: 'Save changes', short: 'Save', hint: 'The superadmin sees the updated sheet', run: () => save() }
      : { label: 'Submit to superadmin', short: 'Submit', run: () => save('submitted') })
    : (handedIn || !ownSheet
      // an evaluator's sheet is handed in by the evaluator, not finished by the superadmin
      ? { label: 'Save', short: 'Save', hint: handedIn ? 'Save the changes' : 'Save; the evaluator still submits it', run: () => save() }
      : { label: 'Save & finish', short: 'Finish', hint: 'Save the sheet: ready for a report', run: () => save('received') });
  // superadmin: look at the report as it will print, with what is on screen now (saved or not), before approving
  const canPreview = isSuperadmin && !!id;
  // superadmin, on a sheet the evaluator handed in: send it back from right here (the report is generated from its preview)
  const reviewable = isSuperadmin && !!id && ['submitted', 'received'].includes(meta?.status) && String(meta?.evaluator?._id || meta?.evaluator) !== String(user?._id);
  const sendBack = async () => {
    const note = await promptDialog({
      title: `Send ${meta.referenceNo} back?`,
      message: `Tell ${meta.evaluator?.name || 'the evaluator'} what to fix. They will see this note on the sheet.`,
      placeholder: 'e.g. Add the site photos',
      confirmLabel: 'Send back',
      required: true,
    });
    if (note == null) return;
    try {
      await api.reviewValuation(id, 'rejected', note);
      writeDraft(draftKey, null);
      navigate('/valuations');
    } catch (e) {
      alertDialog({ title: "Couldn't send it back", message: e.message });
    }
  };
  const preview = () => {
    keepDraft();
    navigate(`/valuations/${id}/report?draft=1${returnTo ? `&return=${encodeURIComponent(returnTo)}` : ''}`);
  };

  return (
    <div className="sheet-layout">
      <PageHeader
        icon={DuoSheet}
        back={returnTo ? { to: returnTo, label: 'Back to report review', exact: true } : id && !isSuperadmin ? { to: `/valuations/${id}`, label: 'Input sheet' } : { to: '/valuations', label: 'Input Sheets' }}
        title={id ? 'Edit input sheet' : 'New input sheet'}
        meta={meta?.referenceNo && <span className="badge">{meta.referenceNo}</span>}
        actions={reviewable && (
          <div className="actions no-print form-head-actions">
            <button type="button" className="btn danger-outline" onClick={sendBack} disabled={busy}>Send back</button>
          </div>
        )}
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
        {restored && (
          <div className={`draft-note sheet-draft-note${restored.stale ? ' warn' : ''}`} role="status">
            <span>
              Restored your unsaved changes{restored.savedAt ? ` from ${dateTime(restored.savedAt)}` : ''}. They stay on this device until you save.
              {restored.stale && ' This sheet has been saved by someone since then; discarding loads that latest version.'}
            </span>
            <button type="button" className="link-btn" onClick={discardDraft}>Discard changes</button>
          </div>
        )}
        <div className="card">
          <div className="section-head">
            <span className="section-step"><SectionIcon section={current} size={20} /></span>
            <h2>{current.title}</h2>
            <span className="section-count">Step {idx + 1} of {sections.length}</span>
          </div>
          {current.intro && <p className="section-intro">{current.intro}</p>}
          <SchemaSection section={current} path={path} values={data[path]} onChange={setField} onChangeAt={setField2} errors={errorMap} ctx={ctx} data={data} />
        </div>
        <div className="actions sticky">
          <LiveSummaryButton live={live} onOpen={() => live.setOpen(true)} />
          <span className="spacer" />
          <button type="button" className="btn sa-nav sa-prev" aria-label="Previous step" disabled={idx <= 0} onClick={() => setActive(sections[idx - 1].key)}>
            <IconChevronLeft size={16} /><span className="sa-txt">Previous</span>
          </button>
          {isLast && canPreview && (
            <button type="button" className="btn sa-nav sa-preview" aria-label="Preview report" title="Preview the report with these entries" onClick={preview} disabled={busy}>
              <IconEye size={16} /><span className="sa-txt">Preview</span>
            </button>
          )}
          <div className="sa-save">
            {isLast ? (
              <button type="button" className="btn primary sa-primary sa-final" title={finalAction.hint} onClick={finalAction.run} disabled={busy}>
                {busy ? 'Saving…' : <><span className="sa-full">{finalAction.label}</span><span className="sa-short">{finalAction.short}</span></>}
              </button>
            ) : (
              <button type="button" className="btn primary sa-primary sa-next" aria-label="Next step" onClick={goNext} disabled={busy}>
                <span>Next</span><IconChevron size={16} />
              </button>
            )}
          </div>
        </div>
      </section>

      <aside className="sheet-results card" aria-label="Live valuation">
        <LivePanel results={results} delta={live.delta} onWarningClick={goToField} />
      </aside>
      <LiveSheet results={results} live={live} />
    </div>
  );
}
