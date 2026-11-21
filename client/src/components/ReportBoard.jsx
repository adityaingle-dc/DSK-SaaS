// Reports board: Drafting (with a drafter, not generated yet) · Awaiting approval · Sent back · Approved.
// The superadmin approves a report (final: locked) or sends it back to the drafter with a note by moving its card.
// Drafting cards open the drafting screen. Drag on desktop, "Move" on phones.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { inr } from './StatusBadge.jsx';
import { initials } from './Layout.jsx';
import Modal from './Modal.jsx';
import { alertDialog, confirmDialog, promptDialog } from './ConfirmDialog.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { timeAgo } from '../utils/format.js';
import { reportHref } from '../pages/Reports.jsx';

export const REPORT_COLUMNS = [
  { key: 'draft', title: 'Drafting', hint: 'With a drafter, not generated yet', tone: 'slate' },
  { key: 'review', title: 'Awaiting approval', hint: 'Waiting for the superadmin', tone: 'amber' },
  { key: 'approved', title: 'Approved', hint: 'Final', tone: 'green', action: 'Approve (final)' },
  { key: 'returned', title: 'Back to drafter', hint: 'Sent back; a new version follows', tone: 'red', action: 'Send back to the drafter' },
];
const DAY = 24 * 3600 * 1000;

export const approveDialog = (r) => ({
  title: `Approve ${r.reportNo} (v${r.version})?`,
  message: 'The report becomes final: it and its input sheet are locked and can no longer be changed.',
  confirmLabel: 'Approve',
});
// asks for the note; resolves to the note, or null when cancelled
export const sendBackDialog = (r) => ({
  title: `Send ${r.reportNo} back to the drafter?`,
  message: 'Say what to change. The drafter fixes the sheet or the wording and generates a new version.',
  placeholder: 'e.g. Market rate looks high, re-check it',
  confirmLabel: 'Send back',
  required: true,
});

