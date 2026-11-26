import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { computeValuation, DRAFTING_STATUSES, emptyValuation, getContext, plotArea, plotPerimeter, roadWidthChoice, sanitize, sectionPath, validate, visibleSections } from '@dsk/shared';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import SchemaSection, { hasMeasurements, MeasureContext } from '../components/SchemaForm.jsx';
import { LivePanel, LiveSheet, LiveSummaryButton, useLiveValuation } from '../components/LiveValuation.jsx';
import SectionIcon from '../components/SectionIcons.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Segmented from '../components/Segmented.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { CustomerInline } from '../components/CustomerContact.jsx';
import { SiteLine, siteFromProperty } from '../components/SiteInfo.jsx';
import { DuoSheet } from '../components/DuoIcons.jsx';
import { IconChevron, IconChevronLeft } from '../components/Icons.jsx';
import { alertDialog, confirmDialog, promptDialog } from '../components/ConfirmDialog.jsx';
import ReportViewer from '../report/ReportViewer.jsx';
import { dateTime } from '../utils/format.js';

// What Add customer filled into this sheet (and where), so nothing is asked twice. Shows the sheet's current values:
// the customer's own details, the bank, the property type and the site address, each with a link to its step.
function FromCustomer({ data, meta, sections, onGo, evaluator }) {
  const g = data.general || {};
  const a = data.applicant || {};
  const p = data.property || {};
  const c = meta.customer || {};
  const stepOf = (key) => sections.find((s) => s.key === key);
  const site = [p.number, p.street, p.village, p.district, p.pincode].filter(Boolean).join(', ');
  const rows = [
    ['applicant', 'Customer', [[a.salutation, a.name].filter(Boolean).join(' '), a.phone1].filter(Boolean).join(' · ')],
    c.contactType === 'poc' && c.pocName ? [null, 'POC', [c.pocName, c.pocPhone].filter(Boolean).join(' · ')] : null,
    meta.service ? [null, 'Service', meta.service] : null,
    ['general', meta.lockedFields?.includes('general.bankName') ? 'Bank (fixed)' : 'Bank', [g.bankName, g.branch, g.ifsc].filter(Boolean).join(' · ')],
    ['general', 'Property type', g.propertyType],
    ['property', 'Site address', site],
  ].filter(Boolean);
  return (
    <section className="from-cust" aria-label="Filled in from the customer">
      <div className="from-cust-head">
        <strong>Filled in from the customer</strong>
        <span className="muted small">{evaluator ? 'No need to type these again. Fill in what you see on site; nothing is compulsory.' : 'Taken from Add customer. Edit them in their step if needed.'}</span>
      </div>
      <ul>
        {rows.map(([key, label, value]) => (
          <li key={label} className={value ? '' : 'fc-empty'}>
            <span className="fc-label">{label}</span>
            <span className="fc-value">{value || 'Not given'}</span>
            {key && stepOf(key) && <button type="button" className="link-btn" onClick={() => onGo(key)}>{stepOf(key).title}</button>}
          </li>
        ))}
      </ul>
    </section>
  );
}

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

// wide screens: the sheet and the report side by side; narrower: one at a time (the drafting screen has the whole
// window: no side menu)
const WIDE = '(min-width: 1200px)';
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(WIDE);
    if (!mq) return undefined;
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

