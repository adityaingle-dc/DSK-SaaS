import BackLink from './BackLink.jsx';

// One heading pattern for every page:
//   back link (detail pages) or eyebrow (top-level pages)
//   [icon]  Title  [meta badges]                         [actions]
//           subtitle                                     [corner]
export default function PageHeader({ icon: Icon, back, eyebrow, title, meta, subtitle, actions, corner }) {
  return (
    <header className="page-header">
      <div className="page-header-main">
        {back ? (
          <BackLink to={back.to} label={back.label} exact={back.exact} />
        ) : (
          eyebrow && <div className="page-eyebrow">{eyebrow}</div>
        )}
        <div className="page-title-row">
          {Icon && <span className="page-icon" aria-hidden="true"><Icon size={22} /></span>}
          <div className="page-title-text">
            <h1>
              <span>{title}</span>
              {meta && <span className="page-meta">{meta}</span>}
            </h1>
            {subtitle && <p className="page-subtitle">{subtitle}</p>}
          </div>
          {corner && <div className="page-corner">{corner}</div>}
        </div>
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
