import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { inr } from '../components/StatusBadge.jsx';
import { initials } from '../components/Layout.jsx';
import PageHeader from '../components/PageHeader.jsx';
import TableSkeleton from '../components/TableSkeleton.jsx';
import { DuoContact } from '../components/DuoIcons.jsx';
import { IconChevron, IconPlus, IconSearch } from '../components/Icons.jsx';
import SearchBox from '../components/SearchBox.jsx';
import MoreFilters from '../components/MoreFilters.jsx';
import Segmented from '../components/Segmented.jsx';
import PeriodPicker from '../components/PeriodPicker.jsx';
import Pager, { ResultCount } from '../components/Pager.jsx';
import useListParams from '../utils/useListParams.js';
import { CustomerFormModal } from '../components/CustomerDialogs.jsx';
import { WhatsAppLink } from '../components/CustomerContact.jsx';
import Fab from '../components/Fab.jsx';
import { timeAgo, dateTime } from '../utils/format.js';

// where a customer stands, from their valuations
export function customerStage(stats = {}) {
  if (!stats.total) return { key: 'new', label: 'New enquiry', cls: 'status-draft' };
  if (stats.open > 0) return { key: 'open', label: 'In progress', cls: 'status-submitted' };
  return { key: 'done', label: 'Completed', cls: 'status-approved' };
}
export const CustomerStage = ({ stats }) => {
  const s = customerStage(stats);
  return <span className={`status ${s.cls}`}><span className="dot" />{s.label}</span>;
};
const DEFAULTS = { q: '', stage: '', source: '', bank: '', district: '', period: 'all', start: '', end: '', sort: 'updated', dir: 'desc', limit: '20', page: '1' };
// [value, label, count key, short label on phones]
const STAGE_TABS = [['', 'All', 'all', 'All'], ['new', 'New enquiry', 'new', 'New'], ['open', 'In progress', 'open', 'Active'], ['done', 'Completed', 'done', 'Done']];
const SORT_OPTIONS = [['updated:desc', 'Recently updated'], ['created:desc', 'Newest customers'], ['created:asc', 'Oldest customers'], ['name:asc', 'Name (A–Z)'], ['name:desc', 'Name (Z–A)']];
const address = (c) => [c.locality, c.district].filter(Boolean).join(', ');

