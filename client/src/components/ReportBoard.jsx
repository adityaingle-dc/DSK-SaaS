// Reports board: Draft (edited, not generated) · In review (sent to the bank) · Approved (by the bank).
// The superadmin records the bank's decision by moving cards between In review and Approved; bank-approved reports
// have their wording locked. Draft cards open the Generate flow. Drag on desktop, "Move" on phones.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { inr } from './StatusBadge.jsx';
import { initials } from './Layout.jsx';
import Modal from './Modal.jsx';
import { alertDialog, confirmDialog } from './ConfirmDialog.jsx';
import { timeAgo } from '../utils/format.js';
import { reportHref } from '../pages/Reports.jsx';

export const REPORT_COLUMNS = [
  { key: 'draft', title: 'Draft', hint: 'Edited, not generated yet', tone: 'slate' },
  { key: 'review', title: 'In review', hint: 'Sent to the bank for review', tone: 'amber', action: 'Move back to in review' },
  { key: 'approved', title: 'Approved', hint: 'Approved by the bank', tone: 'green', action: 'Mark approved by bank' },
];
const DAY = 24 * 3600 * 1000;

export const bankApproveDialog = (r) => ({
  title: `Approved by the bank: ${r.reportNo}?`,
  message: 'Record that the bank approved this report. Its wording will be locked so it stays as the bank accepted it.',
  confirmLabel: 'Mark approved',
});
export const backToReviewDialog = (r) => ({
  title: `Move ${r.reportNo} back to in review?`,
  message: 'Use this if the bank has not approved it after all or asked for changes. The wording can be edited again.',
  confirmLabel: 'Move to in review',
});


export default function ReportBoard({ query, reloadKey = 0 }) {
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
    const first = ['review', 'draft', 'approved'].find((k) => data.columns[k]?.total);
    if (first) setTab(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const move = async (r, to) => {
    const approve = to === 'approved';
    const ok = await confirmDialog(approve ? bankApproveDialog(r) : backToReviewDialog(r));
    if (!ok) return;
    setBusy(r._id);
    try {
      await api.setReportStatus(r._id, to);
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
          const target = drag && drag.col !== c.key && c.key !== 'draft';
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
                {col.items.length === 0 && <p className="kb-empty">{c.key === 'draft' ? 'No unsaved report drafts' : c.key === 'review' ? 'Nothing with the bank' : 'No bank approvals recorded yet'}</p>}
                {col.items.map((r) => {
                  const draft = c.key === 'draft';
                  const since = new Date(draft ? r.editedAt : c.key === 'approved' ? r.approvedAt || r.createdAt : r.createdAt);
                  const waiting = (draft || c.key === 'review') && Date.now() - since > 2 * DAY;
                  const who = draft ? (r.editedBy?.name ? `Edited by ${r.editedBy.name}` : 'Edited')
                    : c.key === 'approved' ? (r.approvedBy?.name ? `Recorded by ${r.approvedBy.name}` : 'Approved by the bank')
                      : r.generatedBy?.name ? `Generated by ${r.generatedBy.name}` : '';
                  return (
                    <article
                      key={r._id}
                      className={`kb-card${busy === r._id ? ' busy' : ''}${drag?.r?._id === r._id ? ' dragging' : ''}`}
                      draggable={!busy && !draft}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r._id); setDrag({ r, col: c.key }); }}
                      onDragEnd={() => { setDrag(null); setOver(''); }}
                    >
                      <Link to={reportHref(r)} className="kb-card-link" draggable={false}>
                        <span className="kb-card-top">
                          <span className="avatar soft sm">{initials(r.customer?.name || r.applicantName)}</span>
                          <span className="kb-card-name">
                            <strong>{r.customer?.name || r.applicantName || 'Unnamed'}</strong>
                            <small className="muted">{draft ? `Not generated · v${r.version}` : `${r.reportNo} · v${r.version}`}{r.reportTemplate ? ` · ${r.reportTemplate}` : ''}</small>
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
                        ? <Link className="kb-move" to={reportHref(r)} aria-label={`Generate the report for ${r.snapshot?.referenceNo}`}>Generate ›</Link>
                        : <button type="button" className="kb-move" onClick={() => setMoving({ r, col: c.key })} disabled={!!busy} aria-label={`Move ${r.reportNo}`}>Move ›</button>}
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
            {REPORT_COLUMNS.filter((c) => c.key !== moving.col && c.key !== 'draft').map((c) => (
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
