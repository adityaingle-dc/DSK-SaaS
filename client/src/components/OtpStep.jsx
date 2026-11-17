import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';

// Enter the 6-digit code emailed to the user (sign-in, account request).
// challenge = { challengeId, email (masked), expiresIn, resendIn }
export default function OtpStep({ challenge, onVerify, onBack, verifyLabel = 'Verify', backLabel = 'Back', children }) {
  const [info, setInfo] = useState(challenge);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(challenge.resendIn || 30);
  const input = useRef(null);
  const lastTried = useRef('');
  const autoSubmit = !children; // with extra fields (e.g. new password) the user submits explicitly

  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return;
    lastTried.current = value;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onVerify(info.challengeId, value);
    } catch (err) {
      setError(err.message);
      if (/code/i.test(err.message)) { setCode(''); input.current?.focus(); }
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoSubmit && code.length === 6 && code !== lastTried.current) verify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const resend = async () => {
    setError('');
    setNotice('');
    try {
      const next = await api.resendOtp(info.challengeId);
      setInfo(next);
      setWait(next.resendIn || 30);
      setCode('');
      lastTried.current = '';
      setNotice(`A new code was sent to ${next.email}.`);
      input.current?.focus();
    } catch (err) {
      setError(err.message);
    }
  };

  const minutes = Math.max(1, Math.round((info.expiresIn || 600) / 60));
  return (
    <form className="stack otp-step" onSubmit={(e) => { e.preventDefault(); verify(); }}>
      <p className="otp-sent">We emailed a 6-digit code to <strong>{info.email}</strong>. It expires in {minutes} minutes.</p>
      {error && <div className="alert" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      <label>
        Verification code
        <input
          ref={input}
          className="otp-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          autoFocus
          required
          placeholder="••••••"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </label>
      {children}
      <small className="muted">Not there? Check your spam folder.</small>
      <button className="btn primary lg block" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : verifyLabel}</button>
      <div className="otp-foot">
        <button type="button" className="linklike" onClick={onBack}>{backLabel}</button>
        {wait > 0 ? <span className="muted small" aria-live="polite">Resend code in {wait}s</span> : <button type="button" className="linklike" onClick={resend}>Resend code</button>}
      </div>
    </form>
  );
}
