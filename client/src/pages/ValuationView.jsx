import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getContext, sectionPath, visibleSections } from '@dsk/shared';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import ResultsPanel from '../components/ResultsPanel.jsx';
import { FileThumb } from '../components/FilesInput.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const isEmpty = (v) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => !isEmpty(x)));

function display(field, v) {
  switch (field.type) {
    case 'checkbox':
      return v ? 'Yes' : 'No';
    case 'date':
      return new Date(v).toLocaleDateString('en-IN');
    case 'number':
      return field.unit === '₹' ? inr(v) : `${Number(v).toLocaleString('en-IN')}${field.unit ? ` ${field.unit}` : ''}`;
    case 'multiselect':
      return v.join('; ');
    case 'files':
      return <div className="thumbs">{v.map((f) => <FileThumb key={f.id} file={f} />)}</div>;
    case 'latlon':
      return (
        <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lon}`}>
          {v.lat}, {v.lon}
        </a>
      );
    case 'table':
      return (
        <table className="table small">
          <thead><tr>{field.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>{v.map((row, i) => <tr key={i}>{field.columns.map((c) => <td key={c.key}>{isEmpty(row[c.key]) ? '' : display(c, row[c.key])}</td>)}</tr>)}</tbody>
        </table>
      );
    case 'grid':
      return (
        <table className="table small">
          <thead><tr><th />{field.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>{field.rows.map((r) => <tr key={r}><th>{r}</th>{field.columns.map((c) => <td key={c.key}>{v[r.toLowerCase()]?.[c.key] || ''}</td>)}</tr>)}</tbody>
        </table>
      );
    case 'tiers':
      return (
        <ul className="plain">
          {field.items.filter((i) => v[i.key]).map((i) => (
            <li key={i.key}>{i.label}: {field.tiers[v[i.key].tier]}{i.unit && v[i.key].qty ? ` × ${v[i.key].qty} ${i.unit}` : ''}</li>
          ))}
        </ul>
      );
    case 'stages':
      return (
        <ul className="plain">
          {field.items.filter((i) => v[i.key] && v[i.key] !== 'Not Started').map((i) => <li key={i.key}>{i.label}: {v[i.key]}</li>)}
        </ul>
      );
    default:
      return String(v);
  }
}

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
    if (!confirm('Delete this valuation permanently?')) return;
    try {
      await api.deleteValuation(id);
      navigate('/valuations');
    } catch (e) {
      setError(e.message);
    }
  };

  if (error && !v) return <div className="alert">{error}</div>;
  if (!v) return <div className="center">Loading…</div>;

  const data = v.data || {};
  const ctx = getContext(data);
  const canEdit = isReviewer || ['draft', 'rejected'].includes(v.status);
  const canDelete = isReviewer || v.status === 'draft';

  const s = v.results?.summary || {};
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <Link to="/valuations" className="link-sm">‹ Valuations</Link>
          <h1>{v.summary?.applicantName || 'Unnamed applicant'}</h1>
          <p className="muted">
            {v.referenceNo} · {v.summary?.bankName} {v.summary?.branch} · {v.evaluator?.name}
          </p>
        </div>
        <div className="actions no-print">
          {canEdit && <Link className="btn primary" to={`/valuations/${id}/edit`}>Edit</Link>}
          <Link className="btn" to={`/valuations/${id}/report`}>{isSuperadmin ? 'Report · edit & print' : 'Bank report'}</Link>
          {canDelete && <button className="btn danger" onClick={remove}>Delete</button>}
        </div>
      </div>

      <section className="hero-card receipt">
        <div className="receipt-top">
          <StatusBadge status={v.status} />
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
      {v.reviewedBy && (
        <div className={`card review-note status-${v.status}`}>
          <strong>{v.status === 'approved' ? 'Approved' : 'Rejected'}</strong> by {v.reviewedBy.name} on {new Date(v.reviewedAt).toLocaleDateString('en-IN')}
          {v.reviewNote && <p>{v.reviewNote}</p>}
        </div>
      )}

      <div className="view-layout">
        <div>
          {visibleSections(ctx, data).map((s) => {
            const values = data[sectionPath(s)] || {};
            const filled = s.fields.filter((f) => !isEmpty(values[f.key]) && (!f.when || f.when(ctx, data)));
            if (!filled.length) return null;
            return (
              <section className="card" key={s.key}>
                <h2>{s.title}</h2>
                <dl className="kv">
                  {filled.map((f) => (
                    <div className={`kv-row${['table', 'grid', 'tiers'].includes(f.type) ? ' wide' : ''}`} key={f.key}>
                      <dt>{f.label}</dt>
                      <dd>{display(f, values[f.key])}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            );
          })}
        </div>
        <aside className="side-stack">
          {isReviewer && v.status === 'submitted' && (
            <section className="card review-card no-print">
              <h2>Review decision</h2>
              <textarea rows={2} placeholder="Note to evaluator (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="actions split">
                <button className="btn danger" onClick={() => review('rejected')}>Reject</button>
                <button className="btn primary" onClick={() => review('approved')}>Approve</button>
              </div>
            </section>
          )}
          <div className="card sticky-side">
            <h2>Breakdown</h2>
            <ResultsPanel results={v.results} hideHeadline />
          </div>
        </aside>
      </div>
    </div>
  );
}
