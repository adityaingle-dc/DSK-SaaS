// Kanban board for Input Sheets: Drafts · In review · Received · Sent back · Completed.
// Received = the superadmin opened it; Completed = a report was generated from it (that locks it for the evaluator).
// Moving a card runs the same action as the buttons on the sheet (send back with a note, finish, submit), so the
// server's rules and the completeness check still apply. There is no approval step.
// Desktop: drag and drop. Phones: one column at a time (tabs) and a "Move" button on each card.
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import { inr } from './StatusBadge.jsx';
import { initials } from './Layout.jsx';
import Modal from './Modal.jsx';
import { alertDialog, confirmDialog, promptDialog } from './ConfirmDialog.jsx';
import { timeAgo } from '../utils/format.js';

// same names and order as the status tabs on the list view
export const BOARD_COLUMNS = [
  { key: 'draft', title: 'Drafts', hint: 'Being filled in by the evaluator', tone: 'blue' },
  { key: 'submitted', title: 'In review', hint: 'Submitted, not opened by the superadmin yet', tone: 'amber' },
  { key: 'received', title: 'Received', hint: 'Opened; generate the report', tone: 'blue' },
  { key: 'rejected', title: 'Sent back', hint: 'Returned with a note', tone: 'red' },
  { key: 'approved', title: 'Completed', hint: 'Report generated', tone: 'green' },
];
const TITLE = Object.fromEntries(BOARD_COLUMNS.map((c) => [c.key, c.title]));
const DAY = 24 * 3600 * 1000;

// which moves each role may make: from column → { to column: action }
function movesFor(role) {
  if (role === 'superadmin') {
    return {
      draft: { received: 'finish' },
      submitted: { rejected: 'return' },
      received: { rejected: 'return' },
      rejected: { received: 'finish' },
      approved: {},
    };
  }
  if (role === 'evaluator') {
    return {
      draft: { submitted: 'submit' },
      rejected: { submitted: 'submit' },
      submitted: {},
      received: {},
      approved: {},
    };
  }
  return {}; // legacy reviewers: view only
}
const ACTION_LABEL = { return: 'Send back with a note', finish: 'Finish (ready for a report)', submit: 'Submit to the superadmin' };

// when the card entered its column, for "waiting 3 days"
const enteredAt = (v, col) => new Date(
  col === 'draft' ? (v.startedAt ? v.updatedAt : v.assignedAt || v.createdAt)
    : col === 'submitted' ? v.submittedAt || v.updatedAt
      : col === 'received' ? v.receivedAt || v.updatedAt
        : col === 'rejected' ? v.reviewedAt || v.updatedAt
        : v.updatedAt,
);

