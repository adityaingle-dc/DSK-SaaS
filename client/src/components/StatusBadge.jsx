import { STATUS_HELP, STATUS_LABELS } from '@dsk/shared';

// the job workflow (see @dsk/shared workflow.js)
export { STATUS_LABELS };

export default function StatusBadge({ status, label }) {
  return (
    <span className={`status status-${status}`} title={STATUS_HELP[status]}>
      <span className="dot" />
      {label || STATUS_LABELS[status] || status}
    </span>
  );
}

export const inr = (n) =>
  n == null || n === '' || Number.isNaN(Number(n))
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
