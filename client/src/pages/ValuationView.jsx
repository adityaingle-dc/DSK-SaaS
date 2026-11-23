import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { DRAFTING_STATUSES } from '@dsk/shared';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import ResultsPanel from '../components/ResultsPanel.jsx';
import SheetSections from '../components/SheetView.jsx';
import CustomerContactCard from '../components/CustomerContact.jsx';
import SiteCard from '../components/SiteInfo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { DuoBuilding } from '../components/DuoIcons.jsx';
import { alertDialog, confirmDialog } from '../components/ConfirmDialog.jsx';
import { reuseSheet } from '../utils/reuseSheet.js';

const when = (d, time = false) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', ...(time ? { hour: 'numeric', minute: '2-digit' } : { year: 'numeric' }) }) : '');

// A sheet's page: where the job stands and what comes next, with the sheet's contents read-only.
export default function ValuationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSuperadmin, isOffice, isDrafter, user } = useAuth();
  const [v, setV] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [report, setReport] = useState(null); // the latest report (office)
  const [drafters, setDrafters] = useState(null); // superadmin: who the sheet can be given to

  const load = () => api.getValuation(id).then(setV).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isOffice || !v || !['pending', 'approved', 'returned'].includes(v.status)) return;
    api.listReports({ valuation: id, status: v.status === 'approved' ? 'approved' : v.status === 'pending' ? 'review' : 'returned', limit: 1, sort: 'created', dir: 'desc' })
      .then((r) => setReport(r.items?.find((x) => x.kind !== 'draft') || null)).catch(() => {});
  }, [isOffice, v?.status, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!isSuperadmin || !v || !DRAFTING_STATUSES.includes(v.status) || drafters) return;
    api.listUsers({ status: 'active' }).then((r) => setDrafters((r.items || []).filter((u) => u.role === 'drafter' && u.status === 'active'))).catch(() => setDrafters([]));
  }, [isSuperadmin, v?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const sendBack = async () => {
    try {
      setV(await api.reviewValuation(id, 'rejected', note));
      setNote('');
    } catch (e) {
      setError(e.message);
    }
  };
  const reassign = async (drafter) => {
    try {
      setV(await api.setDrafter(id, drafter || null));
    } catch (e) {
      alertDialog({ title: "Couldn't change the drafter", message: e.message });
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Delete this input sheet?', message: 'The sheet and its photos will be removed permanently. This cannot be undone.', confirmLabel: 'Delete input sheet', tone: 'danger', icon: 'trash' }))) return;
    try {
      await api.deleteValuation(id);
      navigate('/valuations', { replace: true });
    } catch (e) {
      setError(e.message);
    }
  };

  if (error && !v) return <div className="alert">{error}</div>;
  if (!v) return <div className="center">Loading…</div>;

  const s = v.results?.summary || {};
  const drafter = v.drafter?.name;
  const mineToDraft = isDrafter && DRAFTING_STATUSES.includes(v.status) && (!v.drafter || String(v.drafter._id) === String(user?._id));
  const selfDrafting = !isOffice && v.drafter && String(v.drafter._id) === String(user?._id);
  const editLabel = isOffice ? (v.status === 'submitted' && isDrafter ? 'Take & draft' : 'Open drafting') : selfDrafting ? 'Continue drafting' : v.status === 'rejected' ? 'Fix & resubmit' : 'Continue site inspection';

  // where the job stands, in words
  const banner = {
    draft: { title: `Site visit by ${v.evaluator?.name || 'the evaluator'}`, text: isOffice ? 'The field evaluator is filling the site inspection. It comes to the drafters when they submit it.' : 'Fill in what you see on site, then submit it to the drafter. Nothing is compulsory.' },
    rejected: { title: `Sent back to ${isOffice ? v.evaluator?.name || 'the evaluator' : 'you'}`, by: v.reviewedBy?.name, at: v.reviewedAt, text: v.reviewNote },
    submitted: { title: isOffice ? 'In the drafters\' queue' : 'Submitted to the drafter', at: v.submittedAt, text: isOffice ? (isDrafter ? 'Open it to take it: it becomes yours to draft.' : 'Waiting for a drafter to take it (or give it to one below).') : 'Waiting for a drafter to take it. You can no longer change it unless they send it back to you.' },
    received: { title: drafter ? `Drafting by ${selfDrafting ? 'you' : drafter}` : 'Being drafted', at: v.receivedAt, text: isOffice ? 'The drafter completes the sheet and the report, then generates it for approval.' : selfDrafting ? 'Complete the sheet and the report, then generate it for the superadmin\'s approval.' : 'The drafter is completing the sheet and preparing the report.' },
    returned: { title: `Report sent back to ${drafter || 'the drafter'}`, by: v.returnedBy?.name, at: v.returnedAt, text: v.returnNote },
    pending: { title: 'Report awaiting approval', at: v.reportedAt, text: isSuperadmin ? 'Open the report to approve it or send it back to the drafter.' : `The report${drafter ? ` by ${drafter}` : ''} is with the superadmin.` },
    approved: { title: 'Approved', by: v.approvedBy?.name, at: v.approvedAt || v.reportedAt, text: 'The report is final, so the sheet can no longer be changed.' },
  }[v.status];

  return (
    <div className="page">
      <PageHeader
        icon={DuoBuilding}
        back={{ to: '/valuations', label: 'Site Inspections' }}
        title={v.summary?.applicantName || 'Unnamed applicant'}
        meta={<StatusBadge status={v.status} />}
        subtitle={
          <>
            {[v.referenceNo, v.service, [v.summary?.bankName, v.summary?.branch].filter(Boolean).join(' '), v.evaluator?.name && `site by ${v.evaluator.name}`, drafter && `drafter ${drafter}`].filter(Boolean).join(' · ')}
            {isSuperadmin && v.customer && <> · Customer <Link to={`/customers/${v.customer._id}`}>{v.customer.name}</Link></>}
            {v.basedOn?.referenceNo && <> · Site inspection reused from <Link to={`/valuations/${v.basedOn._id}`}>{v.basedOn.referenceNo}</Link></>}
          </>
        }
        actions={
          <div className="actions no-print">
            {isSuperadmin && <button className="btn danger" onClick={remove}>Delete</button>}
            {report && <Link className={`btn${v.status === 'pending' && isSuperadmin ? ' primary' : ''}`} to={`/reports/${report._id}`}>{v.status === 'pending' && isSuperadmin ? 'Review report' : `Report v${report.version}`}</Link>}
            {isOffice && !['draft', 'rejected'].includes(v.status) && <button type="button" className="btn" onClick={() => reuseSheet(v, navigate)} title="Start a new sheet from this site inspection, for another report">Use for another report</button>}
            {v.canEdit && <Link className="btn primary" to={`/valuations/${id}/edit`}>{editLabel}</Link>}
          </div>
        }
      />

      <section className="hero-card receipt">
        <div className="receipt-top">
          <span className="badge on-dark">{s.reportTemplate} · {v.results?.context?.report?.title}</span>
        </div>
        <div className="hero-label">Fair market value</div>
        <div className="hero-value">{inr(s.fairMarketValue)}</div>
        <div className="hero-words">{s.words?.fairMarketValue}</div>
        <div className="hero-meta">
          <span>Realizable <strong>{inr(s.realizableValue)}</strong></span>
          <span>Distress <strong>{inr(s.distressValue)}</strong></span>
          <span>Book value <strong>{inr(s.bookValue)}</strong></span>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {banner && (
        <div className={`card review-note status-${v.status}`}>
          <strong>{banner.title}</strong>{(banner.by || banner.at) && <> · {[banner.by && `by ${banner.by}`, banner.at && when(banner.at, true)].filter(Boolean).join(' on ')}</>}
          {banner.text && <p>{banner.text}</p>}
          {v.editBlock && !isOffice && v.status !== 'approved' && v.status !== 'draft' && v.status !== 'rejected' && <p className="muted small">{v.editBlock}</p>}
          {isOffice && ['received', 'returned'].includes(v.status) && <p className="muted small">{v.draftReady ? 'The sheet is complete: the report can be generated.' : `${v.draftMissing || 0} field${v.draftMissing === 1 ? '' : 's'} still to fill before the report.`}</p>}
        </div>
      )}

      <div className="view-layout">
        <div>
          <SheetSections data={v.data || {}} />
        </div>
        <aside className="side-stack">
          {isSuperadmin && DRAFTING_STATUSES.includes(v.status) && drafters && (
            <section className="card review-card no-print">
              <h2>Drafter</h2>
              <select aria-label="Drafter" value={v.drafter?._id || ''} onChange={(e) => reassign(e.target.value)}>
                <option value="">In the queue (anyone can take it)</option>
                {drafters.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                {v.drafter && !drafters.some((u) => u._id === v.drafter._id) && <option value={v.drafter._id}>{v.drafter.name}</option>}
              </select>
              <p className="hint">Give the sheet to a drafter, or put it back in the queue.</p>
            </section>
          )}
          {(isSuperadmin || mineToDraft) && DRAFTING_STATUSES.includes(v.status) && (
            <section className="card review-card no-print">
              <h2>Back to the evaluator</h2>
              <textarea rows={2} aria-label="What should the evaluator change?" placeholder="e.g. Add the east side photo" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="actions">
                <button className="btn danger" disabled={!note.trim()} onClick={sendBack}>Send back with note</button>
              </div>
              <p className="hint">The site inspection opens again for {v.evaluator?.name || 'the evaluator'} with your note.</p>
            </section>
          )}
          <SiteCard property={v.data?.property} />
          <CustomerContactCard customer={v.customer} />
          <div className="card sticky-side">
            <h2>Breakdown</h2>
            <ResultsPanel results={v.results} hideHeadline />
          </div>
        </aside>
      </div>
    </div>
  );
}
