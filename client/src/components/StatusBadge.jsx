const LABELS = { draft: 'Draft', submitted: 'In review', approved: 'Approved', rejected: 'Rejected' };

export default function StatusBadge({ status }) {
  return (
    <span className={`status status-${status}`}>
      <span className="dot" />
      {LABELS[status] || status}
    </span>
  );
}

export const inr = (n) =>
  n == null || n === '' || Number.isNaN(Number(n))
    ? '—'
    : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
