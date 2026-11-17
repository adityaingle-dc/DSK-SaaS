import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import ReportViewer from './ReportViewer.jsx';
import { REPORT_TEMPLATES } from '@dsk/shared';
import { dateTime } from '../utils/format.js';

// Live preview of a valuation's bank report (follows the current input sheet).
// Stored, frozen reports are generated and kept in the Reports module.
export default function ReportPage() {
  const { id } = useParams();
  const [v, setV] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getValuation(id).then(setV).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="alert">{error}</div>;
  if (!v) return <div className="center">Loading report…</div>;

  const edited = v.reportEditedAt ? `Last edited ${dateTime(v.reportEditedAt)}${v.reportEditedBy?.name ? ` by ${v.reportEditedBy.name}` : ''}` : '';
  return (
    <ReportViewer
      doc={v}
      overrides={v.reportOverrides || {}}
      onSave={async (draft) => {
        const res = await api.saveReportOverrides(id, draft);
        return { overrides: res.reportOverrides, editedText: `Last edited ${dateTime(res.reportEditedAt)}${res.reportEditedBy?.name ? ` by ${res.reportEditedBy.name}` : ''}` };
      }}
      back={{ to: `/valuations/${id}`, label: 'Input sheet' }}
      title={v.summary?.applicantName}
      meta={`${v.referenceNo} · ${REPORT_TEMPLATES[v.summary?.reportTemplate]?.title || ''} · live preview`}
      badge={<StatusBadge status={v.status} />}
      edited={edited}
      docTitle={`${v.referenceNo} ${v.summary?.applicantName || ''} ${v.summary?.reportTemplate || ''}`.trim()}
      banner={
        <div className="edit-hint warn no-print">
          {v.status === 'approved'
            ? <>This is a live preview that follows the input sheet. To issue and keep a fixed copy, <Link to={`/reports/new?valuation=${id}`}>generate a report</Link>.</>
            : <>This input sheet is <strong>{v.status}</strong>, so the preview prints with a {v.status === 'rejected' ? 'REJECTED' : 'DRAFT'} watermark. Reports can be generated once it is approved.</>}
        </div>
      }
    />
  );
}
