import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import ResultsPanel from '../components/ResultsPanel.jsx';
import SheetSections from '../components/SheetView.jsx';
import CustomerContactCard from '../components/CustomerContact.jsx';
import SiteCard from '../components/SiteInfo.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { DuoBuilding } from '../components/DuoIcons.jsx';
import { confirmDialog } from '../components/ConfirmDialog.jsx';

export default function ValuationView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isReviewer, isSuperadmin } = useAuth();
  const [v, setV] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getValuation(id).then(setV).catch((e) => setError(e.message));
  }, [id]);

  const review = async (decision) => {
    try {
      setV(await api.reviewValuation(id, decision, note));
    } catch (e) {
      setError(e.message);
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

  const canEdit = isReviewer || ['draft', 'rejected'].includes(v.status);
  const canDelete = isSuperadmin;

  const s = v.results?.summary || {};
  return (
    <div className="page">
      <PageHeader
        icon={DuoBuilding}
        back={{ to: '/valuations', label: 'Input Sheets' }}
        title={v.summary?.applicantName || 'Unnamed applicant'}
        meta={<StatusBadge status={v.status} />}
        subtitle={
          <>
            {[v.referenceNo, [v.summary?.bankName, v.summary?.branch].filter(Boolean).join(' '), v.evaluator?.name].filter(Boolean).join(' · ')}
            {isSuperadmin && v.customer && <> · Customer <Link to={`/customers/${v.customer._id}`}>{v.customer.name}</Link></>}
          </>
        }
        actions={
          <div className="actions no-print">
            {canDelete && <button className="btn danger" onClick={remove}>Delete</button>}
            {isSuperadmin && <Link className="btn" to={`/valuations/${id}/report`}>Preview report</Link>}
            {isSuperadmin && v.status === 'approved' && <Link className="btn primary" to={`/reports/new?valuation=${id}`}>Generate report</Link>}
            {canEdit && <Link className="btn primary" to={`/valuations/${id}/edit`}>Edit</Link>}
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
      {!isSuperadmin && v.status === 'submitted' && (
        <div className="card review-note status-submitted">
          <strong>Submitted to the superadmin</strong>
          <p>The superadmin reviews this sheet and prepares the bank report. You'll see it here if it's returned for changes.</p>
        </div>
      )}
      {v.reviewedBy && (
        <div className={`card review-note status-${v.status}`}>
          <strong>{v.status === 'approved' ? 'Approved' : 'Rejected'}</strong> by {v.reviewedBy.name} on {new Date(v.reviewedAt).toLocaleDateString('en-IN')}
          {v.reviewNote && <p>{v.reviewNote}</p>}
        </div>
      )}

      <div className="view-layout">
        <div>
          <SheetSections data={v.data || {}} />
        </div>
        <aside className="side-stack">
          {isSuperadmin && v.status === 'submitted' && (
            <section className="card review-card no-print">
              <h2>Review decision</h2>
              <textarea rows={2} placeholder="Note to evaluator (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="actions split">
                <button className="btn danger" onClick={() => review('rejected')}>Reject</button>
                <button className="btn primary" onClick={() => review('approved')}>Approve</button>
              </div>
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
