import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { REPORT_TEMPLATES } from '@dsk/shared';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import { initials } from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import { DuoContact, DuoSheet } from '../components/DuoIcons.jsx';
import { IconChevron, IconSearch, IconTick } from '../components/Icons.jsx';
import SectionIcon from '../components/SectionIcons.jsx';
import { propertyLabels, groupByProperty } from '../utils/properties.js';

// Reports → Generate: ① customer → ② approved input sheet → ③ report type → generate & store
const STEPS = ['Customer', 'Input sheet', 'Report type'];

export default function GenerateReport() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(0);
  const [customer, setCustomer] = useState(null); // { customer, valuations, reports }
  const [sheetId, setSheetId] = useState('');
  const [types, setTypes] = useState([]);
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.reportTypes().then((r) => { setTypes(r.types); if (r.types.length === 1) setType(r.types[0].key); }).catch(() => {});
  }, []);

  // deep links: ?customer=<id> starts at step 2; ?valuation=<id> starts at step 3
  useEffect(() => {
    const cid = params.get('customer');
    const vid = params.get('valuation');
    (async () => {
      try {
        if (vid) {
          const v = await api.getValuation(vid);
          if (v.customer?._id) {
            const c = await api.getCustomer(v.customer._id);
            setCustomer(c);
            if (v.status === 'approved') { setSheetId(vid); setStep(2); } else setStep(1);
          }
        } else if (cid) {
          setCustomer(await api.getCustomer(cid));
          setStep(1);
        }
      } catch (e) {
        setError(e.message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // customer search
  useEffect(() => {
    if (step !== 0) return undefined;
    const t = setTimeout(() => api.listCustomers({ q: q.trim(), limit: 8 }).then((r) => setFound(r.items)).catch((e) => setError(e.message)), 250);
    return () => clearTimeout(t);
  }, [q, step]);

  const pickCustomer = async (id) => {
    setError('');
    try {
      setCustomer(await api.getCustomer(id));
      setSheetId('');
      setStep(1);
    } catch (e) {
      setError(e.message);
    }
  };

  const generate = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.generateReport(sheetId, type);
      navigate(`/reports/${r._id}`, { replace: true });
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const sheets = customer?.valuations || [];
  const labels = propertyLabels(groupByProperty(sheets));
  const reportsPerSheet = (customer?.reports || []).reduce((m, r) => ({ ...m, [r.valuation]: (m[r.valuation] || 0) + 1 }), {});
  const sheet = sheets.find((v) => v._id === sheetId);
  const approvedCount = sheets.filter((v) => v.status === 'approved').length;

  return (
    <div className="page">
      <PageHeader icon={DuoSheet} back={{ to: '/reports', label: 'Reports' }} title="Generate report" />

      <ol className="wizard-steps" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : i === step ? 'on' : ''}>
            <button type="button" disabled={i > step} onClick={() => i < step && setStep(i)}>
              <span className="ws-dot">{i < step ? <IconTick size={13} strokeWidth={2.6} /> : i + 1}</span>
              <span className="ws-text">
                <small>Step {i + 1}</small>
                <strong>{label}</strong>
                {i === 0 && customer && <em>{customer.customer.name}</em>}
                {i === 1 && sheet && <em>{sheet.referenceNo}</em>}
              </span>
            </button>
          </li>
        ))}
      </ol>

      {error && <div className="alert">{error}</div>}

      {step === 0 && (
        <section className="card">
          <h2>Select customer</h2>
          <div className="search wizard-search">
            <IconSearch size={17} />
            <input autoFocus type="search" aria-label="Search customers" placeholder="Search name, phone, district, bank…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {!found ? <div className="skeleton" style={{ height: 180 }} /> : found.length === 0 ? (
            <p className="muted">No customers found.</p>
          ) : (
            <ul className="pick-list">
              {found.map((c) => (
                <li key={c._id}>
                  <button type="button" className="pick" onClick={() => pickCustomer(c._id)}>
                    <span className="avatar soft sm">{initials(c.name)}</span>
                    <span className="pick-main"><strong>{c.name}</strong><small>{[c.phone1, c.district].filter(Boolean).join(' · ')}</small></span>
                    <span className="pick-side muted small">{c.stats.approved} approved sheet{c.stats.approved === 1 ? '' : 's'}</span>
                    <IconChevron size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === 1 && customer && (
        <section className="card">
          <h2>Select an input sheet of {customer.customer.name}</h2>
          {sheets.length === 0 ? (
            <p className="muted">This customer has no input sheets yet. Start a valuation from their customer page.</p>
          ) : (
            <>
              {approvedCount === 0 && <p className="hint wizard-hint">None of their sheets are approved yet. A report can be generated once the superadmin approves a sheet.</p>}
              <ul className="pick-list">
                {sheets.map((v) => {
                  const ok = v.status === 'approved';
                  return (
                    <li key={v._id}>
                      <button type="button" className={`pick${sheetId === v._id ? ' on' : ''}`} disabled={!ok} onClick={() => { setSheetId(v._id); setStep(2); }}>
                        <span className="pick-icon"><SectionIcon section={{ key: 'property' }} size={16} /></span>
                        <span className="pick-main">
                          <strong>{v.referenceNo} · {REPORT_TEMPLATES[v.summary?.reportTemplate]?.title || 'Input sheet'}</strong>
                          <small>{labels[v._id]} · {new Date(v.summary?.valuationDate || v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{reportsPerSheet[v._id] ? ` · ${reportsPerSheet[v._id]} report${reportsPerSheet[v._id] === 1 ? '' : 's'} generated` : ''}</small>
                          {!ok && <small className="pick-why">Not approved yet, so a report can't be generated</small>}
                        </span>
                        <span className="pick-side">
                          <strong className="amount">{v.summary?.fairMarketValue > 0 ? inr(v.summary.fairMarketValue) : '—'}</strong>
                          <StatusBadge status={v.status} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      )}

      {step === 2 && sheet && (
        <section className="card">
          <h2>Select report type</h2>
          <div className="type-grid" role="radiogroup" aria-label="Report type">
            {types.map((t) => (
              <label key={t.key} className={`type-card${type === t.key ? ' on' : ''}`}>
                <input type="radio" name="type" checked={type === t.key} onChange={() => setType(t.key)} />
                <span className="type-icon"><DuoSheet size={20} /></span>
                <strong>{t.title}</strong>
                <small>{t.description}</small>
                {t.key === 'bank' && <span className="badge">{sheet.summary?.reportTemplate} · {REPORT_TEMPLATES[sheet.summary?.reportTemplate]?.title}</span>}
              </label>
            ))}
          </div>
          <div className="generate-summary">
            <span className="gs-who"><DuoContact size={18} /> {customer.customer.name}</span>
            <span>{sheet.referenceNo} · {labels[sheet._id]}</span>
            {reportsPerSheet[sheet._id] > 0 && <span className="muted">This will be version {reportsPerSheet[sheet._id] + 1}; earlier versions are kept.</span>}
          </div>
          <div className="actions">
            <button type="button" className="btn" onClick={() => setStep(1)}>‹ Back</button>
            <button type="button" className="btn primary" disabled={!type || busy} onClick={generate}>{busy ? 'Generating…' : 'Generate & store report'}</button>
          </div>
        </section>
      )}
    </div>
  );
}
