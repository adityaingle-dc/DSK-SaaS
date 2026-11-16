import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { ReportCtx } from './Field.jsx';
import { Sheet, buildContext, sheetsFor } from './sheets.jsx';
import { dateTime } from '../utils/format.js';
import './report.css';

export default function ReportPage() {
  const { id } = useParams();
  const { isSuperadmin } = useAuth();
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({}); // overrides being edited (superadmin)
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  // preview zoom: A4 sheets (210mm) are scaled down to fit narrow screens; printing always uses 100%
  const pageRef = useRef(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    api.getValuation(id).then((x) => {
      setV(x);
      setDraft(x.reportOverrides || {});
    }).catch((e) => setError(e.message));
  }, [id]);

  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return undefined;
    const probe = Object.assign(document.createElement('div'), { style: 'position:absolute;visibility:hidden;width:210mm' });
    document.body.appendChild(probe);
    const sheetPx = probe.getBoundingClientRect().width;
    probe.remove();
    const fit = () => {
      const avail = el.clientWidth;
      setZoom(Math.min(1, Math.max(0.3, Math.floor((avail / sheetPx) * 100) / 100)));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [v]);

  // flag sheets taller than one A4 page so the superadmin can trim them before printing
  useEffect(() => {
    const t = setTimeout(() => {
      const probe = Object.assign(document.createElement('div'), { style: 'position:absolute;visibility:hidden;height:297mm' });
      document.body.appendChild(probe);
      const a4 = probe.getBoundingClientRect().height;
      probe.remove();
      document.querySelectorAll('.sheet').forEach((el) => {
        // measured size includes the preview zoom; compare at true A4 scale
        if (el.getBoundingClientRect().height / zoom > a4 * 1.01) el.setAttribute('data-overflow', '');
        else el.removeAttribute('data-overflow');
      });
    }, 300);
    return () => clearTimeout(t);
  });

  const saved = v?.reportOverrides || {};
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const editedCount = Object.keys(draft).length;

  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Document title becomes the default PDF file name in the browser's "Save as PDF"
  useEffect(() => {
    if (!v) return undefined;
    const prev = document.title;
    document.title = `${v.referenceNo} ${v.summary?.applicantName || ''} ${v.summary?.reportTemplate || ''}`.trim();
    return () => {
      document.title = prev;
    };
  }, [v]);

  const ctx = useMemo(
    () => ({
      overrides: isSuperadmin ? draft : saved,
      editing: isSuperadmin && editing,
      set: (k, value) =>
        setDraft((d) => {
          const next = { ...d };
          if (value === undefined) delete next[k];
          else next[k] = value;
          return next;
        }),
    }),
    [draft, saved, editing, isSuperadmin]
  );

  if (error) return <div className="alert">{error}</div>;
  if (!v) return <div className="center">Loading report…</div>;
  if (!v.results?.summary) return <div className="alert">This valuation has no computed results yet.</div>;

  const c = buildContext(v);
  const sheets = sheetsFor(c);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.saveReportOverrides(id, draft);
      setV((x) => ({ ...x, reportOverrides: res.reportOverrides, reportEditedAt: res.reportEditedAt, reportEditedBy: res.reportEditedBy }));
      setDraft(res.reportOverrides);
      setNotice('Report edits saved');
      setTimeout(() => setNotice(''), 2500);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const resetAll = () => {
    if (confirm('Discard all edits on this report and go back to the calculated values?')) setDraft({});
  };

  const print = () => {
    setEditing(false);
    setTimeout(() => window.print(), 50);
  };

  return (
    <div className="report-page" ref={pageRef}>
      <div className="report-toolbar no-print">
        <div className="rt-left">
          <Link to={`/valuations/${id}`} className="link-sm">‹ Back to valuation</Link>
          <div className="rt-title">
            <strong>{v.summary?.applicantName}</strong>
            <span className="rt-meta muted">{v.referenceNo} · {c.tpl.title}</span>
            <StatusBadge status={v.status} />
          </div>
          {v.reportEditedAt && <small className="muted">Last edited {dateTime(v.reportEditedAt)}{v.reportEditedBy?.name ? ` by ${v.reportEditedBy.name}` : ''}</small>}
        </div>
        <div className="rt-actions">
          {notice && <span className="rt-notice">{notice}</span>}
          {isSuperadmin && (
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
          Click any text on the report to change it. Press Enter to finish a line, Esc to cancel. Edited text is highlighted; hover to see the original. Edits change this report only. The valuation data and calculations stay as they are.
        </div>
      )}
      {v.status !== 'approved' && (
        <div className="edit-hint warn no-print">This valuation is <strong>{v.status}</strong>, so the report prints with a {v.status === 'rejected' ? 'REJECTED' : 'DRAFT'} watermark until it is approved.</div>
      )}
      {error && <div className="alert no-print">{error}</div>}
      {zoom < 1 && (
        <p className="fit-note no-print">
          Preview scaled to {Math.round(zoom * 100)}% to fit your screen{editing ? '. Editing is easier on a larger screen' : ''}. Printing uses full A4 size.
        </p>
      )}

      <ReportCtx.Provider value={ctx}>
        <div className={`sheets${ctx.editing ? ' is-editing' : ''}`} style={{ zoom }}>
          {sheets.map((s, i) => (
            <Sheet key={s.id} n={i + 1} total={sheets.length} c={c} letterhead={s.letterhead}>
              {s.el}
            </Sheet>
          ))}
        </div>
      </ReportCtx.Provider>
    </div>
  );
}
