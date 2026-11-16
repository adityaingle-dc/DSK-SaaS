import { Link, useLocation, useNavigate } from 'react-router-dom';
import { IconChevronLeft } from './Icons.jsx';

// "Back" that returns to wherever the user actually came from (browser history).
// If the page was opened directly (bookmark, shared link, refresh as first page), there is no
// in-app history, so it falls back to the parent page given in `to`.
export default function BackLink({ to, label, className = 'page-back' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const hasHistory = location.key !== 'default';
  return (
    <Link
      to={to}
      className={className}
      onClick={(e) => {
        if (!hasHistory || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // open-in-new-tab keeps the plain link
        e.preventDefault();
        navigate(-1);
      }}
    >
      <IconChevronLeft size={15} /> {hasHistory ? 'Back' : label}
    </Link>
  );
}
