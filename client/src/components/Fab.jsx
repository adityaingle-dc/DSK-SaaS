import { Link } from 'react-router-dom';
import { IconPlus } from './Icons.jsx';

// Phones only: floating "+" for a list page's main create action (sits above the tab bar).
// Desktop keeps the normal button in the page header.
export default function Fab({ to, onClick, label }) {
  const content = <IconPlus size={26} />;
  return to ? (
    <Link to={to} className="fab-float" aria-label={label} title={label}>{content}</Link>
  ) : (
    <button type="button" className="fab-float" aria-label={label} title={label} onClick={onClick}>{content}</button>
  );
}