export default function ReportBoard({ query, reloadKey = 0 }) {
  const { isSuperadmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState('');
  const [busy, setBusy] = useState('');
  const [moving, setMoving] = useState(null);
  const [tab, setTab] = useState('review');
  const qKey = JSON.stringify(query);

  useEffect(() => {
    let live = true;
    api.reportBoard(query)
      .then((d) => { if (live) { setData(d); setError(''); } })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey, reload, reloadKey]);

  useEffect(() => {
    if (!data || data.columns[tab]?.total) return;
    const first = ['review', 'draft', 'returned', 'approved'].find((k) => data.columns[k]?.total);
    if (first) setTab(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const move = async (r, to) => {
    let note;
    if (to === 'approved') { if (!(await confirmDialog(approveDialog(r)))) return; }
    else { note = await promptDialog(sendBackDialog(r)); if (note == null) return; }
    setBusy(r._id);
    try {
      await api.setReportStatus(r._id, to, note);
      setReload((n) => n + 1);
    } catch (e) {
      alertDialog({ title: "Couldn't move the report", message: e.message });
    } finally {
      setBusy('');
    }
  };

  if (error) return <div className="alert">{error}</div>;
  if (!data) return <div className="kb kb-2">{REPORT_COLUMNS.map((c) => <div key={c.key} className="kb-col"><div className="skeleton" style={{ height: 220 }} /></div>)}</div>;

  return (
    <>
      <div className="kb-tabs" role="tablist" aria-label="Board columns">
        {REPORT_COLUMNS.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={tab === c.key} className={`kb-tab${tab === c.key ? ' on' : ''}`} onClick={() => setTab(c.key)}>
            {c.title}<span className="kb-tab-n">{data.columns[c.key]?.total || 0}</span>
          </button>
        ))}
      </div>
      <div className={`kb kb-2${drag ? ' is-dragging' : ''}`}>
        {REPORT_COLUMNS.map((c) => {
          const col = data.columns[c.key] || { items: [], total: 0 };
          // only a report awaiting approval moves: to Approved or Sent back
          const target = drag && drag.col === 'review' && ['approved', 'returned'].includes(c.key);
          return (
            <section
              key={c.key}
              className={`kb-col tone-${c.tone}${tab === c.key ? ' kb-current' : ''}${target ? ' kb-can-drop' : ''}${over === c.key && target ? ' kb-over' : ''}`}
              aria-label={c.title}
              onDragOver={(e) => { if (target) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(c.key); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(''); }}
              onDrop={(e) => { e.preventDefault(); const d = drag; setDrag(null); setOver(''); if (d && target) move(d.r, c.key); }}
            >
              <header className="kb-col-head">
                <span className="kb-dot" aria-hidden="true" />
                <strong>{c.title}</strong>
                <span className="kb-count">{col.total}</span>
                <small className="kb-hint">{target ? `Drop to ${c.action.toLowerCase()}` : c.hint}</small>
              </header>
              <div className="kb-cards">
                {col.items.length === 0 && <p className="kb-empty">{c.key === 'draft' ? 'Nothing being drafted' : c.key === 'review' ? 'No reports waiting for approval' : c.key === 'returned' ? 'Nothing sent back' : 'No approved reports yet'}</p>}
                {col.items.map((r) => {
                  const draft = c.key === 'draft';
                  const since = new Date(draft ? r.editedAt : c.key === 'approved' ? r.approvedAt || r.createdAt : c.key === 'returned' ? r.returnedAt || r.createdAt : r.createdAt);
                  const waiting = (draft || c.key === 'review') && Date.now() - since > 2 * DAY;
                  const who = draft ? (r.drafter?.name ? `Drafter ${r.drafter.name}` : 'In the queue')
                    : c.key === 'approved' ? (r.approvedBy?.name ? `Approved by ${r.approvedBy.name}` : 'Approved')
                      : r.generatedBy?.name ? `Generated by ${r.generatedBy.name}` : '';
                  const canMove = isSuperadmin && c.key === 'review';
                  return (
                    <article
                      key={r._id}
                      className={`kb-card${busy === r._id ? ' busy' : ''}${drag?.r?._id === r._id ? ' dragging' : ''}`}
                      draggable={!busy && canMove}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r._id); setDrag({ r, col: c.key }); }}
                      onDragEnd={() => { setDrag(null); setOver(''); }}
                    >
                      <Link to={reportHref(r)} className="kb-card-link" draggable={false}>
                        <span className="kb-card-top">
                          <span className="avatar soft sm">{initials(r.customer?.name || r.applicantName)}</span>
                          <span className="kb-card-name">
                            <strong>{r.customer?.name || r.applicantName || 'Unnamed'}</strong>
                            <small className="muted">{draft ? `Next: v${r.version}` : `${r.reportNo} · v${r.version}`}{r.reportTemplate ? ` · ${r.reportTemplate}` : ''}</small>
                          </span>
                        </span>
                        {r.snapshot?.referenceNo && <span className="kb-card-line">Sheet {r.snapshot.referenceNo}</span>}
                        <span className="kb-card-foot">
                          <strong className="kb-value">{r.fairMarketValue > 0 ? inr(r.fairMarketValue) : '—'}</strong>
                          <span className={`kb-age${waiting ? ' late' : ''}`} title={since.toLocaleString('en-IN')}>{waiting ? `Waiting ${timeAgo(since).replace(/ ago$/, '')}` : timeAgo(since)}</span>
                        </span>
                        {who && <span className="kb-card-who">{who}</span>}
                      </Link>
                      {draft
                        ? <Link className="kb-move" to={reportHref(r)} aria-label={`Open the drafting of ${r.snapshot?.referenceNo}`}>Open ›</Link>
                        : canMove && <button type="button" className="kb-move" onClick={() => setMoving({ r, col: c.key })} disabled={!!busy} aria-label={`Approve or send back ${r.reportNo}`}>Decide ›</button>}
                    </article>
                  );
                })}
                {col.total > col.items.length && <p className="kb-more">Showing the latest {col.items.length} of {col.total}. Search or switch to List to see the rest.</p>}
              </div>
            </section>
          );
        })}
      </div>

      {moving && (
        <Modal title={`Move ${moving.r.reportNo}`} onClose={() => setMoving(null)} className="kb-move-modal">
          <p className="muted small kb-move-from">Now in <strong>{REPORT_COLUMNS.find((c) => c.key === moving.col).title}</strong></p>
          <div className="kb-move-list">
            {REPORT_COLUMNS.filter((c) => ['approved', 'returned'].includes(c.key)).map((c) => (
              <button key={c.key} type="button" className="kb-move-opt" onClick={() => { const m = moving; setMoving(null); move(m.r, c.key); }}>
                <span className={`kb-dot tone-${c.tone}`} aria-hidden="true" />
                <span><strong>{c.title}</strong><small className="muted">{c.action}</small></span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
