import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { ReportCtx } from './Field.jsx';
import { Sheet, buildContext, sheetsFor } from './sheets.jsx';
import BackLink from '../components/BackLink.jsx';
import './report.css';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { IconPencil, IconTick } from '../components/Icons.jsx';

// Renders a bank report (A4 sheets) with fit-to-screen preview, superadmin wording edits and printing.
// Used for the live preview of a valuation and for stored reports in the Reports module.
//   doc       – { referenceNo, status, data, results } (a valuation, or a stored report's frozen copy)
//   overrides – saved wording edits; onSave(draft) must resolve to { overrides, editedAt, editedBy }
export default function ReportViewer({ doc, overrides: savedProp, onSave, back, title, meta, badge, edited, docTitle, banner, previewOnly = false, embedded = false, onDirtyChange, heading }) {
  const { isSuperadmin } = useAuth();
  const [saved, setSaved] = useState(savedProp || {});
  const [draft, setDraft] = useState(savedProp || {});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [editedInfo, setEditedInfo] = useState(edited || '');
  const [error, setError] = useState('');
  const pageRef = useRef(null);
  const [zoom, setZoom] = useState(1);

  // fit the 210mm sheets to narrow screens; printing always uses 100%
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return undefined;
    const probe = Object.assign(document.createElement('div'), { style: 'position:absolute;visibility:hidden;width:210mm' });
    document.body.appendChild(probe);
    const sheetPx = probe.getBoundingClientRect().width;
    probe.remove();
    const fit = () => setZoom(Math.min(1, Math.max(0.3, Math.floor((el.clientWidth / sheetPx) * 100) / 100)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // flag sheets taller than one A4 page so they can be trimmed before printing
  useEffect(() => {
    const t = setTimeout(() => {
      const probe = Object.assign(document.createElement('div'), { style: 'position:absolute;visibility:hidden;height:297mm' });
      document.body.appendChild(probe);
      const a4 = probe.getBoundingClientRect().height;
      probe.remove();
      document.querySelectorAll('.sheet').forEach((el) => {
        if (el.getBoundingClientRect().height / zoom > a4 * 1.01) el.setAttribute('data-overflow', '');
        else el.removeAttribute('data-overflow');
      });
    }, 300);
    return () => clearTimeout(t);
  });

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const editedCount = Object.keys(draft).length;

  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const warn = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // the document title becomes the default file name in "Save as PDF"
  useEffect(() => {
    const prev = document.title;
    if (docTitle) document.title = docTitle;
    return () => { document.title = prev; };
  }, [docTitle]);

  const ctx = useMemo(() => ({
    overrides: isSuperadmin ? draft : saved,
    editing: isSuperadmin && editing,
    set: (k, value) => setDraft((d) => {
      const next = { ...d };
      if (value === undefined) delete next[k];
      else next[k] = value;
      return next;
    }),
  }), [draft, saved, editing, isSuperadmin]);

  if (!doc?.results?.summary) return <div className="alert">This input sheet has no calculated results yet.</div>;
  const c = buildContext(doc);
  const sheets = sheetsFor(c);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await onSave(draft);
      setSaved(res.overrides);
      setDraft(res.overrides);
      setEditedInfo(res.editedText || '');
      setNotice('Report edits saved');
      setTimeout(() => setNotice(''), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const resetAll = async () => {
    if (await confirmDialog({ title: 'Reset all report edits?', message: 'All wording and figure edits on this report will be discarded and the calculated values used again.', confirmLabel: 'Reset edits', cancelLabel: 'Keep edits', tone: 'danger' })) setDraft({});
  };
  const print = () => { setEditing(false); setTimeout(() => window.print(), 50); };

  // read-only preview (e.g. Reports → Generate, step 3): just the sheets, scaled to the container
  if (previewOnly) {
    return (
      <div className="report-page report-preview" ref={pageRef}>
        <ReportCtx.Provider value={{ overrides: saved, editing: false, set: () => {} }}>
          <div className="sheets" style={{ zoom }}>
            {sheets.map((s, i) => (
              <Sheet key={s.id} n={i + 1} total={sheets.length} c={c} letterhead={s.letterhead}>{s.el}</Sheet>
            ))}
          </div>
        </ReportCtx.Provider>
      </div>
    );
  }

  // embedded (Reports → Generate, step 4): wording edits + save, nothing else
  if (embedded) {
    return (
      <div className="report-page report-preview report-embedded" ref={pageRef}>
        {(heading || (isSuperadmin && onSave)) && (
          <div className="re-toolbar">
            {heading}
            {isSuperadmin && onSave && (<>
            <button
              type="button"
              className={`btn small re-edit${editing ? ' on' : ''}`}
              aria-pressed={editing}
              onClick={() => setEditing(!editing)}
            >
              {editing ? <><IconTick size={15} /> Done</> : <><IconPencil size={15} /> Edit wording</>}
            </button>
            {editedCount > 0 && !editing && <span className="badge re-count">{editedCount} edited</span>}
            <span className="spacer" />
            {notice && <span className="rt-notice">{notice}</span>}
            {editing && editedCount > 0 && <button type="button" className="btn small ghost re-reset" onClick={resetAll}>Reset</button>}
            {(dirty || (editing && editedCount > 0)) && (
              <button type="button" className={`btn small re-save${dirty ? ' primary' : ''}`} disabled={!dirty || saving} onClick={save}>
                {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
              </button>
            )}
            </>)}
          </div>
        )}
        {/* phones / tablets: a floating pencil instead of the toolbar */}
        {isSuperadmin && onSave && (
          <div className={`re-fab-group${editing ? ' editing' : ''}`}>
            {notice && <span className="re-fab-notice" role="status">{notice}</span>}
            {editing && editedCount > 0 && (
              <button type="button" className="re-fab-pill ghost" onClick={resetAll}>Reset</button>
            )}
            {(dirty || (editing && editedCount > 0)) && (
              <button type="button" className={`re-fab-pill${dirty ? ' primary' : ''}`} disabled={!dirty || saving} onClick={save}>
                {saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}
              </button>
            )}
            <button
              type="button"
              className={`re-fab${editing ? ' on' : ''}`}
              aria-pressed={editing}
              aria-label={editing ? 'Done editing the wording' : 'Edit the report wording'}
              title={editing ? 'Done' : 'Edit wording'}
              onClick={() => setEditing(!editing)}
            >
              {editing ? <IconTick size={24} /> : <IconPencil size={22} />}
              {!editing && editedCount > 0 && <span className="re-fab-count">{editedCount}</span>}
            </button>
          </div>
        )}
        {editing && (
          <div className="edit-hint re-hint">
            <span className="re-hint-touch">Tap any text on the report to change it. Your edits go into the stored report when you save.</span>
            <span className="re-hint-desk">Click any text on the report to change it. Enter finishes a line, Esc cancels. Saved edits are copied into the stored report.</span>
          </div>
        )}
        {error && <div className="alert">{error}</div>}
        {/* phones: only this part scrolls; the toolbar above stays put */}
        <div className="re-scroll">
          <ReportCtx.Provider value={ctx}>
            <div className={`sheets${ctx.editing ? ' is-editing' : ''}`} style={{ zoom }}>
              {sheets.map((s, i) => (
                <Sheet key={s.id} n={i + 1} total={sheets.length} c={c} letterhead={s.letterhead}>{s.el}</Sheet>
              ))}
            </div>
          </ReportCtx.Provider>
        </div>
      </div>
    );
  }

  return (
    <div className="report-page" ref={pageRef}>
      <div className="report-toolbar no-print">
        <div className="rt-left">
          {back && <BackLink to={back.to} label={back.label} className="link-sm" />}
          <div className="rt-title">
            <strong>{title}</strong>
            {meta && <span className="rt-meta muted">{meta}</span>}
            {badge}
          </div>
          {editedInfo && <small className="muted">{editedInfo}</small>}
        </div>
        <div className="rt-actions">
          {notice && <span className="rt-notice">{notice}</span>}
          {isSuperadmin && onSave && (
            <>
              <label className={`switch${editing ? ' on' : ''}`}>
                <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} />
                <span className="switch-track"><span /></span>
                Edit mode
              </label>
              {editedCount > 0 && <span className="badge">{editedCount} edited</span>}
              {editedCount > 0 && <button className="btn ghost" onClick={resetAll}>Reset all</button>}
              <button className="btn" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save edits' : 'Saved'}</button>
            </>
          )}
          <button className="btn primary rt-print" onClick={print}>Print / Save PDF</button>
        </div>
      </div>

      {isSuperadmin && editing && (
        <div className="edit-hint no-print">
          Click any text on the report to change it. Press Enter to finish a line, Esc to cancel. Edited text is highlighted; hover to see the original. Edits change this report only. The input sheet and calculations stay as they are.
        </div>
      )}
      {banner}
      {error && <div className="alert no-print">{error}</div>}
      {zoom < 1 && (
        <p className="fit-note no-print">
          Preview scaled to {Math.round(zoom * 100)}% to fit your screen{editing ? '. Editing is easier on a larger screen' : ''}. Printing uses full A4 size.
        </p>
      )}

      <ReportCtx.Provider value={ctx}>
        <div className={`sheets${ctx.editing ? ' is-editing' : ''}`} style={{ zoom }}>
          {sheets.map((s, i) => (
            <Sheet key={s.id} n={i + 1} total={sheets.length} c={c} letterhead={s.letterhead}>{s.el}</Sheet>
          ))}
        </div>
      </ReportCtx.Provider>
    </div>
  );
}
