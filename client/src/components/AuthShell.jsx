import { IconBolt, IconShield, IconBuilding, Logo } from './Icons.jsx';

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth">
      <section className="auth-hero">
        <div className="brand light"><Logo size={38} /><span><strong>DSK</strong> Valuations</span></div>
        <div className="auth-hero-body">
          <h2>Bank-grade property valuations, from site visit to sign-off.</h2>
          <ul className="auth-points">
            <li><span><IconBuilding size={18} /></span>Land, building & flat valuations in one input sheet</li>
            <li><span><IconBolt size={18} /></span>Live FMV, realizable & distress values as you type</li>
            <li><span><IconShield size={18} /></span>Validated, reviewed and approved – with a full trail</li>
          </ul>
        </div>
        <div className="auth-hero-card">
          <small>Fair market value</small>
          <strong>₹20,93,000</strong>
          <span>Rupees Twenty Lakh Ninety Three Thousand Only</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="auth-form">
          <div className="brand mobile-only"><Logo /><span><strong>DSK</strong> Valuations</span></div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
          {children}
        </div>
      </section>
    </div>
  );
}
