import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { ReportCtx } from './Field.jsx';
import { Sheet, buildContext, sheetsFor } from './sheets.jsx';
import BackLink from '../components/BackLink.jsx';
import './report.css';

// Renders a bank report (A4 sheets) with fit-to-screen preview, superadmin wording edits and printing.
// Used for the live preview of a valuation and for stored reports in the Reports module.
//   doc       – { referenceNo, status, data, results } (a valuation, or a stored report's frozen copy)
//   overrides – saved wording edits; onSave(draft) must resolve to { overrides, editedAt, editedBy }
export default function ReportViewer({ doc, overrides: savedProp, onSave, back, title, meta, badge, edited, docTitle, banner }) {
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
  const resetAll = () => { if (confirm('Discard all edits on this report and go back to the calculated values?')) setDraft({}); };
  const print = () => { setEditing(false); setTimeout(() => window.print(), 50); };

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
