// In-app replacement for the browser's confirm() / alert() boxes.
//   if (!(await confirmDialog({ title: 'Delete customer?', message: '…', confirmLabel: 'Delete', tone: 'danger' }))) return;
//   await alertDialog({ title: "Couldn't open the file", message: err.message });
// <ConfirmHost /> is mounted once (main.jsx) and shows one dialog at a time.
import { useEffect, useRef, useState } from 'react';
import { IconAlert, IconTrash } from './Icons.jsx';

let show = null; // set by the mounted host
const queue = [];

function open(opts) {
  return new Promise((resolve) => {
    const req = { ...opts, resolve };
    if (show) show(req);
    else queue.push(req); // host not mounted yet (very early call)
  });
}

export const confirmDialog = (opts = {}) => open({ kind: 'confirm', ...opts });
export const alertDialog = (opts = {}) => open({ kind: 'alert', ...opts }).then(() => undefined);

export function ConfirmHost() {
  const [req, setReq] = useState(null);
  const okRef = useRef(null);
  const cancelRef = useRef(null);

  useEffect(() => {
    show = (r) => setReq((cur) => {
      if (cur) { queue.push(r); return cur; }
      return r;
    });
    if (queue.length) setReq(queue.shift());
    return () => { show = null; };
  }, []);

  const close = (value) => {
    req?.resolve(value);
    setReq(queue.length ? queue.shift() : null);
  };

  useEffect(() => {
    if (!req) return undefined;
    const prevFocus = document.activeElement;
    // dangerous actions focus Cancel, so Enter doesn't delete by accident
    (req.tone === 'danger' && req.kind === 'confirm' ? cancelRef : okRef).current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(false); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); prevFocus?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);

  if (!req) return null;
  const danger = req.tone === 'danger';
  const isAlert = req.kind === 'alert';
  return (
    <div className="cd-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className={`cd${danger ? ' danger' : ''}`} role={isAlert ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="cd-title" aria-describedby={req.message ? 'cd-msg' : undefined}>
        <div className="cd-icon" aria-hidden="true">{req.icon === 'trash' ? <IconTrash size={22} /> : <IconAlert size={22} />}</div>
        <div className="cd-text">
          <h2 id="cd-title">{req.title || (isAlert ? 'Something went wrong' : 'Are you sure?')}</h2>
          {req.message && <p id="cd-msg">{req.message}</p>}
        </div>
        <div className="cd-actions">
          {!isAlert && <button ref={cancelRef} type="button" className="btn" onClick={() => close(false)}>{req.cancelLabel || 'Cancel'}</button>}
          <button ref={okRef} type="button" className={`btn ${danger ? 'danger-solid' : 'primary'}`} onClick={() => close(true)}>
            {req.confirmLabel || (isAlert ? 'OK' : 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
