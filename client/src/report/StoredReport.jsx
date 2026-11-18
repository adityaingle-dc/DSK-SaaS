import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import ReportViewer from './ReportViewer.jsx';
import { dateTime } from '../utils/format.js';
import { confirmDialog } from '../components/ConfirmDialog.jsx';

// A stored report from the Reports module: renders the frozen copy taken when it was generated.
export default function StoredReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [r, setR] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getReport(id).then(setR).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="alert">{error}</div>;
  if (!r) return <div className="center">Loading report…</div>;

  const doc = { referenceNo: r.snapshot.referenceNo, status: r.snapshot.status, data: r.snapshot.data, results: r.snapshot.results };
  const generated = `Generated ${dateTime(r.createdAt)}${r.generatedBy?.name ? ` by ${r.generatedBy.name}` : ''}`;
  const edited = r.editedAt ? ` · wording edited ${dateTime(r.editedAt)}${r.editedBy?.name ? ` by ${r.editedBy.name}` : ''}` : '';

  const remove = async () => {
    if (!(await confirmDialog({ title: `Delete ${r.reportNo}?`, message: 'The stored report will be removed permanently. The input sheet is not affected.', confirmLabel: 'Delete report', tone: 'danger', icon: 'trash' }))) return;
    try {
      await api.deleteReport(r._id);
      navigate('/reports', { replace: true });
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <ReportViewer
      doc={doc}
      overrides={r.overrides || {}}
      onSave={async (draft) => {
        const res = await api.saveStoredReportOverrides(r._id, draft);
        return { overrides: res.overrides, editedText: `${generated} · wording edited ${dateTime(res.editedAt)}${res.editedBy?.name ? ` by ${res.editedBy.name}` : ''}` };
      }}
      back={{ to: '/reports', label: 'Reports' }}
      title={r.applicantName || r.customer?.name}
      meta={`${r.reportNo} · v${r.version} · ${r.templateTitle || ''}`}
      badge={<span className="badge frozen-badge" title="Values as they were when the report was generated">Frozen copy</span>}
      edited={generated + edited}
      docTitle={`${r.reportNo.replace(/\//g, '-')} ${r.applicantName || ''}`.trim()}
      banner={
        <div className="edit-hint no-print stored-hint">
          Values are frozen as of {dateTime(r.createdAt)} from input sheet <Link to={`/valuations/${r.valuation}`}>{r.snapshot.referenceNo}</Link>.
          {' '}If the sheet changed since, <Link to={`/reports/new?valuation=${r.valuation}`}>generate a new version</Link>.
          {' '}<button type="button" className="linklike danger-link" onClick={remove}>Delete this report</button>
        </div>
      }
    />
  );
}
