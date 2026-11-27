import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import ReportViewer from './ReportViewer.jsx';
import { dateTime } from '../utils/format.js';
import { alertDialog, confirmDialog, promptDialog } from '../components/ConfirmDialog.jsx';
import { ReportStatus } from '../pages/Reports.jsx';
import { approveDialog, sendBackDialog } from '../components/ReportBoard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { reuseSheet } from '../utils/reuseSheet.js';

// A generated report: the frozen copy taken when the drafter generated it.
//  - awaiting approval: the superadmin approves it (final) or sends it back to the drafter with a note; they can
//    still correct the wording first
//  - sent back: kept for the record, a newer version replaces it
//  - approved: final and locked; this is the copy that is printed / saved as PDF
export default function StoredReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isSuperadmin, isOffice } = useAuth();
  const [r, setR] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setR(null);
    api.getReport(id).then(setR).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="alert">{error}</div>;
  if (!r) return <div className="center">Loading report…</div>;

  // signed: the valuer's signature and seal are printed only once the report is approved
  const doc = { referenceNo: r.snapshot.referenceNo, status: r.snapshot.status, data: r.snapshot.data, results: r.snapshot.results, signed: r.status === 'approved' };
  const generated = `Generated ${dateTime(r.createdAt)}${r.generatedBy?.name ? ` by ${r.generatedBy.name}` : ''}`;
  const edited = r.editedAt ? ` · wording edited ${dateTime(r.editedAt)}${r.editedBy?.name ? ` by ${r.editedBy.name}` : ''}` : '';
  const approved = r.status === 'approved';
  const returned = r.status === 'returned';
  const waiting = !approved && !returned;
  const latest = r.versions?.[0];
  const newer = latest && latest._id !== r._id ? latest : null;

  const decide = async (to) => {
    let note;
    if (to === 'approved') { if (!(await confirmDialog(approveDialog(r)))) return; }
    else { note = await promptDialog(sendBackDialog(r)); if (note == null) return; }
    setBusy(true);
    try {
      setR(await api.setReportStatus(r._id, to, note));
    } catch (e) {
      alertDialog({ title: to === 'approved' ? "Couldn't approve the report" : "Couldn't send it back", message: e.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: `Delete ${r.reportNo}?`, message: `The stored report will be removed permanently.${approved || waiting ? ' The input sheet goes back to its drafter.' : ''}`, confirmLabel: 'Delete report', tone: 'danger', icon: 'trash' }))) return;
    try {
      await api.deleteReport(r._id);
      navigate('/reports', { replace: true });
    } catch (e) {
      setError(e.message);
    }
  };

  // the superadmin decides from the top bar; Print / Save PDF once the report is approved
  const decision = isSuperadmin && waiting ? (
    <>
      <button type="button" className="btn danger-outline" onClick={() => decide('returned')} disabled={busy}>Send back to drafter</button>
      <button type="button" className="btn primary rt-print" onClick={() => decide('approved')} disabled={busy}>{busy ? 'Saving…' : 'Approve'}</button>
    </>
  ) : approved ? undefined : null;

  return (
    <ReportViewer
      key={`${r._id}-${r.status || 'review'}`}
      doc={doc}
      overrides={r.overrides || {}}
      canEdit={isSuperadmin && waiting}
      onSave={isSuperadmin && waiting ? async (draft) => {
        const res = await api.saveStoredReportOverrides(r._id, draft);
        return { overrides: res.overrides, editedText: `${generated} · wording edited ${dateTime(res.editedAt)}${res.editedBy?.name ? ` by ${res.editedBy.name}` : ''}` };
      } : undefined}
      primaryAction={decision}
      back={isOffice ? { to: '/reports', label: 'Reports' } : { to: `/valuations/${r.valuation}`, label: 'Sheet' }}
      title={r.applicantName || r.customer?.name}
      meta={`${r.reportNo} · v${r.version} · ${r.templateTitle || ''}`}
      badge={<><ReportStatus r={r} /><span className="badge frozen-badge" title="Values as they were when the report was generated">Frozen copy</span></>}
      edited={generated + edited}
      docTitle={`${r.reportNo.replace(/\//g, '-')} ${r.applicantName || ''}`.trim()}
      banner={
        <>
          <div className={`edit-hint no-print report-review-bar ${approved ? 'is-approved' : returned ? 'is-returned' : 'is-review'}`}>
            {approved && <span><strong>Approved</strong>{r.approvedAt ? ` ${dateTime(r.approvedAt)}` : ''}{r.approvedBy?.name ? ` by ${r.approvedBy.name}` : ''}. This is the final report; it can no longer be changed.</span>}
            {returned && <span><strong>Sent back to the drafter</strong>{r.returnedAt ? ` ${dateTime(r.returnedAt)}` : ''}{r.returnedBy?.name ? ` by ${r.returnedBy.name}` : ''}{r.returnNote ? `: ${r.returnNote}` : '.'}</span>}
            {waiting && (isSuperadmin
              ? <span><strong>Waiting for your approval.</strong> Read it through (you can correct the wording with Edit mode), then approve it or send it back to the drafter with a note.</span>
              : <span><strong>Awaiting approval</strong> by the superadmin. If they send it back, you will see their note on the sheet.</span>)}
          </div>
          {r.versions?.length > 1 && (
            <div className="edit-hint no-print report-versions">
              <span>Versions:</span>
              {r.versions.map((x) => (
                x._id === r._id
                  ? <strong key={x._id}>v{x.version} (this)</strong>
                  : <Link key={x._id} to={`/reports/${x._id}`}>v{x.version} · {x.status === 'approved' ? 'approved' : x.status === 'returned' ? 'sent back' : 'awaiting approval'}</Link>
              ))}
            </div>
          )}
          <div className="edit-hint no-print stored-hint">
            Values are frozen as of {dateTime(r.createdAt)} from input sheet <Link to={`/valuations/${r.valuation}`}>{r.snapshot.referenceNo}</Link>.
            {newer && <> A newer version exists: <Link to={`/reports/${newer._id}`}>v{newer.version}</Link>.</>}
            {approved && <> <button type="button" className="linklike" onClick={() => reuseSheet({ _id: r.valuation, referenceNo: r.snapshot.referenceNo }, navigate)}>Use this site inspection for another report</button></>}
            {isSuperadmin && <> <button type="button" className="linklike danger-link" onClick={remove}>Delete this report</button></>}
          </div>
        </>
      }
    />
  );
}