// The input sheet, one screen for everyone:
//  - field evaluator: the site inspection, every step; nothing is compulsory. "Submit to drafter" hands it in.
//  - drafter / superadmin: the same steps with the report beside them (edit the sheet and the report wording), then
//    "Generate report", which sends it to the superadmin for approval.
export default function ValuationForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  // ?return=/reports/new?... : go back there after saving or cancelling (only in-app paths)
  const [searchParams] = useSearchParams();
  const returnTo = (searchParams.get('return') || '').startsWith('/') && !searchParams.get('return').startsWith('//') ? searchParams.get('return') : '';
  const { isSuperadmin, isOffice, user } = useAuth();
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
  // the drafting screen (sheet + report): office staff, and a field evaluator drafting their own site inspection
  const draftingMine = !isOffice && !!meta?.drafter && String(meta.drafter?._id || meta.drafter) === String(user?._id) && DRAFTING_STATUSES.includes(meta?.status);
  const workspace = !!id && (isOffice || draftingMine);
  const [active, setActive] = useState('general');
  const [serverErrors, setServerErrors] = useState([]);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [savedNote, setSavedNote] = useState(''); // "Saved" beside Next after a step is saved
  // bumps each time the sheet is (re)loaded, so the figures worked out from the sides are filled in again
  const [loads, setLoads] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showAllErrors, setShowAllErrors] = useState(false);
  const wide = useWide();
  const [view, setView] = useState(searchParams.get('view') === 'report' ? 'report' : 'sheet'); // narrow screens
  const [reportDirty, setReportDirty] = useState(false);
  // the drafting screen takes the complete page: the app's menu and tab bar are hidden while it is open
  useEffect(() => {
    if (!workspace) return undefined;
    document.body.classList.add('drafting-full');
    return () => document.body.classList.remove('drafting-full');
  }, [workspace]);

  useEffect(() => {
    if (!id) return;
    api
      .getValuation(id)
      .then((v) => {
        // not yours to change now (submitted, with another drafter, waiting for approval, approved): the sheet page says why
        if (v.canEdit === false) { navigate(`/valuations/${id}`, { replace: true }); return; }
        const server = hydrate(v.data);
        serverData.current = server;
        savedJson.current = JSON.stringify(server);
        const draft = readDraft(draftKey);
        // locked fields (from the customer) always show the saved value, also in a restored draft
        if (draft?.data) for (const p of v.lockedFields || []) { const [sec, key] = p.split('.'); draft.data[sec] = { ...(draft.data[sec] || {}), [key]: server[sec]?.[key] }; }
        if (draft?.data && JSON.stringify(hydrate(draft.data)) !== savedJson.current) {
          setData(hydrate(draft.data));
          if (draft.active) setActive(draft.active);
          // someone saved the sheet after this draft was started
          setRestored({ savedAt: draft.savedAt, stale: !!(draft.base && v.updatedAt && new Date(v.updatedAt) > new Date(draft.base)) });
        } else {
          writeDraft(draftKey, null);
          setData(server);
        }
        setMeta(v);
        setLoads((n) => n + 1);
      })
      .catch((e) => setMessage(e.message));
  }, [id]);

  const ctx = useMemo(() => (data ? getContext(data) : null), [data]);
  const sections = useMemo(() => (data ? visibleSections(ctx, data) : []), [ctx, data]);
  const results = useMemo(() => (data ? computeValuation(sanitize(data)) : null), [data]);
  // the report beside the sheet follows the entries (a moment behind while typing)
  const lagging = useDeferredValue(data);
  const reportDoc = useMemo(() => {
    if (!workspace || !meta || !lagging) return null;
    const d = sanitize(lagging);
    return { ...meta, data: d, results: computeValuation(d) };
  }, [workspace, meta, lagging]);

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
  }, [areaSqyd, loads]); // eslint-disable-line react-hooks/exhaustive-deps
  // the same for the compound wall: its length follows the plot's perimeter (sum of the four sides) until a
  // different length is typed in
  // Site characteristics → Road width is worked out from the road width typed in Boundaries & dimensions
  // (below / above 20 ft); it is shown, not picked
  const roadChoice = data ? roadWidthChoice(data.boundaries?.roadWidthFt) : '';
  useEffect(() => {
    if (!data || ctx?.kind === 'flat') return;
    if ((data.site?.roadWidth || '') !== roadChoice) setField2('site', 'roadWidth', roadChoice);
  }, [roadChoice, loads]); // eslint-disable-line react-hooks/exhaustive-deps
  const perimeterFt = data ? plotPerimeter(data.boundaries) : null;
  const lastPerimeter = useRef(undefined);
  useEffect(() => {
    if (!data) return;
    const prev = lastPerimeter.current;
    lastPerimeter.current = perimeterFt;
    if (perimeterFt == null || ctx?.kind === 'flat') return;
    const cur = data.land?.compoundWallLength;
    const blank = cur === undefined || cur === null || cur === '';
    const followed = prev != null && Number(cur) === Number(prev);
    if ((blank || followed) && Number(cur) !== perimeterFt) setField2('land', 'compoundWallLength', perimeterFt);
  }, [perimeterFt, loads]); // eslint-disable-line react-hooks/exhaustive-deps
  const clientErrors = useMemo(() => (data ? validate(sanitize(data), { mode: showAllErrors ? 'submit' : 'draft' }) : []), [data, showAllErrors]);
  // required fields still empty (shown to the drafter: the report needs them)
  const missing = useMemo(() => (data && workspace ? validate(sanitize(data), { mode: 'submit' }) : []), [data, workspace]);

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
      setView('sheet');
      setActive(s.key);
      setTimeout(() => document.getElementById(`field-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  };

  goToFieldRef.current = goToField;
  const unsaved = () => JSON.stringify(data) !== savedJson.current;

  // save the sheet; status 'submitted' = the evaluator hands it to the drafters. Returns the saved sheet (or null).
  const persist = async (status) => {
    setMessage('');
    setServerErrors([]);
    const payload = { data: sanitize(data), ...(status ? { status } : {}) };
    setBusy(true);
    try {
      const saved = id ? await api.updateValuation(id, payload) : await api.createValuation(payload);
      savedJson.current = JSON.stringify(data);
      serverData.current = data;
      writeDraft(draftKey, null);
      setRestored(null);
      return saved;
    } catch (err) {
      setMessage(err.message);
      if (err.errors?.length) {
        setServerErrors(err.errors);
        goToField(err.errors[0].field);
      }
      // on a phone the message at the top is off-screen: say it where it is seen
      if (window.matchMedia?.('(max-width: 900px)').matches) {
        alertDialog({ title: "Couldn't save", message: `${err.message}${err.errors?.length ? '' : ' What you entered is kept on this phone.'}` });
      }
      return null;
    } finally {
      setBusy(false);
    }
  };

  // evaluator: hand the site inspection in (it is locked for them afterwards)
  const submit = async () => {
    const empty = validate(sanitize(data), { mode: 'submit' }).length;
    if (!(await confirmDialog({
      title: 'Submit the site inspection?',
      message: `It goes to the drafter, who completes the sheet and the report.${empty ? ` ${empty} field${empty === 1 ? ' is' : 's are'} still empty; the drafter fills ${empty === 1 ? 'it' : 'them'} in.` : ''} You can't change it after submitting unless the drafter sends it back to you.`,
      confirmLabel: 'Submit to drafter',
      cancelLabel: 'Keep editing',
    }))) return;
    const saved = await persist('submitted');
    if (saved) navigate(returnTo || `/valuations/${saved._id}`, { replace: true });
  };
  // save and stay (the drafter's screen), or save and go to the sheet page (the evaluator's last step)
  // save and stay on this step (the evaluator's last step: save now, submit later)
  const saveHere = async () => {
    const saved = unsaved() ? await persist() : true;
    if (!saved) return;
    if (saved !== true) setMeta((m) => ({ ...m, ...saved, customer: m?.customer, evaluator: m?.evaluator, drafter: m?.drafter }));
    setSavedNote('Saved');
    setTimeout(() => setSavedNote(''), 2500);
  };
  const save = async () => {
    const saved = await persist();
    if (!saved) return;
    if (workspace) {
      setMeta((m) => ({ ...m, ...saved }));
      setNotice('Saved');
      setTimeout(() => setNotice(''), 2000);
    } else navigate(returnTo || `/valuations/${saved._id}`, { replace: true });
  };

  // drafter / superadmin: generate the report (saves the sheet first) → it goes to the superadmin for approval
  // the superadmin doing the site inspection themselves goes straight to the report (no submitting, no queue)
  const ownInspection = isSuperadmin && !!id && String(meta?.evaluator?._id || meta?.evaluator) === String(user?._id) && ['draft', 'rejected'].includes(meta?.status);
  const canGenerate = workspace && (DRAFTING_STATUSES.includes(meta?.status) || ownInspection);
  const generate = async () => {
    if (!canGenerate) {
      alertDialog({ title: 'Not ready for a report', message: meta?.status === 'draft' || meta?.status === 'rejected' ? 'The field evaluator has not submitted the site inspection yet.' : 'A report can be generated once the sheet is with the drafter.' });
      return;
    }
    const errs = validate(sanitize(data), { mode: 'submit' });
    if (errs.length) {
      setShowAllErrors(true);
      setMessage(`Fill in ${errs.length} more field${errs.length === 1 ? '' : 's'} before generating the report (marked in red on the steps).`);
      goToField(errs[0].field);
      return;
    }
    if (reportDirty) {
      alertDialog({ title: 'Save the report edits first', message: 'You have changed the report wording. Save those edits (on the report) before generating it.' });
      return;
    }
    // the superadmin generates straight away (their report is approved at once); others confirm first
    if (!isSuperadmin && !(await confirmDialog({
      title: 'Generate the report?',
      message: 'A numbered copy is kept and sent to the superadmin for approval. The sheet is locked until they approve it or send it back to you.',
      confirmLabel: 'Generate report',
    }))) return;
    if (unsaved() && !(await persist())) return;
    setBusy(true);
    try {
      const r = await api.generateReport(id, 'bank');
      navigate(`/reports/${r._id}`);
    } catch (e) {
      setBusy(false);
      if (e.errors?.length) { setShowAllErrors(true); goToField(e.errors[0].field); }
      alertDialog({ title: "Couldn't generate the report", message: e.message });
    }
  };

  // field evaluator: draft their own site inspection (skips the drafters' queue; the superadmin still approves)
  const canStartDrafting = !isOffice && !!id && String(meta?.evaluator?._id || meta?.evaluator) === String(user?._id) && ['draft', 'rejected'].includes(meta?.status);
  const startDrafting = async () => {
    if (!(await confirmDialog({
      title: 'Draft this sheet yourself?',
      message: 'The sheet is saved and you complete it and the report yourself, instead of sending it to the drafters. When you generate the report it goes to the superadmin for approval. Your name is recorded as the drafter.',
      confirmLabel: 'Start drafting',
    }))) return;
    setBusy(true);
    setMessage('');
    try {
      const v = await api.startDrafting(id, sanitize(data));
      savedJson.current = JSON.stringify(data);
      serverData.current = data;
      writeDraft(draftKey, null);
      setRestored(null);
      setMeta(v);
    } catch (e) {
      setMessage(e.message);
      if (e.errors?.length) { setServerErrors(e.errors); goToField(e.errors[0].field); }
    } finally {
      setBusy(false);
    }
  };

  // drafter / superadmin: return the site inspection to the evaluator — not on your own inspection (there is no one
  // else to send it to: you fix it yourself and generate)
  const ownInspector = String(meta?.evaluator?._id || meta?.evaluator || '') === String(user?._id || '-');
  const canSendBack = workspace && isOffice && DRAFTING_STATUSES.includes(meta?.status) && !ownInspector;
  const sendBack = async () => {
    const note = await promptDialog({
      title: `Send ${meta.referenceNo} back to the evaluator?`,
      message: `Tell ${meta.evaluator?.name || 'the evaluator'} what to fix. They will see this note on the sheet.`,
      placeholder: 'e.g. Add the east side photo',
      confirmLabel: 'Send back',
      required: true,
    });
    if (note == null) return;
    try {
      if (unsaved()) await persist();
      await api.reviewValuation(id, 'rejected', note);
      writeDraft(draftKey, null);
      navigate('/valuations');
    } catch (e) {
      alertDialog({ title: "Couldn't send it back", message: e.message });
    }
  };

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
  // Next saves the sheet (when something changed), then opens the next step; a save that fails stays on this step
  const goNext = async () => {
    if (id && unsaved()) {
      const saved = await persist();
      if (!saved) return;
      setMeta((m) => ({ ...m, ...saved, customer: m?.customer, evaluator: m?.evaluator, drafter: m?.drafter }));
      setSavedNote('Saved');
      setTimeout(() => setSavedNote(''), 2500);
    }
    setActive(sections[idx + 1].key);
  };

  // the last step ends with: evaluator → Submit to drafter (while it is with them), drafter / superadmin → Save
  const withEvaluator = !id || ['draft', 'rejected'].includes(meta?.status);
  const ownSheet = !id || String(meta?.evaluator?._id || meta?.evaluator) === String(user?._id);
  const finalAction = workspace
    ? { label: 'Save sheet', short: 'Save', hint: 'Save; the report beside follows the sheet', run: save }
    : ownSheet && withEvaluator && id
      ? { label: 'Submit to drafter', short: 'Submit', hint: 'Hand the site inspection to the drafter', run: submit }
      : { label: 'Save', short: 'Save', run: save };
  const showSheet = !workspace || wide || view === 'sheet';
  const showReport = workspace && (wide || view === 'report');

  const notes = (
    <>
      {meta?.status === 'rejected' && meta.reviewNote && (
        <div className="draft-note warn sheet-note" role="status">
          <span><strong>Sent back{meta.reviewedBy?.name ? ` by ${meta.reviewedBy.name}` : ''}:</strong> {meta.reviewNote}</span>
        </div>
      )}
      {meta?.status === 'returned' && meta.returnNote && (
        <div className="draft-note warn sheet-note" role="status">
          <span><strong>Report sent back{meta.returnedBy?.name ? ` by ${meta.returnedBy.name}` : ''}:</strong> {meta.returnNote} Make the changes and generate the report again (a new version).</span>
        </div>
      )}
      {restored && (
        <div className={`draft-note sheet-draft-note${restored.stale ? ' warn' : ''}`} role="status">
          <span>
            Restored your unsaved changes{restored.savedAt ? ` from ${dateTime(restored.savedAt)}` : ''}. They stay on this device until you save.
            {restored.stale && ' This sheet has been saved by someone since then; discarding loads that latest version.'}
          </span>
          <button type="button" className="link-btn" onClick={discardDraft}>Discard changes</button>
        </div>
      )}
    </>
  );

  return (
    <div className={`sheet-layout${workspace ? ` workspace${showReport && showSheet ? ' split' : ''}` : ''}`}>
      <PageHeader
        icon={DuoSheet}
        back={returnTo ? { to: returnTo, label: 'Back', exact: true } : id && !isOffice ? { to: `/valuations/${id}`, label: draftingMine ? 'Sheet' : 'Site inspection' } : { to: '/valuations', label: 'Site Inspections' }}
        title={workspace ? (ownInspection ? 'Site inspection & report' : isSuperadmin && meta?.status === 'draft' ? 'Input sheet' : 'Drafting') : 'Site inspection'}
        meta={meta?.referenceNo && <><span className="badge">{meta.referenceNo}</span>{meta?.status && <StatusBadge status={meta.status} />}</>}
        actions={canStartDrafting ? (
          <div className="actions no-print form-head-actions">
            <button type="button" className="btn primary" onClick={startDrafting} disabled={busy} title="Complete the sheet and the report yourself">{busy ? 'Working…' : 'Start drafting'}</button>
          </div>
        ) : workspace && (
          <div className="actions no-print form-head-actions">
            {notice && <span className="rt-notice">{notice}</span>}
            {canSendBack && <button type="button" className="btn danger-outline" onClick={sendBack} disabled={busy}>Send back to evaluator</button>}
            <button type="button" className={`btn primary ws-generate${canGenerate && !missing.length ? '' : ' not-ready'}`} onClick={generate} disabled={busy}
              title={!canGenerate ? 'The site inspection is not submitted yet' : missing.length ? `${missing.length} field${missing.length === 1 ? '' : 's'} still to fill` : 'Generate the report and send it for approval'}>
              {busy ? 'Working…' : 'Generate report'}
              {canGenerate && missing.length > 0 && <span className="ws-count" aria-label={`${missing.length} fields to fill`}>{missing.length}</span>}
            </button>
          </div>
        )}
        subtitle={meta?.customer && (
          <span className="form-sub">
            <CustomerInline customer={meta.customer} />
            <SiteLine site={siteFromProperty(data.property)} />
            {meta.basedOn?.referenceNo && <span className="muted small">Site inspection reused from <Link to={`/valuations/${meta.basedOn._id}`}>{meta.basedOn.referenceNo}</Link></span>}
            {(meta.service || (workspace && meta.evaluator?.name)) && <span className="muted small">{[meta.service && `Service: ${meta.service}`, workspace && meta.evaluator?.name && `site inspection by ${meta.evaluator.name}`].filter(Boolean).join(' · ')}</span>}
          </span>
        )}
      />
      {workspace && !wide && (
        <Segmented
          label="Show"
          className="ws-toggle"
          options={[{ value: 'sheet', label: 'Sheet' }, { value: 'report', label: 'Report' }]}
          value={view}
          onChange={setView}
        />
      )}
      {showSheet && (
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
      )}

      {showSheet && (
        <section className="sheet-main">
          {message && <div className="alert">{message}</div>}
          {notes}
          {id && idx === 0 && meta?.customer && (
            <FromCustomer data={data} meta={meta} sections={sections} onGo={(key) => setActive(key)} evaluator={!workspace && withEvaluator} />
          )}
          <div className="card">
            <div className="section-head">
              <span className="section-step"><SectionIcon section={current} size={20} /></span>
              <h2>{current.title}</h2>
              <span className="section-count">Step {idx + 1} of {sections.length}</span>
            </div>
            {current.intro && <p className="section-intro">{current.intro}</p>}
            {/* measurements typed in feet or metres (saved with the sheet; values are kept in feet) */}
            {hasMeasurements(current) && (
              <div className="measure-switch">
                <span>Measurements in</span>
                <Segmented
                  label="Measurements in"
                  options={[{ value: 'ft', label: 'Fts' }, { value: 'm', label: 'Mts' }]}
                  value={data.general?.measureUnit === 'm' ? 'm' : 'ft'}
                  onChange={(v) => setField2('general', 'measureUnit', v)}
                />
              </div>
            )}
            <MeasureContext.Provider value={data.general?.measureUnit === 'm' ? 'm' : 'ft'}>
              <SchemaSection section={current} path={path} values={data[path]} onChange={setField} onChangeAt={setField2} errors={errorMap} ctx={ctx} data={data} locked={meta?.lockedFields || []} />
            </MeasureContext.Provider>
          </div>
          <div className="actions sticky">
            <LiveSummaryButton live={live} onOpen={() => live.setOpen(true)} />
            <span className="spacer" />
            <button type="button" className="btn sa-nav sa-prev" aria-label="Previous step" disabled={idx <= 0} onClick={() => setActive(sections[idx - 1].key)}>
              <IconChevronLeft size={16} /><span className="sa-txt">Previous</span>
            </button>
            {savedNote && <span className="sa-saved" role="status">✓ {savedNote}</span>}
            <div className="sa-save">
              {/* the evaluator's last step: save without handing the sheet in yet */}
              {isLast && finalAction.run === submit && (
                <button type="button" className="btn sa-nav sa-save-only" title="Save what you have entered; submit when you are done" onClick={saveHere} disabled={busy}>Save</button>
              )}
              {isLast ? (
                <button type="button" className="btn primary sa-primary sa-final" title={finalAction.hint} onClick={finalAction.run} disabled={busy}>
                  {busy ? 'Saving…' : <><span className="sa-full">{finalAction.label}</span><span className="sa-short">{finalAction.short}</span></>}
                </button>
              ) : (
                <button type="button" className="btn primary sa-primary sa-next" aria-label={id ? 'Save and go to the next step' : 'Next step'} title={id ? 'Saves this step, then opens the next one' : undefined} onClick={goNext} disabled={busy}>
                  <span>{busy ? 'Saving…' : id ? 'Save & next' : 'Next'}</span>{!busy && <IconChevron size={16} />}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {showReport && reportDoc && (
        <aside className="ws-report" aria-label="Report">
          <ReportViewer
            embedded
            doc={reportDoc}
            overrides={meta.reportOverrides || {}}
            canEdit={meta.canEdit !== false}
            onDirtyChange={setReportDirty}
            onSave={async (draft) => {
              const res = await api.saveReportOverrides(id, draft);
              setMeta((m) => ({ ...m, reportOverrides: res.reportOverrides }));
              return { overrides: res.reportOverrides, editedText: `Last edited ${dateTime(res.reportEditedAt)}` };
            }}
            heading={<strong className="ws-report-title">Report{missing.length ? <span className="muted small"> · {missing.length} field{missing.length === 1 ? '' : 's'} to fill</span> : <span className="muted small"> · ready to generate</span>}</strong>}
          />
        </aside>
      )}

      {!workspace && (
        <aside className="sheet-results card" aria-label="Live valuation">
          <LivePanel results={results} delta={live.delta} onWarningClick={goToField} />
        </aside>
      )}
      <LiveSheet results={results} live={live} />
      {workspace && meta?.status === 'draft' && !ownInspection && (
        <p className="hint ws-wait">The field evaluator has not submitted the site inspection yet. <Link to={`/valuations/${id}`}>Open the sheet page</Link>.</p>
      )}
    </div>
  );
}
