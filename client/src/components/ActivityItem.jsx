import { Link } from 'react-router-dom';
import { dateTime, device, timeAgo } from '../utils/format.js';
import { inr } from './StatusBadge.jsx';
import { IconCheck, IconDraft, IconLogout, IconShield, IconUser, IconX, IconBolt, IconList } from './Icons.jsx';

const LOOK = {
  'auth.login': ['blue', IconLogout, 'Signed in'],
  'auth.login_failed': ['red', IconShield, 'Failed sign-in'],
  'auth.register': ['slate', IconUser, 'Registered'],
  'auth.password_changed': ['slate', IconShield, 'Password changed'],
  'valuation.created': ['blue', IconDraft, 'Created'],
  'valuation.updated': ['slate', IconDraft, 'Saved'],
  'valuation.submitted': ['amber', IconBolt, 'Submitted'],
  'valuation.approved': ['green', IconCheck, 'Approved'],
  'valuation.rejected': ['red', IconX, 'Rejected'],
  'valuation.deleted': ['red', IconX, 'Deleted'],
  'valuation.report_edited': ['blue', IconDraft, 'Report edited'],
  'file.uploaded': ['slate', IconList, 'Uploaded file'],
  'file.deleted': ['slate', IconList, 'Deleted file'],
  'user.created': ['blue', IconUser, 'User created'],
  'user.updated': ['slate', IconUser, 'User updated'],
  'user.approved': ['green', IconUser, 'User approved'],
  'user.disabled': ['red', IconUser, 'User disabled'],
  'user.enabled': ['green', IconUser, 'User re-enabled'],
  'user.password_reset': ['amber', IconShield, 'Password reset'],
};

export const actionLabel = (a) => LOOK[a]?.[2] || a;

export default function ActivityItem({ item, showActor = true }) {
  const [tone, Icon] = LOOK[item.action] || ['slate', IconBolt];
  const link =
    item.entityType === 'valuation' && item.action !== 'valuation.deleted' ? `/valuations/${item.entityId}`
      : item.entityType === 'user' ? `/team/${item.entityId}` : null;
  const body = (
    <>
      <span className={`act-icon tone-${tone}`}><Icon size={17} /></span>
      <span className="act-main">
        <span className="act-summary">
          {/* some summaries already start with the actor ("Sita signed in") – don't print the name twice */}
          {showActor && item.actorName && !item.summary?.startsWith(item.actorName) && <strong>{item.actorName} </strong>}
          <span>{item.summary || actionLabel(item.action)}</span>
        </span>
        <small className="muted">
          {timeAgo(item.createdAt)} · {dateTime(item.createdAt)}
          {item.ip && ` · ${item.ip}`}
          {item.userAgent && ` · ${device(item.userAgent)}`}
        </small>
      </span>
      {item.meta?.fairMarketValue > 0 && <span className="amount act-amount">{inr(item.meta.fairMarketValue)}</span>}
    </>
  );
  return link ? <Link to={link} className="act-item">{body}</Link> : <div className="act-item">{body}</div>;
}
