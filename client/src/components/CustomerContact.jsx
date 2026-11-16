import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { IconPhone, IconWhatsApp } from './Icons.jsx';

// Customer contact details shared with whoever works on a valuation (evaluators get only their own jobs)
const address = (c) => [c.houseNo, c.street, c.locality, c.district, c.pincode].filter(Boolean).join(', ');

// wa.me needs the full international number without "+": 10-digit Indian mobiles get 91 in front
export function whatsappNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = `91${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}
export function whatsappUrl(phone, name) {
  const n = whatsappNumber(phone);
  if (!n) return null;
  const first = String(name || '').trim().split(/\s+/)[0];
  const text = `Hello${first ? ` ${first}` : ''}, this is DSKRISHNA regarding your property valuation.`;
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

// WhatsApp chat with the customer (opens WhatsApp / WhatsApp Web with a greeting typed in, nothing is sent automatically)
// variant: "chip" (next to a phone number) · "button" (page header) · "icon" (icon only, in list rows)
export function WhatsAppLink({ phone, name, variant = 'chip', label = 'WhatsApp' }) {
  const url = whatsappUrl(phone, name);
  if (!url) return null;
  const cls = { chip: 'wa-chip', button: 'btn wa-btn', icon: 'wa-icon' }[variant];
  if (variant === 'icon') {
    // icon-only version sits inside clickable rows / list links, so it's a button (no link inside a link)
    return (
      <button
        type="button"
        className={cls}
        aria-label={`WhatsApp ${name || phone}`}
        title={`WhatsApp ${phone}`}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); window.open(url, '_blank', 'noopener,noreferrer'); }}
      >
        <IconWhatsApp size={14} />
      </button>
    );
  }
  return (
    <a className={cls} href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label={`WhatsApp ${name || phone}`} title={`WhatsApp ${phone}`}>
      <IconWhatsApp size={variant === 'button' ? 16 : 14} />{variant !== 'icon' && <span>{label}</span>}
    </a>
  );
}

// phone number with Call + WhatsApp side by side
export function PhoneActions({ phone, name }) {
  if (!phone) return null;
  return <span className="phone-actions"><CallLink phone={phone} /><WhatsAppLink phone={phone} name={name} /></span>;
}

export function CallLink({ phone, className = 'call-link' }) {
  if (!phone) return null;
  return <a className={className} href={`tel:${phone}`} onClick={(e) => e.stopPropagation()}><IconPhone size={14} /> {phone}</a>;
}

// full card (valuation page, expanded task)
export default function CustomerContactCard({ customer: c, title = 'Customer', bare = false }) {
  const { isSuperadmin } = useAuth();
  if (!c) return null;
  const rows = [
    ['Name', [c.salutation, c.name].filter(Boolean).join(' ')],
    ['Phone', c.phone1 && <PhoneActions phone={c.phone1} name={c.name} />],
    ['Alternate phone', c.phone2 && <PhoneActions phone={c.phone2} name={c.name} />],
    ['Email', c.email && <a href={`mailto:${c.email}`}>{c.email}</a>],
    ['Address', address(c)],
    ['Bank', [c.bankName, c.branch].filter(Boolean).join(' · ')],
  ].filter(([, v]) => v);
  const body = (
    <>
      {c.notes && <p className="contact-note"><strong>Note from the superadmin:</strong> {c.notes}</p>}
      <dl className="kv contact-kv">
        {rows.map(([k, v]) => (
          <div className="kv-row" key={k}><dt>{k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </>
  );
  if (bare) return <div className="contact-bare">{body}</div>;
  return (
    <section className="card contact-card">
      <div className="card-head">
        <h2>{title}</h2>
        {isSuperadmin && c._id && <Link to={`/customers/${c._id}`} className="link-sm">Open customer</Link>}
      </div>
      {body}
    </section>
  );
}

// one line for page headers: name · call · note
export function CustomerInline({ customer: c }) {
  if (!c) return null;
  return (
    <span className="customer-inline">
      For <strong>{c.name}</strong>
      {c.phone1 && <> · <CallLink phone={c.phone1} /> <WhatsAppLink phone={c.phone1} name={c.name} /></>}
      {c.notes && <span className="customer-inline-note"> · {c.notes}</span>}
    </span>
  );
}
