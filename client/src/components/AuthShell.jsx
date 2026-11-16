import Brand from './Brand.jsx';
import PoweredBy from './PoweredBy.jsx';
import { IconCheck, IconKey, IconShield, IconTick } from './Icons.jsx';

// Sign-in / sign-up frame: a quiet form column on the left, a product panel on the right.
// The panel's numbers are an illustrative sample of a valuation summary (decorative, hidden from screen readers).
function ValuationPreview() {
  return (
    <div className="ap-stage" aria-hidden="true">
      <div className="ap-card">
        <div className="ap-card-head">
          <span className="ap-ref">Valuation · Sample</span>
          <span className="ap-chip"><IconTick size={12} strokeWidth={2.6} /> Approved</span>
        </div>
        <span className="ap-label">Fair market value</span>
        <strong className="ap-value">₹2,06,40,000</strong>
        <div className="ap-split">
          <div><span>Realizable</span><b>₹1,85,76,000</b></div>
          <div><span>Distress</span><b>₹1,65,12,000</b></div>
        </div>
        <div className="ap-bars">
          <div className="ap-bar-row"><span>Land</span><i style={{ '--w': '62%' }} /><b>62%</b></div>
          <div className="ap-bar-row"><span>Building</span><i style={{ '--w': '31%' }} /><b>31%</b></div>
          <div className="ap-bar-row"><span>Amenities</span><i style={{ '--w': '7%' }} /><b>7%</b></div>
        </div>
        <div className="ap-card-foot">
          <span className="ap-avatar">EV</span>
          <span className="ap-who"><b>Field evaluator</b><small>Site visit · photos · documents</small></span>
          <span className="ap-verified"><IconCheck size={15} /></span>
        </div>
      </div>
      <div className="ap-toast">
        <span className="ap-toast-icon"><IconTick size={14} strokeWidth={2.6} /></span>
        <span><b>Bank report generated</b><small>A4 · frozen copy stored</small></span>
      </div>
    </div>
  );
}

export default function AuthShell({ title, subtitle, eyebrow, children }) {
  const year = new Date().getFullYear();
  return (
    <div className="auth">
      <main className="auth-main">
        <header className="auth-top">
          <Brand height={22} caption={null} />
        </header>

        <div className="auth-body">
          <div className="auth-form">
            {eyebrow && <span className="auth-eyebrow">{eyebrow}</span>}
            <h1>{title}</h1>
            {subtitle && <p className="auth-sub">{subtitle}</p>}
            {children}
          </div>
        </div>

        <footer className="auth-bottom">
          <span>© {year} DSKRISHNA · Authorised personnel only</span>
          <span className="auth-secure"><IconKey size={13} /> Encrypted · audit-logged</span>
          <PoweredBy className="auth-powered" />
        </footer>
      </main>

      <aside className="auth-aside" aria-label="About DSKRISHNA">
        <span className="auth-aside-top">Property valuation platform</span>

        <ValuationPreview />

        <div className="auth-aside-copy">
          <h2>Valuations your bank can sign off on.</h2>
          <p>Site inspection, live calculation, review and a bank-ready report in one secure workspace.</p>
          <ul className="auth-points">
            <li><IconShield size={15} /> Role-based access</li>
            <li><IconCheck size={15} /> Two-step review</li>
            <li><IconKey size={15} /> Full audit trail</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}
