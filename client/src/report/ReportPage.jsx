import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import StatusBadge from '../components/StatusBadge.jsx';
import ReportViewer from './ReportViewer.jsx';
import { computeValuation, personName, REPORT_TEMPLATES, sanitize } from '@dsk/shared';
import { useAuth } from '../context/AuthContext.jsx';
import { dateTime } from '../utils/format.js';

// Live preview of a valuation's bank report (follows the current input sheet).
// Stored, frozen reports are generated and kept in the Reports module.
// ?draft=1 (from the input sheet's Preview button): the report from the entries on that device, saved or not, read-only.
export default function ReportPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const fromSheet = params.get('draft') === '1';
  const ret = params.get('return');
  const sheetUrl = `/valuations/${id}/edit?from=preview${ret ? `&return=${encodeURIComponent(ret)}` : ''}`;
  const [v, setV] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getValuation(id).then((doc) => {
      if (!fromSheet) return setV(doc);
      let draft = null;
      try { draft = JSON.parse(localStorage.getItem(`dsk_sheet_draft:${user?._id || 'me'}:${id}`) || 'null'); } catch { /* none */ }
      if (!draft?.data) return setV({ ...doc, unsaved: false });
      const data = sanitize(draft.data);
      setV({ ...doc, data, results: computeValuation(data), unsaved: true });
    }).catch((e) => setError(e.message));
  }, [id, fromSheet, user?._id]);

  if (error) return <div className="alert">{error}</div>;
  if (!v) return <div className="center">Loading report…</div>;

  // the report is generated from here (from a sheet the evaluator has handed in); generating completes the sheet
  const ready = ['submitted', 'received', 'approved'].includes(v.status) && (v.status === 'approved' || v.draftReady !== false);
  const generateButton = (label = v.status === 'approved' ? 'Generate again' : 'Generate report') => (
    <Link className="btn primary rt-print" to={`/reports/new?valuation=${id}`}>{label}</Link>
  );

  if (fromSheet) {
    return (
      <ReportViewer
        doc={v}
        overrides={v.reportOverrides || {}}
        primaryAction={ready && !v.unsaved ? generateButton() : null}
        back={{ to: sheetUrl, label: 'Back to the input sheet' }}
        title={personName(v.data?.applicant) || v.summary?.applicantName}
        meta={`${v.referenceNo} · ${REPORT_TEMPLATES[v.results?.summary?.reportTemplate || v.summary?.reportTemplate]?.title || ''} · preview`}
        badge={<StatusBadge status={v.status} />}
        docTitle={`${v.referenceNo} ${v.summary?.applicantName || ''} preview`.trim()}
        banner={
          <div className="edit-hint no-print preview-banner">
            <span>
              {v.unsaved ? `Preview with your entries, including changes not saved yet.${ready ? ' Save the sheet (last step) to generate the report from it.' : ''}` : 'Preview of the input sheet as saved.'}
              {['draft', 'rejected'].includes(v.status) ? ' The evaluator has not handed this sheet in yet.' : ''}
            </span>
            <Link className="btn primary small" to={sheetUrl}>Back to the sheet</Link>
          </div>
        }
      />
    );
  }

  const edited = v.reportEditedAt ? `Last edited ${dateTime(v.reportEditedAt)}${v.reportEditedBy?.name ? ` by ${v.reportEditedBy.name}` : ''}` : '';
  return (
    <ReportViewer
      doc={v}
      overrides={v.reportOverrides || {}}
      onSave={async (draft) => {
        const res = await api.saveReportOverrides(id, draft);
        return { overrides: res.reportOverrides, editedText: `Last edited ${dateTime(res.reportEditedAt)}${res.reportEditedBy?.name ? ` by ${res.reportEditedBy.name}` : ''}` };
      }}
      primaryAction={ready ? generateButton() : null}
      back={{ to: `/valuations/${id}`, label: 'Input sheet' }}
      title={v.summary?.applicantName}
      meta={`${v.referenceNo} · ${REPORT_TEMPLATES[v.summary?.reportTemplate]?.title || ''} · live preview`}
      badge={<StatusBadge status={v.status} />}
      edited={edited}
      docTitle={`${v.referenceNo} ${v.summary?.applicantName || ''} ${v.summary?.reportTemplate || ''}`.trim()}
      banner={
        <div className="edit-hint warn no-print">
          {!['draft', 'rejected'].includes(v.status)
            ? <>This is a live preview that follows the input sheet. Use <strong>{v.status === 'approved' ? 'Generate again' : 'Generate report'}</strong> to issue and keep a fixed copy (with its PDF){v.status !== 'approved' ? '; that completes the sheet' : ''}.</>
            : <>The site inspection is {v.status === 'rejected' ? 'sent back to the evaluator' : 'not submitted yet'}, so the preview prints with a DRAFT watermark. A report can be generated once the evaluator submits it.</>}
          {['submitted', 'received'].includes(v.status) && v.draftReady === false && <> The draft sheet is not complete yet ({v.draftMissing} field{v.draftMissing === 1 ? '' : 's'} to fill): <Link to={`/valuations/${id}/draft`}>complete the draft sheet</Link> to generate the report.</>}
        </div>
      }
    />
  );
}