export default function Customers() {
  const navigate = useNavigate();
  const { params, query, update, filtered, clear, apiQuery } = useListParams(DEFAULTS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState('');

  const load = () => {
    setLoading(true);
    return api.listCustomers(apiQuery())
      .then((d) => { setData(d); setError(''); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params]);

  const runImport = async () => {
    setImporting(true);
    try {
      const r = await api.importCustomers();
      setNotice(`Created ${r.created} customer${r.created === 1 ? '' : 's'} from ${r.linked} existing input sheet${r.linked === 1 ? '' : 's'}.`);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
    }
  };

  const items = data?.items || [];
  const facets = data?.facets || {};
  const stages = data?.stages || {};
  return (
    <div className="page">
      <PageHeader
        icon={DuoContact}
        title="Customers"
        actions={(
          <div className="lp-head">
            <SearchBox value={query.q} onSearch={(q) => update({ q }, { replace: true })} label="Search customers" placeholder="Search name, phone, email, locality, district, bank…" />
            <button className="btn primary desktop-only" onClick={() => setAdding(true)}><IconPlus size={16} /> Add customer</button>
          </div>
        )}
      />
      <Fab label="Add customer" onClick={() => setAdding(true)} />

      {notice && <div className="alert success">{notice}</div>}
      {error && <div className="alert">{error}</div>}

      <div className={`card flush list-card lp-card${loading && data ? ' is-loading' : ''}`}>
        <div className="card-toolbar">
          <div className="toolbar lp-toolbar">
            <Segmented
              label="Stage"
              className="lp-status"
              options={STAGE_TABS.map(([value, label, key, short]) => ({ value, label: <><span className="lbl-long">{label}</span><span className="lbl-short">{short}</span></>, badge: data && <span className="tab-num">{stages[key] ?? 0}</span> }))}
              value={query.stage}
              onChange={(stage) => update({ stage }, { replace: true })}
            />
            <MoreFilters active={[query.period !== 'all', query.source, query.bank, query.district].filter(Boolean).length}>
              <PeriodPicker value={query} onChange={(p) => update({ period: p.period, start: p.start, end: p.end })} />
              <select className="select-pill" aria-label="Source" value={query.source} onChange={(e) => update({ source: e.target.value })}>
                <option value="">All sources</option>
                {(data?.sources || []).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {(facets.banks?.length > 1 || query.bank) && (
                <select className="select-pill" aria-label="Bank" value={query.bank} onChange={(e) => update({ bank: e.target.value })}>
                  <option value="">All banks</option>
                  {(facets.banks || []).map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              {(facets.districts?.length > 1 || query.district) && (
                <select className="select-pill" aria-label="District" value={query.district} onChange={(e) => update({ district: e.target.value })}>
                  <option value="">All districts</option>
                  {(facets.districts || []).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              )}
            </MoreFilters>
            <select className="select-pill" aria-label="Sort by" value={`${query.sort}:${query.dir}`} onChange={(e) => { const [sort, dir] = e.target.value.split(':'); update({ sort, dir }); }}>
              {SORT_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>

        {data && items.length === 0 ? (
          <div className="empty">
            <div className="empty-icon"><DuoContact size={24} /></div>
            {filtered ? (
              <>
                <strong>{query.q ? <>No customers match “{query.q}”</> : 'No customers match these filters'}</strong>
                <p className="muted">Try a different name, phone number, stage, source or period.</p>
                <button type="button" className="btn" onClick={clear}>Clear filters</button>
              </>
            ) : data.unlinkedValuations > 0 ? (
              <>
                <strong>Bring in your existing customers</strong>
                <p className="muted">{data.unlinkedValuations} input sheet{data.unlinkedValuations === 1 ? '' : 's'} already exist. Create customer records from their applicant details (grouped by phone number).</p>
                <button className="btn primary" onClick={runImport} disabled={importing}>{importing ? 'Importing…' : 'Import from existing input sheets'}</button>
              </>
            ) : (
              <>
                <strong>No customers yet</strong>
                <p className="muted">When someone asks for a valuation, add them here and assign an input sheet to an evaluator.</p>
                <button className="btn primary" onClick={() => setAdding(true)}><IconPlus size={16} /> Add customer</button>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap desktop-only">
              <table className="table list-table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th className="col-opt">Location</th>
                    <th className="col-opt2">Bank</th>
                    <th className="num">Input sheets</th>
                    <th className="num col-opt">Total value</th>
                    <th>Status</th>
                    <th className="col-opt">Last activity</th>
                    <th className="col-go"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody>
                  {!data && <TableSkeleton cols={8} />}
                  {items.map((c) => (
                    <tr key={c._id} className="clickable" onClick={() => navigate(`/customers/${c._id}`)}>
                      <td>
                        <div className="cell-person">
                          <span className="avatar soft sm">{initials(c.name)}</span>
                          <span>
                            <span className="name-line"><Link to={`/customers/${c._id}`} onClick={(e) => e.stopPropagation()}><strong>{c.name}</strong></Link>{c.code && <span className="id-code id-inline">{c.code}</span>}</span>
                            <small className="muted block cell-phone">{c.phone1}{c.phone1 && <WhatsAppLink phone={c.phone1} name={c.name} variant="icon" />}{c.email ? <>&nbsp;· {c.email}</> : ''}</small>
                          </span>
                        </div>
                      </td>
                      <td className="col-opt">{address(c) || '—'}</td>
                      <td className="col-opt2">{c.bankName || '—'}<small className="muted block">{c.branch}</small></td>
                      <td className="num"><strong>{c.stats.total}</strong>{c.stats.total > 0 && <small className="muted block nowrap">{c.stats.properties} propert{c.stats.properties === 1 ? 'y' : 'ies'} · {c.stats.approved} approved</small>}</td>
                      <td className="num col-opt">{c.stats.totalValue > 0 ? inr(c.stats.totalValue) : '—'}</td>
                      <td><CustomerStage stats={c.stats} /></td>
                      <td className="muted nowrap col-opt" title={dateTime(c.stats.lastAt || c.updatedAt)}>{timeAgo(c.stats.lastAt || c.updatedAt)}</td>
                      <td className="col-go" aria-hidden="true"><IconChevron size={16} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="list mobile-only">
              {items.map((c) => (
                <li key={c._id}>
                  <Link to={`/customers/${c._id}`} className="list-item">
                    <span className="avatar soft">{initials(c.name)}</span>
                    <span className="list-main">
                      <strong>{c.name}</strong>
                      <small>{[c.code, c.phone1, c.district].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="list-end">
                      <span className="list-end-row"><WhatsAppLink phone={c.phone1} name={c.name} variant="icon" /><small className="muted">{c.stats.total} input sheet{c.stats.total === 1 ? '' : 's'}</small></span>
                      <CustomerStage stats={c.stats} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <Pager className="lp-pager" data={data} limit={query.limit} onChange={update} summary={<ResultCount data={data} limit={query.limit} filtered={filtered} onClear={clear} noun="" />} />
          </>
        )}
      </div>

      {adding && (
        <CustomerFormModal
          onClose={() => setAdding(false)}
          onSaved={(c) => { setAdding(false); navigate(`/customers/${c._id}`); }}
        />
      )}
    </div>
  );
}
