import { getContext, sectionPath, visibleSections } from '@dsk/shared';
import { inr } from './StatusBadge.jsx';
import { FileThumb } from './FilesInput.jsx';
import SectionIcon from './SectionIcons.jsx';
import { IconChevronDown } from './Icons.jsx';

// Read-only view of a valuation input sheet (used on the valuation page and the customer page)

export const isEmpty = (v) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.values(v).some((x) => !isEmpty(x)));

export function display(field, v) {
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
        <span className="latlon-view">
          {v.lat !== undefined && (
            <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${v.lat},${v.lon}`}>
              {v.lat}, {v.lon}
            </a>
          )}
          {v.boundary?.length > 0 && (
            <small className="muted block">
              Boundary: {v.boundary.length} points
              {v.areaSqm ? ` · ≈ ${Math.round(v.areaSqm * 10.7639).toLocaleString('en-IN')} sq.ft (${Math.round(v.areaSqm * 1.19599).toLocaleString('en-IN')} sq.yd)` : ''}
            </small>
          )}
        </span>
      );
    case 'table':
      return (
        <table className="table small stack-sm">
          <thead><tr>{field.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>{v.map((row, i) => <tr key={i}>{field.columns.map((c) => <td key={c.key} data-label={c.label}>{isEmpty(row[c.key]) ? '—' : display(c, row[c.key])}</td>)}</tr>)}</tbody>
        </table>
      );
    case 'grid':
      return (
        <table className="table small stack-sm">
          <thead><tr><th />{field.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr></thead>
          <tbody>{field.rows.map((r) => <tr key={r}><th scope="row">{r}</th>{field.columns.map((c) => <td key={c.key} data-label={c.label}>{v[r.toLowerCase()]?.[c.key] || '—'}</td>)}</tr>)}</tbody>
        </table>
      );
    case 'tiers':
      return (
        <ul className="plain">
          {field.items.filter((i) => v[i.key]).map((i) => (
            <li key={i.key}>{i.label}: ₹{i.ranges?.[v[i.key].tier - 1] || field.tiers[v[i.key].tier]}{i.unit && v[i.key].qty ? ` × ${v[i.key].qty} ${i.unit}` : ''}{v[i.key].amount !== undefined ? ` · ${inr(v[i.key].amount)}` : ''}</li>
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

// filled sections of a sheet: [{ section, fields: [{ field, value }] }]
export function filledSections(data = {}) {
  const ctx = getContext(data);
  return visibleSections(ctx, data)
    .map((s) => {
      const values = data[sectionPath(s)] || {};
      const fields = s.fields.filter((f) => !isEmpty(values[f.key]) && (!f.when || f.when(ctx, data))).map((f) => ({ field: f, value: values[f.key] }));
      return { section: s, fields };
    })
    .filter((x) => x.fields.length);
}

const KV = ({ fields }) => (
  <dl className="kv">
    {fields.map(({ field, value }) => (
      <div className={`kv-row${['table', 'grid', 'tiers'].includes(field.type) ? ' wide' : ''}`} key={field.key}>
        <dt>{field.label}</dt>
        <dd>{display(field, value)}</dd>
      </div>
    ))}
  </dl>
);

// variant "cards": one card per section (valuation page)
// variant "accordion": collapsible sections inside one card (customer page)
export default function SheetSections({ data, variant = 'cards', openFirst = true }) {
  const list = filledSections(data);
  if (!list.length) return <p className="muted">Nothing has been filled in on this sheet yet.</p>;
  if (variant === 'accordion') {
    return (
      <div className="sheet-accordion">
        {list.map(({ section, fields }, i) => (
          <details key={section.key} open={openFirst && i === 0}>
            <summary>
              <span className="sa-icon"><SectionIcon section={section} size={16} /></span>
              <strong>{section.title}</strong>
              <span className="sa-count">{fields.length} {fields.length === 1 ? 'field' : 'fields'}</span>
              <IconChevronDown size={16} className="sa-caret" />
            </summary>
            <div className="sa-body"><KV fields={fields} /></div>
          </details>
        ))}
      </div>
    );
  }
  return list.map(({ section, fields }) => (
    <section className="card" key={section.key}>
      <h2>{section.title}</h2>
      <KV fields={fields} />
    </section>
  ));
}
