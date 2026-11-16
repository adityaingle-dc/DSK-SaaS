import { IconBolt, IconCheck, IconKey, IconPulse, IconShield, Logo } from './Icons.jsx';
import SectionIcon from './SectionIcons.jsx';

// How a valuation moves through the system (shown on the sign-in screen)
const STEPS = [
  { icon: <SectionIcon section={{ key: 'property' }} size={18} />, title: 'Site inspection', text: 'Capture land, building, documents and photos on site' },
  { icon: <IconBolt size={18} />, title: 'Live calculation', text: 'Fair market, realizable and distress values as you type' },
  { icon: <IconCheck size={18} />, title: 'Review & approval', text: 'Valuers approve or return sheets with notes' },
  { icon: <SectionIcon section={{ key: 'documents' }} size={18} />, title: 'Bank-ready report', text: 'Print-perfect A4 report, signed off and audit-logged' },
];

export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="auth">
      <section className="auth-hero" aria-label="About DSK Valuations">
        {/* faint dot grid for texture (solid dots, no gradients) */}
        <svg className="auth-pattern" viewBox="0 0 360 360" aria-hidden="true">
          <defs>
            <pattern id="auth-dots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.4" />
            </pattern>
          </defs>
          <rect width="360" height="360" fill="url(#auth-dots)" />
        </svg>

        <div className="brand light">
          <Logo size={38} />
          <span className="brand-text"><span><strong>DSK</strong> Valuations</span><small>Valuation desk</small></span>
        </div>

        <div className="auth-hero-body">
          <span className="auth-eyebrow">Property valuation platform</span>
          <h2>Bank-grade property valuations, from site visit to sign-off.</h2>
          <p className="auth-lede">One secure workspace for field evaluators, valuers and reviewers.</p>

          <ol className="auth-steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="auth-step-icon" aria-hidden="true">{s.icon}</span>
                <span className="auth-step-text">
                  <strong><span className="auth-step-n">0{i + 1}</span>{s.title}</strong>
                  <small>{s.text}</small>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="auth-hero-foot">
          <div className="auth-trust">
            <span><IconKey size={14} /> Encrypted sign-in</span>
            <span><IconShield size={14} /> Role-based access</span>
            <span><IconPulse size={14} /> Full audit trail</span>
          </div>
          <small>© {new Date().getFullYear()} DSK Valuations</small>
        </div>
      </section>

      <section className="auth-panel">
        <div>
          <div className="auth-form">
            <div className="brand mobile-only"><Logo /><span><strong>DSK</strong> Valuations</span></div>
            <h1>{title}</h1>
            {subtitle && <p className="muted">{subtitle}</p>}
            {children}
          </div>
          <p className="auth-foot">Authorised personnel only. Activity on this system is monitored.</p>
        </div>
      </section>
    </div>
  );
}
