import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { REPORT_TEMPLATES, computeValuation, sanitize, validate } from '@dsk/shared';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import { initials } from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { DuoSheet } from '../components/DuoIcons.jsx';
import { IconChevron, IconSearch, IconTick } from '../components/Icons.jsx';
import SectionIcon from '../components/SectionIcons.jsx';
import SheetSections from '../components/SheetView.jsx';
import ReportViewer from '../report/ReportViewer.jsx';
import SheetEditor, { hydrate } from '../components/SheetEditor.jsx';
import { propertyLabels, groupByProperty } from '../utils/properties.js';
import { confirmDialog } from '../components/ConfirmDialog.jsx';

// Reports → Generate: ① customer → ② approved input sheet → ③ report type → generate & store
const STEPS = ['Customer', 'Input sheet', 'Report type', 'Review & generate'];

// a report can be generated from a sheet the evaluator has handed in (generating it completes the sheet)
const READY = ['submitted', 'received', 'approved'];

export default function GenerateReport() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState(null); // { customer, valuations, reports }
  const [sheetId, setSheetId] = useState('');
  const [types, setTypes] = useState([]);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // step 3: the complete input sheet (data + results) for the side-by-side preview
  const [full, setFull] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [reportDirty, setReportDirty] = useState(false); // unsaved wording edits in step 4
  // step 4: edit the input sheet in place (the report preview follows the edits live)
  const [editingSheet, setEditingSheet] = useState(false);
  // phones / tablets: show one pane at a time (report or input sheet)
  const [pane, setPane] = useState('report');
  const [draft, setDraft] = useState(null);
  const [sheetDirty, setSheetDirty] = useState(false);
  const [sheetErrors, setSheetErrors] = useState([]);
  const [showSheetErrors, setShowSheetErrors] = useState(false);
  const [savingSheet, setSavingSheet] = useState(false);
  const [sheetNotice, setSheetNotice] = useState('');
  const liveDraft = useDeferredValue(draft); // keeps typing smooth while the report redraws
  // step 4 is a full-screen layer: stop the page behind it from scrolling
  useEffect(() => {
    if (step !== 3) return undefined;
    document.body.classList.add('gen-full-open');
    return () => document.body.classList.remove('gen-full-open');
  }, [step]);
  // leaving step 4 ends sheet editing (the Discard/Save buttons only exist there)
  useEffect(() => { if (step !== 3) { setEditingSheet(false); setDraft(null); setSheetDirty(false); setSheetNotice(''); } }, [step]);

  useEffect(() => {
    api.reportTypes().then((r) => { setTypes(r.types); if (r.types.length === 1) setType(r.types[0].key); }).catch(() => {});
  }, []);

  // deep links: ?customer=<id> starts at step 2; ?valuation=<id> starts at step 3
  useEffect(() => {
    const cid = params.get('customer');
    const vid = params.get('valuation');
    (async () => {
      try {
        if (vid) {
          const v = await api.getValuation(vid);
          if (v.customer?._id) {
            const c = await api.getCustomer(v.customer._id);
            setCustomer(c);
            if (READY.includes(v.status)) {
              setSheetId(vid);
              if (params.get('type')) setType(params.get('type'));
              setStep(params.get('step') === '4' ? 3 : 2);
            } else setStep(1);
          }
        } else if (cid) {
          setCustomer(await api.getCustomer(cid));
          setStep(1);
        }
      } catch (e) {
        setError(e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // customer search
  useEffect(() => {
    if (step !== 0) return undefined;
    const t = setTimeout(() => api.listCustomers({ q: q.trim(), limit: 8 }).then((r) => setFound(r.items)).catch((e) => setError(e.message)), 250);
    return () => clearTimeout(t);
  }, [q, step]);

  const pickCustomer = async (id) => {
    setError('');
    try {
      setCustomer(await api.getCustomer(id));
      setSheetId('');
      setStep(1);
    } catch (e) {
      setError(e.message);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.generateReport(sheetId, type);
      navigate(`/reports/${r._id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  useEffect(() => {
    if (step !== 3 || !sheetId) return undefined;
    let cancelled = false;
    setPreviewError('');
    if (full?._id !== sheetId) setFull(null);
    api.getValuation(sheetId)
      .then((v) => { if (!cancelled) setFull(v); })
      .catch((e) => { if (!cancelled) setPreviewError(e.message); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, sheetId]);

  const sheets = customer?.valuations || [];
  const labels = propertyLabels(groupByProperty(sheets));
  const reportsPerSheet = (customer?.reports || []).reduce((m, r) => ({ ...m, [r.valuation]: (m[r.valuation] || 0) + 1 }), {});
  const sheet = sheets.find((v) => v._id === sheetId);
  const approvedCount = sheets.filter((v) => READY.includes(v.status)).length;

  // report preview: the saved sheet, or the sheet being edited (recalculated as you type)
  const previewDoc = useMemo(() => {
    if (!full) return null;
    if (!editingSheet || !liveDraft) return full;
    const data = sanitize(liveDraft);
    return { ...full, data, results: computeValuation(data) };
  }, [full, editingSheet, liveDraft]);

  const sheetErrorMap = useMemo(() => {
    if (!editingSheet || !draft) return {};
    const list = [...(showSheetErrors ? validate(sanitize(draft), { mode: 'submit' }) : []), ...sheetErrors];
    return list.reduce((m, e) => (m[e.field] ? m : { ...m, [e.field]: e.message }), {});
  }, [editingSheet, draft, showSheetErrors, sheetErrors]);

  const startEditSheet = () => {
    setPane('sheet');
    setDraft(hydrate(full.data));
    setSheetDirty(false);
    setSheetErrors([]);
    setShowSheetErrors(false);
    setSheetNotice('');
    setEditingSheet(true);
  };
  const setSheetField = (path, key, value) => {
    setDraft((d) => ({ ...d, [path]: { ...(d[path] || {}), [key]: value } }));
    setSheetErrors((errs) => errs.filter((e) => !e.field.startsWith(`${path}.${key}`)));
    setSheetDirty(true);
  };
  const discardSheet = async () => {
    if (sheetDirty && !(await confirmDialog({ title: 'Discard your changes?', message: 'Your unsaved edits to the input sheet will be lost.', confirmLabel: 'Discard changes', cancelLabel: 'Keep editing', tone: 'danger' }))) return;
    setEditingSheet(false);
    setDraft(null);
    setSheetDirty(false);
  };
  const saveSheet = async () => {
    const data = sanitize(draft);
    const errs = validate(data, { mode: 'submit' }); // the sheet is approved, so it must stay complete
    if (errs.length) {
      setShowSheetErrors(true);
      setSheetNotice('');
      return;
    }
    setSavingSheet(true);
    try {
      const saved = await api.updateValuation(full._id, { data });
      setFull((f) => ({ ...f, ...saved, reportOverrides: f.reportOverrides }));
      setEditingSheet(false);
      setDraft(null);
      setSheetDirty(false);
      setSheetNotice('Input sheet saved. The report below uses the new values.');
    } catch (e) {
      if (e.errors?.length) setSheetErrors(e.errors);
      setSheetNotice(e.message);
    } finally {
      setSavingSheet(false);
    }
  };

  return (
    <div className="page">
      <PageHeader icon={DuoSheet} back={{ to: '/reports', label: 'Reports' }} title="Generate report" />

      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : i === step ? 'on' : ''}>
            <button type="button" disabled={i > step} onClick={() => i < step && setStep(i)}>
              <span className="ws-dot">{i < step ? <IconTick size={13} strokeWidth={2.6} /> : i + 1}</span>
              <span className="ws-text">
                <small>Step {i + 1}</small>
                <strong>{label}</strong>
                {i === 0 && customer && <em>{customer.customer.name}</em>}
                {i === 1 && sheet && <em>{sheet.referenceNo}</em>}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {error && <div className="alert">{error}</div>}

      {step === 0 && (
        <section className="card">
          <h2>Select customer</h2>
          <div className="search wizard-search">
            <IconSearch size={17} />
            <input autoFocus type="search" aria-label="Search customers" placeholder="Search name, phone, district, bank…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!found ? <div className="skeleton" style={{ height: 180 }} /> : found.length === 0 ? (
            <p className="muted">No customers found.</p>
          ) : (
            <ul className="pick-list">
              {found.map((c) => (
                <li key={c._id}>
                  <button type="button" className="pick" onClick={() => pickCustomer(c._id)}>
                    <span className="avatar soft sm">{initials(c.name)}</span>
                    <span className="pick-main"><strong>{c.name}</strong><small>{[c.phone1, c.district].filter(Boolean).join(' · ')}</small></span>
                    <span className="pick-side muted small">{c.stats.approved} approved sheet{c.stats.approved === 1 ? '' : 's'}</span>
                    <IconChevron size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === 1 && customer && (
        <section className="card">
          <h2>Select an input sheet of {customer.customer.name}</h2>
          {sheets.length === 0 ? (
            <p className="muted">This customer has no input sheets yet. Start one from their customer page.</p>
          ) : (
            <>
              {approvedCount === 0 && <p className="hint wizard-hint">None of their sheets has been submitted yet. A report can be generated once the evaluator submits the sheet.</p>}
              <ul className="pick-list">
                {sheets.map((v) => {
                  const ok = READY.includes(v.status);
                  return (
                    <li key={v._id}>
                      <button type="button" className={`pick${sheetId === v._id ? ' on' : ''}`} disabled={!ok} onClick={() => { setSheetId(v._id); setStep(2); }}>
                        <span className="pick-icon"><SectionIcon section={{ key: 'property' }} size={16} /></span>
                        <span className="pick-main">
                          <strong>{v.referenceNo} · {REPORT_TEMPLATES[v.summary?.reportTemplate]?.title || 'Input sheet'}</strong>
                          <small>{labels[v._id]} · {new Date(v.summary?.valuationDate || v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{reportsPerSheet[v._id] ? ` · ${reportsPerSheet[v._id]} report${reportsPerSheet[v._id] === 1 ? '' : 's'} generated` : ''}</small>
                          {!ok && <small className="pick-why">{v.status === 'rejected' ? 'Sent back to the evaluator: wait for them to resubmit' : 'Not submitted by the evaluator yet'}</small>}
                        </span>
                        <span className="pick-side">
                          <strong className="amount">{v.summary?.fairMarketValue > 0 ? inr(v.summary.fairMarketValue) : '—'}</strong>
                          <StatusBadge status={v.status} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {step === 2 && sheet && (
        <section className="card">
          <h2>Select report type</h2>
          <div className="type-grid" role="radiogroup" aria-label="Report type">
            {types.map((t) => (
              <label key={t.key} className={`type-card${type === t.key ? ' on' : ''}`}>
                <input type="radio" name="type" checked={type === t.key} onChange={() => setType(t.key)} />
                <span className="type-icon"><DuoSheet size={20} /></span>
                <strong>{t.title}</strong>
                <small>{t.description}</small>
                {t.key === 'bank' && <span className="badge">{sheet.summary?.reportTemplate} · {REPORT_TEMPLATES[sheet.summary?.reportTemplate]?.title}</span>}
              </label>
            ))}
          </div>
          <div className="actions type-actions">
            <button type="button" className="btn" onClick={() => setStep(1)}>‹ Back</button>
            <button type="button" className="btn primary" disabled={!type} onClick={() => setStep(3)}>Next ›</button>
          </div>
        </section>
      )}

      {step === 3 && sheet && (
        <div className="gen-full" role="dialog" aria-modal="true" aria-label="Review and generate the report">
          <header className="gen-full-bar">
            <button type="button" className="btn gen-back" onClick={() => setStep(2)} aria-label="Back to report type">‹<span className="gen-back-label"> Back</span></button>
            <div className="gen-full-title">
              <strong>Review & generate</strong>
              <small className="muted">{types.find((t) => t.key === type)?.title} · {sheet.referenceNo} · {customer.customer.name}</small>
            </div>
            <span className="gen-note">
              {editingSheet && sheetDirty ? <span className="gen-warn">Save or discard your sheet changes first</span>
                : reportDirty ? <span className="gen-warn">Save or reset your report edits first</span>
                : reportsPerSheet[sheet._id] > 0 ? <span className="muted">Creates version {reportsPerSheet[sheet._id] + 1} · earlier versions are kept</span>
                : null}
            </span>
            <button type="button" className="btn primary" disabled={!type || busy || reportDirty || (editingSheet && sheetDirty) || !full} onClick={generate}>{busy ? 'Generating…' : 'Generate'}</button>
          </header>
          <div className="gen-tabs" role="tablist" aria-label="Review">
            <button type="button" role="tab" aria-selected={pane === 'report'} className={pane === 'report' ? 'on' : ''} onClick={() => setPane('report')}>
              Report{reportDirty && <span className="gen-tab-dot" title="Unsaved wording edits" />}
            </button>
            <button type="button" role="tab" aria-selected={pane === 'sheet'} className={pane === 'sheet' ? 'on' : ''} onClick={() => setPane('sheet')}>
              Input sheet{editingSheet && <span className="gen-tab-badge">{sheetDirty ? 'Unsaved' : 'Editing'}</span>}
            </button>
          </div>
          <div className="gen-full-body">
          <div className={`gen-preview show-${pane}`}>
            <section className="gen-pane gen-sheet" aria-label="Input sheet">
              <div className="gen-pane-head">
                <span className="gen-pane-title"><strong>Input sheet</strong><span className="muted small">{sheet.referenceNo}</span></span>
                {full && (editingSheet ? (
                  <span className="gen-pane-actions">
                    <button type="button" className="btn small ghost" onClick={discardSheet} disabled={savingSheet}>Discard</button>
                    <button type="button" className="btn small primary" onClick={saveSheet} disabled={savingSheet || !sheetDirty}>{savingSheet ? 'Saving…' : 'Save'}</button>
                  </span>
                ) : (
                  <button type="button" className="btn small" onClick={startEditSheet}>Edit</button>
                ))}
              </div>
              <div className="gen-pane-body">
                {sheetNotice && <div className={`alert ${sheetErrors.length ? '' : 'success'} gen-sheet-notice`}>{sheetNotice}</div>}
                {editingSheet && showSheetErrors && Object.keys(sheetErrorMap).length > 0 && (
                  <div className="alert gen-sheet-notice">Please complete {Object.keys(sheetErrorMap).length} required / invalid field{Object.keys(sheetErrorMap).length === 1 ? '' : 's'} before saving.</div>
                )}
                {!full ? (previewError ? <div className="alert">{previewError}</div> : <div className="skeleton" style={{ height: 320 }} />)
                  : editingSheet && draft ? <SheetEditor data={draft} onChange={setSheetField} errors={sheetErrorMap} />
                  : <SheetSections data={full.data} variant="accordion" openFirst />}
              </div>
            </section>
            <section className="gen-pane gen-report" aria-label="Report">
              <div className="gen-pane-body">
                {previewDoc ? (
                  <ReportViewer
                    key={full._id}
                    doc={previewDoc}
                    overrides={full.reportOverrides || {}}
                    embedded
                    heading={<span className="re-heading"><strong>Report</strong>{editingSheet && <span className="re-live">Live preview</span>}</span>}
                    onDirtyChange={setReportDirty}
                    onSave={async (draft) => {
                      const res = await api.saveReportOverrides(full._id, draft);
                      setFull((f) => ({ ...f, reportOverrides: res.reportOverrides }));
                      return { overrides: res.reportOverrides };
                    }}
                  />
                ) : previewError ? null : <div className="skeleton" style={{ height: 480 }} />}
              </div>
            </section>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
