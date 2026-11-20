// input sheet: draft → submitted → received (the superadmin opened it) → completed (report generated, locked);
// rejected = sent back to the evaluator with a note
export const STATUS_LABELS = { draft: 'Draft', submitted: 'In review', received: 'Received', approved: 'Completed', rejected: 'Sent back' };

export default function StatusBadge({ status, label }) {
  return (
    <span className={`status status-${status}`}>
      <span className="dot" />
      {label || STATUS_LABELS[status] || status}
    </span>
  );
}

export const inr = (n) =>
  n == null || n === '' || Number.isNaN(Number(n))
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
