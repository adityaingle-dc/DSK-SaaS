import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { ReportCtx } from './Field.jsx';
import { buildContext, sheetsFor } from './sheets.jsx';
import Pages from './Pages.jsx';
import BackLink from '../components/BackLink.jsx';
import './report.css';
import { confirmDialog } from '../components/ConfirmDialog.jsx';
import { IconPencil, IconTick } from '../components/Icons.jsx';

// Renders a bank report (A4 sheets) with fit-to-screen preview, superadmin wording edits and printing.
// Used for the live preview of a valuation and for stored reports in the Reports module.
//   doc       – { referenceNo, status, data, results } (a valuation, or a stored report's frozen copy)
//   overrides – saved wording edits; onSave(draft) must resolve to { overrides, editedAt, editedBy }
// primaryAction (optional): the main button at the top right instead of Print / Save PDF (e.g. Generate report)
export default function ReportViewer({ doc, overrides: savedProp, onSave, back, title, meta, badge, edited, docTitle, banner, previewOnly = false, embedded = false, onDirtyChange, heading, primaryAction }) {
  const { isSuperadmin } = useAuth();
  const [saved, setSaved] = useState(savedProp || {});
  const [draft, setDraft] = useState(savedProp || {});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [editedInfo, setEditedInfo] = useState(edited || '');
  const [error, setError] = useState('');
  const pageRef = useRef(null);
  const docRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [docHeight, setDocHeight] = useState(0);
  const [pages, setPages] = useState(0);
  // undo / redo: snapshots of the edits, taken just before each change
  const past = useRef([]);
  const future = useRef([]);
  const [, setHist] = useState(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const record = useCallback(() => {
    const snap = JSON.stringify(draftRef.current);
    if (past.current[past.current.length - 1] !== snap) past.current = [...past.current.slice(-99), snap];
    future.current = [];
    setHist((n) => n + 1);
  }, []);
  const undo = useCallback(() => {
    document.activeElement?.blur?.(); // finish the edit being typed first
    setTimeout(() => {
      const cur = JSON.stringify(draftRef.current);
      while (past.current.length && past.current[past.current.length - 1] === cur) past.current.pop();
      if (!past.current.length) return;
      future.current.push(cur);
      setDraft(JSON.parse(past.current.pop()));
      setHist((n) => n + 1);
    }, 0);
  }, []);
  const redo = useCallback(() => {
    if (!future.current.length) return;
    past.current.push(JSON.stringify(draftRef.current));
    setDraft(JSON.parse(future.current.pop()));
    setHist((n) => n + 1);
  }, []);

  // fit the 210mm pages to narrow screens by scaling them down (a transform: the text still wraps exactly as
  // it does at full A4 size, so the page breaks seen here are the ones that print). Printing always uses 100%.
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

  // the scaled document takes the space of its scaled height; also keeps the page count for the toolbar
  useLayoutEffect(() => {
    const el = docRef.current;
    if (!el) return undefined;
    const update = () => {
      setDocHeight(el.offsetHeight);
      setPages(el.querySelectorAll('.sheet').length);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
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
    beginEdit: record,
    set: (k, value) => setDraft((d) => {
      const next = { ...d };
      if (value === undefined) delete next[k];
      else next[k] = value;
      return next;
    }),
  }), [draft, saved, editing, isSuperadmin, record]);

  const readOnlyCtx = useMemo(() => ({ overrides: saved, editing: false, set: () => {} }), [saved]);

  if (!doc?.results?.summary) return <div className="alert">This input sheet has no calculated results yet.</div>;
  const c = buildContext(doc);
  const sheets = sheetsFor(c);

  const doc_ = (provider, editingCls = '') => (
    <div className="sheets-fit" style={zoom < 1 && docHeight ? { height: Math.ceil(docHeight * zoom) } : undefined}>
      <ReportCtx.Provider value={provider}>
        <div
          ref={docRef}
          className={`sheets${editingCls}`}
          style={zoom < 1 ? { transform: `scale(${zoom})`, width: `${100 / zoom}%` } : undefined}
        >
          <Pages sheets={sheets} c={c} />
        </div>
      </ReportCtx.Provider>
    </div>
  );

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
    if (await confirmDialog({ title: 'Reset all report edits?', message: 'All wording and figure edits on this report will be discarded and the calculated values used again. You can undo this.', confirmLabel: 'Reset edits', cancelLabel: 'Keep edits', tone: 'danger' })) { record(); setDraft({}); }
  };
  // print once photos, maps and document pages have loaded (otherwise they print as "Loading…" or blank)
  const [printing, setPrinting] = useState(false);
  const print = async () => {
    setEditing(false);
    setPrinting(true);
    await new Promise((r) => setTimeout(r, 60));
    const root = docRef.current;
    const deadline = Date.now() + 8000;
    while (root && Date.now() < deadline) {
      const imgs = [...root.querySelectorAll('img')];
      const waiting = root.querySelector('.photo-loading') || imgs.some((img) => !img.complete);
      if (!waiting) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    await document.fonts?.ready;
    setPrinting(false);
    window.print();
  };
  const canUndo = past.current.some((s) => s !== JSON.stringify(draft));
  const canRedo = future.current.length > 0;
  // insert a bullet at the cursor in the text being edited
  const insertBullet = () => document.execCommand('insertText', false, '\n• ');

  // keyboard: Ctrl+Z undo, Ctrl+Y / Ctrl+Shift+Z redo (while not typing inside a text), Ctrl+S save
  useEffect(() => {
    if (!isSuperadmin || !onSave) return undefined;
    const onKey = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const typing = e.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
      const key = e.key.toLowerCase();
      if (key === 's') { e.preventDefault(); if (dirty && !saving) save(); return; }
      if (typing) return; // the browser undoes typing inside the text itself
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const historyButtons = (cls = 'btn small ghost') => (
    <>
      <button type="button" className={`${cls} re-undo`} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">↶ Undo</button>
      <button type="button" className={`${cls} re-redo`} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">↷ Redo</button>
    </>
  );

  // read-only preview (e.g. Reports → Generate, step 3): just the sheets, scaled to the container
  if (previewOnly) {
    return (
      <div className="report-page report-preview" ref={pageRef}>
        {doc_(readOnlyCtx)}
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
            {editing && <button type="button" className="btn small ghost re-bullet" onMouseDown={(e) => e.preventDefault()} onClick={insertBullet} title="Insert a bullet point in the text being edited">• Bullet</button>}
            {editing && historyButtons()}
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
            {editing && (
              <>
                <button type="button" className="re-fab-pill ghost" onClick={undo} disabled={!canUndo} aria-label="Undo">↶</button>
                <button type="button" className="re-fab-pill ghost" onClick={redo} disabled={!canRedo} aria-label="Redo">↷</button>
              </>
            )}
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
            <span className="re-hint-desk">Click any text to change it (Enter finishes a line, Esc cancels). Start a line with “-” for a bullet point. “Add here” at the end of each section adds paragraphs, points or a page break. Ctrl+Z undoes, Ctrl+S saves.</span>
          </div>
        )}
        {error && <div className="alert">{error}</div>}
        {/* phones: only this part scrolls; the toolbar above stays put */}
        <div className="re-scroll">
          {doc_(ctx, ctx.editing ? ' is-editing' : '')}
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
              {editing && <button className="btn ghost" onMouseDown={(e) => e.preventDefault()} onClick={insertBullet} title="Insert a bullet point in the text being edited">• Bullet</button>}
              {editing && historyButtons('btn ghost')}
              {editedCount > 0 && <span className="badge">{editedCount} edited</span>}
              {editedCount > 0 && <button className="btn ghost" onClick={resetAll}>Reset all</button>}
              <button className="btn" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : dirty ? 'Save edits' : 'Saved'}</button>
            </>
          )}
          {primaryAction !== undefined ? primaryAction : <button className="btn primary rt-print" onClick={print} disabled={printing}>{printing ? 'Preparing…' : 'Print / Save PDF'}</button>}
        </div>
      </div>

      {isSuperadmin && editing && (
        <div className="edit-hint no-print">
          Click any text to change it (Enter finishes a line, Esc cancels); edited text is highlighted, hover to see the original. Start a line with “-” for a bullet point. “Add here” at the end of each section adds paragraphs, bullet / numbered points or a page break. Ctrl+Z undoes, Ctrl+Y redoes, Ctrl+S saves. Edits change this report only.
        </div>
      )}
      {banner}
      {error && <div className="alert no-print">{error}</div>}
      <p className="fit-note no-print">
        {pages ? `${pages} A4 pages · ` : ''}Long sections continue on a new page automatically, as they will print.
        {zoom < 1 && ` Shown at ${Math.round(zoom * 100)}% to fit your screen${editing ? '; editing is easier on a larger screen' : ''}. Printing uses full A4 size.`}
      </p>

      {doc_(ctx, ctx.editing ? ' is-editing' : '')}
    </div>
  );
}
