import { useEffect } from 'react';

export default function Modal({ title, onClose, children, footer }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose && <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// Shows a one-time temporary password with a copy button
export function TempPasswordNotice({ email, password }) {
  const copy = () => navigator.clipboard?.writeText(`Email: ${email}\nTemporary password: ${password}`);
  return (
    <div className="temp-pass">
      <p className="muted">Share these sign-in details with the user. The password is shown <strong>only once</strong>; they will be asked to set their own on first sign-in.</p>
      <div className="temp-pass-box">
        <div><small className="muted">Email</small><strong>{email}</strong></div>
        <div><small className="muted">Temporary password</small><code>{password}</code></div>
      </div>
      <button type="button" className="btn block" onClick={copy}>Copy details</button>
    </div>
  );
}
