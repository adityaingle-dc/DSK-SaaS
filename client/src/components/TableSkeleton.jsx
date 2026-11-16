// Placeholder rows shown while a table's data loads (keeps the layout from jumping)
export default function TableSkeleton({ cols, rows = 6 }) {
  return Array.from({ length: rows }, (_, i) => (
    <tr key={i} className="skeleton-row" aria-hidden="true">
      {Array.from({ length: cols }, (_, j) => (
        <td key={j}><span className="skeleton" style={{ width: j === 0 ? '70%' : '55%' }} /></td>
      ))}
    </tr>
  ));
}