export default function SheetBoard({ query, reloadKey = 0 }) {
  const { user, isReviewer } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [drag, setDrag] = useState(null); // { id, col }
  const [over, setOver] = useState('');
  const [busy, setBusy] = useState('');
  const [moving, setMoving] = useState(null); // { v, col } for the phone "Move" sheet
  const [tab, setTab] = useState('submitted');
  const moves = useMemo(() => movesFor(user?.role), [user?.role]);
  const qKey = JSON.stringify(query);

  useEffect(() => {
    let live = true;
    api.valuationBoard(query)
      .then((d) => {
        if (!live) return;
        const c = d.columns;
        const draftItems = [...(c.new?.items || []), ...(c.inProgress?.items || [])].sort((x, y) => new Date(y.updatedAt) - new Date(x.updatedAt));
        const columns = { ...c, draft: { items: draftItems, total: (c.new?.total || 0) + (c.inProgress?.total || 0) } };
        setData({ ...d, columns });
        setError('');
      })
      .catch((e) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qKey, reload, reloadKey]);

  // phones: open on the first column that has something, preferring the ones that need action
  useEffect(() => {
    if (!data) return;
    const cols = data.columns;
    if (cols[tab]?.total) return;
    const pref = isReviewer ? ['submitted', 'received', 'draft', 'rejected', 'approved'] : ['rejected', 'draft', 'submitted', 'received', 'approved'];
    const first = pref.find((k) => cols[k]?.total);
    if (first) setTab(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const run = async (v, from, to) => {
    const action = moves[from]?.[to];
    if (!action) return;
    const name = v.summary?.applicantName || v.referenceNo;
    try {
      if (action === 'return') {
        const note = await promptDialog({ title: `Send ${v.referenceNo} back?`, message: `Tell ${v.evaluator?.name || 'the evaluator'} what to fix. They will see this note on the sheet.`, placeholder: 'e.g. Guideline rate missing for the land section', confirmLabel: 'Send back', required: true });
        if (note == null) return;
        setBusy(v._id);
        await api.reviewValuation(v._id, 'rejected', note);
      } else {
        const finishing = action === 'finish';
        const ok = await confirmDialog({
          title: finishing ? `Finish ${v.referenceNo}?` : `Submit ${v.referenceNo}?`,
          message: finishing ? `${name}'s sheet will be marked ready for a report. It must be complete.` : 'The superadmin will see it. You can still make changes until the report is generated.',
          confirmLabel: finishing ? 'Finish' : 'Submit',
        });
        if (!ok) return;
        setBusy(v._id);
        const full = await api.getValuation(v._id);
        await api.updateValuation(v._id, { data: full.data, status: finishing ? 'received' : 'submitted' });
      }
      setReload((n) => n + 1);
    } catch (e) {
      const list = e.errors || [];
      if (list.length) {
        const open = await confirmDialog({
          title: 'The sheet is not complete yet',
          message: `${list.length} field${list.length === 1 ? '' : 's'} to fix first: ${list.slice(0, 4).map((x) => x.message).join('; ')}${list.length > 4 ? '…' : ''}`,
          confirmLabel: 'Open the sheet',
          cancelLabel: 'Not now',
        });
        if (open) navigate(`/valuations/${v._id}/edit`);
      } else {
        alertDialog({ title: "Couldn't move the sheet", message: e.message });
      }
    } finally {
      setBusy('');
    }
  };

  if (error) return <div className="alert">{error}</div>;
  if (!data) {
    return (
      <div className="kb">
        {BOARD_COLUMNS.map((c) => <div key={c.key} className="kb-col"><div className="skeleton" style={{ height: 220 }} /></div>)}
      </div>
    );
  }

  const allowedTargets = drag ? moves[drag.col] || {} : {};
  return (
    <>
      {/* phones: one column at a time */}
      <div className="kb-tabs" role="tablist" aria-label="Board columns">
        {BOARD_COLUMNS.map((c) => (
          <button key={c.key} type="button" role="tab" aria-selected={tab === c.key} className={`kb-tab tone-${c.tone}${tab === c.key ? ' on' : ''}`} onClick={() => setTab(c.key)}>
            {c.title}<span className="kb-tab-n">{data.columns[c.key]?.total || 0}</span>
          </button>
        ))}
      </div>

      <div className={`kb${drag ? ' is-dragging' : ''}`}>
        {BOARD_COLUMNS.map((c) => {
          const col = data.columns[c.key] || { items: [], total: 0 };
          const target = drag && drag.col !== c.key ? allowedTargets[c.key] : null;
          return (
            <section
              key={c.key}
              className={`kb-col tone-${c.tone}${tab === c.key ? ' kb-current' : ''}${drag && drag.col !== c.key ? (target ? ' kb-can-drop' : ' kb-no-drop') : ''}${over === c.key && target ? ' kb-over' : ''}`}
              aria-label={c.title}
              onDragOver={(e) => { if (target) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(c.key); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(''); }}
              onDrop={(e) => {
                e.preventDefault();
                const d = drag; setDrag(null); setOver('');
                if (d && target) run(col.items.find((x) => x._id === d.id) || d.v, d.col, c.key);
              }}
            >
              <header className="kb-col-head">
                <span className="kb-dot" aria-hidden="true" />
                <strong>{c.title}</strong>
                <span className="kb-count">{col.total}</span>
                <small className="kb-hint">{target ? `Drop to ${ACTION_LABEL[target].toLowerCase()}` : c.hint}</small>
              </header>
              <div className="kb-cards">
                {col.items.length === 0 && <p className="kb-empty">Nothing here</p>}
                {col.items.map((v) => {
                  const since = enteredAt(v, c.key);
                  const notOpened = c.key === 'draft' && !v.startedAt;
                  const waiting = (notOpened || ['submitted', 'received', 'rejected'].includes(c.key)) && Date.now() - since > 2 * DAY;
                  const canMove = Object.keys(moves[c.key] || {}).length > 0;
                  return (
                    <article
                      key={v._id}
                      className={`kb-card${busy === v._id ? ' busy' : ''}${drag?.id === v._id ? ' dragging' : ''}`}
                      draggable={canMove && !busy}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', v._id); setDrag({ id: v._id, col: c.key, v }); }}
                      onDragEnd={() => { setDrag(null); setOver(''); }}
                    >
                      <Link to={user?.role === 'superadmin' ? `/valuations/${v._id}/site` : `/valuations/${v._id}`} className="kb-card-link" draggable={false}>
                        <span className="kb-card-top">
                          <span className="avatar soft sm">{initials(v.summary?.applicantName)}</span>
                          <span className="kb-card-name">
                            <strong>{v.summary?.applicantName || 'Unnamed applicant'}</strong>
                            <small className="muted">{v.referenceNo}{v.summary?.reportTemplate ? ` · ${v.summary.reportTemplate}` : ''}</small>
                            {notOpened && <span className="kb-tag">Not opened</span>}
                          </span>
                        </span>
                        {(v.summary?.bankName || v.summary?.branch) && <span className="kb-card-line">{[v.summary?.bankName, v.summary?.branch].filter(Boolean).join(' · ')}</span>}
                        <span className="kb-card-foot">
                          <strong className="kb-value">{v.summary?.fairMarketValue > 0 ? inr(v.summary.fairMarketValue) : '—'}</strong>
                          <span className={`kb-age${waiting ? ' late' : ''}`} title={since.toLocaleString('en-IN')}>{waiting ? `Waiting ${timeAgo(since).replace(/ ago$/, '')}` : timeAgo(since)}</span>
                        </span>
                        {isReviewer && v.evaluator?.name && <span className="kb-card-who">{v.evaluator.name}</span>}
                      </Link>
                      {canMove && (
                        <button type="button" className="kb-move" onClick={() => setMoving({ v, col: c.key })} disabled={!!busy} aria-label={`Move ${v.referenceNo}`}>
                          Move ›
                        </button>
                      )}
                    </article>
                  );
                })}
                {col.total > col.items.length && (
                  <p className="kb-more">Showing the latest {col.items.length} of {col.total}. Search or switch to List to see the rest.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {moving && (
        <Modal title={`Move ${moving.v.referenceNo}`} onClose={() => setMoving(null)} className="kb-move-modal">
          <p className="muted small kb-move-from">Now in <strong>{TITLE[moving.col]}</strong></p>
          <div className="kb-move-list">
            {Object.entries(moves[moving.col] || {}).map(([to, action]) => (
              <button key={to} type="button" className="kb-move-opt" onClick={() => { const m = moving; setMoving(null); run(m.v, m.col, to); }}>
                <span className={`kb-dot tone-${BOARD_COLUMNS.find((c) => c.key === to).tone}`} aria-hidden="true" />
                <span><strong>{TITLE[to]}</strong><small className="muted">{ACTION_LABEL[action]}</small></span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </>
  );
}
