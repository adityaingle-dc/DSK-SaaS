import { useMemo } from 'react';
import { emptyValuation, getContext, sectionPath, visibleSections } from '@dsk/shared';
import SchemaSection from './SchemaForm.jsx';
import SectionIcon from './SectionIcons.jsx';
import { IconChevronDown } from './Icons.jsx';

// saved sheet data merged over an empty sheet, so every section/field exists for the form
export function hydrate(saved = {}) {
  const base = emptyValuation();
  for (const [path, values] of Object.entries(saved || {})) base[path] = { ...(base[path] || {}), ...values };
  return base;
}

// The input sheet as collapsible sections with the normal form fields (used inline, e.g. Reports → Generate, step 4).
//   data      – hydrated sheet data
//   onChange  – (sectionPath, key, value)
//   errors    – { 'general.bankName': 'message', … }
export default function SheetEditor({ data, onChange, errors = {} }) {
  const ctx = useMemo(() => getContext(data), [data]);
  const sections = useMemo(() => visibleSections(ctx, data), [ctx, data]);
  const countErrors = (s) => {
    const p = sectionPath(s);
    return Object.keys(errors).filter((f) => f.startsWith(`${p}.`) && s.fields.some((x) => f.startsWith(`${p}.${x.key}`))).length;
  };

  return (
    <div className="sheet-accordion sheet-editor">
      {sections.map((s, i) => {
        const path = sectionPath(s);
        const n = countErrors(s);
        return (
          <details key={s.key} open={i === 0 || n > 0}>
            <summary>
              <span className="sa-icon"><SectionIcon section={s} size={16} /></span>
              <strong>{s.title}</strong>
              {n > 0 && <span className="sa-errors">{n} to fix</span>}
              <IconChevronDown size={16} className="sa-caret" />
            </summary>
            <div className="sa-body">
              <SchemaSection section={s} path={path} values={data[path]} onChange={(k, v) => onChange(path, k, v)} errors={errors} ctx={ctx} data={data} />
            </div>
          </details>
        );
      })}
    </div>
  );
}
