import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { REPORT_TEMPLATES } from '@dsk/shared';
import { api } from '../api/client.js';
import StatusBadge, { inr } from '../components/StatusBadge.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Segmented from '../components/Segmented.jsx';
import SheetSections from '../components/SheetView.jsx';
import SectionIcon from '../components/SectionIcons.jsx';
import { DuoContact } from '../components/DuoIcons.jsx';
import { IconChevron, IconPlus } from '../components/Icons.jsx';
import { AssignValuationModal, CustomerFormModal } from '../components/CustomerDialogs.jsx';
import { CustomerStage } from './Customers.jsx';
import { dateTime, timeAgo } from '../utils/format.js';
import { PhoneActions, WhatsAppLink } from '../components/CustomerContact.jsx';
import { groupByProperty, propertyLabels } from '../utils/properties.js';

const fullAddress = (c) => [c.houseNo, c.street, c.locality, c.district, c.pincode].filter(Boolean).join(', ');
const fmv = (v) => (v.summary?.fairMarketValue > 0 ? inr(v.summary.fairMarketValue) : '—');

function Info({ label, children }) {
  if (!children) return null;
  return (
    <div className="kv-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export default function CustomerView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // 'edit' | 'assign'
  const [assignFrom, setAssignFrom] = useState(''); // property (latest valuation id) to re-value
  const [notice, setNotice] = useState(null);
  const tab = params.get('tab') || 'profile';

  const load = () => api.getCustomer(id).then((d) => { setState(d); setError(''); }).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (error && !state) return <div className="alert">{error}</div>;
  if (!state) return <div className="page"><div className="skeleton" style={{ height: 90 }} /><div className="skeleton" style={{ height: 300 }} /></div>;

  const { customer: c, valuations, reports = [] } = state;
  const stats = {
    total: valuations.length,
    open: valuations.filter((v) => ['draft', 'submitted', 'rejected'].includes(v.status)).length,
    approved: valuations.filter((v) => v.status === 'approved').length,
    totalValue: valuations.reduce((s, v) => s + (v.summary?.fairMarketValue || 0), 0),
  };
  // tab switches don't add history entries, so Back leaves the page in one step
  const properties = groupByProperty(valuations);
  const propLabel = propertyLabels(properties);
  const openAssign = (fromId = '') => { setAssignFrom(fromId); setModal('assign'); };
  const setTab = (t) => setParams(t === 'profile' ? {} : { tab: t }, { replace: true });

  const remove = async () => {
    if (!confirm(`Delete ${c.name}? This cannot be undone.`)) return;
    try {
      await api.deleteCustomer(c._id);
      navigate('/customers', { replace: true }); // the deleted customer's page must not stay in history
    } catch (e) {
      setError(e.message);
    }
  };

  const startButton = <button className="btn primary" onClick={() => openAssign('')}><IconPlus size={16} /> Start valuation</button>;

  return (
    <div className="page">
      <PageHeader
        icon={DuoContact}
        back={{ to: '/customers', label: 'Customers' }}
        title={c.name}
        meta={<CustomerStage stats={stats} />}
        subtitle={[c.code, c.phone1, c.district, c.source].filter(Boolean).join(' · ')}
        actions={
          <div className="actions">
            {valuations.length === 0 && <button className="btn danger" onClick={remove}>Delete</button>}
            <button className="btn" onClick={() => setModal('edit')}>Edit</button>
            <WhatsAppLink phone={c.phone1} name={c.name} variant="button" />
            {startButton}
          </div>
        }
      />

      {notice && (
        <div className="alert success">
          {notice.text} <Link to={`/valuations/${notice.id}`}>Open the sheet</Link>
        </div>
      )}
      {error && <div className="alert">{error}</div>}

      <div className="kpis">
        <div className="kpi"><div className="kpi-value">{properties.filter((g) => g.identified).length}</div><div className="kpi-label">Properties</div></div>
        <div className="kpi"><div className="kpi-value">{stats.total}</div><div className="kpi-label">Valuations</div></div>
        <div className="kpi tone-amber"><div className="kpi-value">{stats.open}</div><div className="kpi-label">In progress</div></div>
        <div className="kpi tone-green"><div className="kpi-value">{stats.approved}</div><div className="kpi-label">Approved</div></div>
        <div className="kpi"><div className="kpi-value">{stats.totalValue ? inr(stats.totalValue) : '—'}</div><div className="kpi-label">Total value</div></div>
      </div>

      <Segmented
        className="customer-tabs"
        label="Customer sections"
        options={[
          { value: 'profile', label: 'Profile' },
          { value: 'properties', label: 'Properties', badge: <span className="tab-num">{properties.filter((g) => g.identified).length}</span> },
          { value: 'sheets', label: 'Input sheets', badge: <span className="tab-num">{valuations.length}</span> },
          { value: 'reports', label: 'Reports', badge: <span className="tab-num">{reports.length}</span> },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'profile' && (
        <div className="grid-2">
          <section className="card">
            <h2>Contact details</h2>
            <dl className="kv">
              <Info label="Name">{[c.salutation, c.name].filter(Boolean).join(' ')}</Info>
              <Info label="Phone"><PhoneActions phone={c.phone1} name={c.name} /></Info>
              <Info label="Alternate phone">{c.phone2 && <PhoneActions phone={c.phone2} name={c.name} />}</Info>
              <Info label="Email">{c.email && <a href={`mailto:${c.email}`}>{c.email}</a>}</Info>
              <Info label="Address">{fullAddress(c)}</Info>
              <Info label="Relation">{[c.relation, c.relativeName].filter(Boolean).join(' ')}</Info>
              <Info label="Occupation">{c.occupation}</Info>
            </dl>
          </section>
          <section className="card">
            <h2>Valuation request</h2>
            <dl className="kv">
              <Info label="Bank">{c.bankName}</Info>
              <Info label="Branch">{c.branch}</Info>
              <Info label="Came via">{c.source}</Info>
              <Info label="Notes">{c.notes}</Info>
              <Info label="Added">{`${dateTime(c.createdAt)}${c.createdBy?.name ? ` by ${c.createdBy.name}` : ''}`}</Info>
            </dl>
          </section>
        </div>
      )}

      {['properties', 'sheets'].includes(tab) && valuations.length === 0 && (
        <div className="card empty">
          <div className="empty-icon"><DuoContact size={24} /></div>
          <strong>No valuations for {c.name} yet</strong>
          <p className="muted">Start one and assign it to an evaluator. Their details are filled into the input sheet automatically.</p>
          {startButton}
        </div>
      )}

      {tab === 'properties' && properties.map((g) => (
        <section className="card flush property-card" key={g.key}>
          <div className="card-head">
            <div className="property-head">
              <span className="property-icon" aria-hidden="true"><SectionIcon section={{ key: 'property' }} size={18} /></span>
              <div>
                <h2>{g.address}</h2>
                <p className="muted small">
                  {[...new Set([g.description, g.type].filter(Boolean))].concat(`${g.valuations.length} valuation${g.valuations.length === 1 ? '' : 's'}`).join(' · ')}
                </p>
              </div>
            </div>
            {g.identified && <button className="btn small" onClick={() => openAssign(g.latest._id)}><IconPlus size={14} /> Re-value</button>}
          </div>
          <ol className="property-history">
            {g.valuations.map((v, i) => {
              const prev = g.valuations[i - 1];
              const cur = v.summary?.fairMarketValue || 0;
              const before = prev?.summary?.fairMarketValue || 0;
              const pct = prev && before && cur ? Math.round(((cur - before) / before) * 1000) / 10 : null;
              return (
                <li key={v._id}>
                  <span className="ph-dot" aria-hidden="true" />
                  <div className="ph-main">
                    <strong>{v.referenceNo}</strong>
                    <small>{new Date(v.summary?.valuationDate || v.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · {v.evaluator?.name || 'Unassigned'}{i === 0 && g.valuations.length > 1 ? ' · first valuation' : ''}</small>
                  </div>
                  <div className="ph-value">
                    <strong>{fmv(v)}</strong>
                    {pct != null && pct !== 0 && <span className={`delta ${pct > 0 ? 'up' : 'down'}`}>{pct > 0 ? '▲' : '▼'} {Math.abs(pct)}%</span>}
                  </div>
                  <StatusBadge status={v.status} />
                  <div className="ph-actions">
                    <Link className="btn small" to={`/valuations/${v._id}`}>Sheet</Link>
                    <Link className="btn small" to={`/valuations/${v._id}/report`}>Report</Link>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      {tab === 'sheets' && valuations.map((v, i) => (
        <section className="card sheet-copy" key={v._id}>
          <div className="card-head">
            <div>
              <h2>{v.referenceNo} <StatusBadge status={v.status} /></h2>
              <p className="muted small">
                {propLabel[v._id]} · {REPORT_TEMPLATES[v.summary?.reportTemplate]?.title || 'Input sheet'} · {v.evaluator?.name || 'Unassigned'} · updated {timeAgo(v.updatedAt)}
              </p>
            </div>
            <div className="actions">
              <Link className="btn small" to={`/valuations/${v._id}/edit`}>Edit sheet</Link>
              <Link className="btn small" to={`/valuations/${v._id}`}>Open <IconChevron size={14} /></Link>
            </div>
          </div>
          <SheetSections data={v.data || {}} variant="accordion" openFirst={i === 0} />
        </section>
      ))}

      {tab === 'reports' && (
        <section className="card flush">
          <div className="card-head">
            <h2>Generated reports</h2>
            <Link className="btn small" style={{ marginTop: 0 }} to={`/reports/new?customer=${c._id}`}><IconPlus size={14} /> Generate report</Link>
          </div>
          {reports.length === 0 ? (
            <p className="muted card-empty">
              {stats.approved ? 'No reports generated yet. Use Generate report to create one from an approved input sheet.' : 'Reports can be generated once one of this customer\'s input sheets is approved.'}
            </p>
          ) : (
            <ul className="list">
              {reports.map((r) => (
                <li key={r._id}>
                  <Link to={`/reports/${r._id}`} className="list-item">
                    <span className="list-main">
                      <strong>{r.reportNo} · v{r.version}</strong>
                      <small>{r.snapshot?.referenceNo} · {r.propertyAddress || r.templateTitle} · {timeAgo(r.createdAt)}{r.generatedBy?.name ? ` by ${r.generatedBy.name}` : ''}</small>
                    </span>
                    <span className="list-end">
                      <strong className="amount">{r.fairMarketValue > 0 ? inr(r.fairMarketValue) : '—'}</strong>
                      <span className="badge" title={r.templateTitle}>{r.reportTemplate}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {modal === 'edit' && (
        <CustomerFormModal
          customer={c}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load(); }}
        />
      )}
      {modal === 'assign' && (
        <AssignValuationModal
          customer={c}
          properties={properties}
          initialFrom={assignFrom}
          onClose={() => setModal(null)}
          onAssigned={(r) => {
            setModal(null);
            setNotice({ id: r._id, text: `Valuation ${r.referenceNo} created and assigned to ${r.evaluator.name}.` });
            setTab('sheets');
            load();
          }}
        />
      )}
    </div>
  );
}
