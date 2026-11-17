import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
import OtpStep from '../components/OtpStep.jsx';
import { emailError } from '../utils/email.js';

// Forgot password: email → code (emailed) + new password → sign in
export default function ForgotPassword() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [pw, setPw] = useState({ password: '', confirm: '' });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  if (user) return <Navigate to="/" replace />;
  const emailMsg = touched ? emailError(email)?.replace(/^Did you mean.*$/, '') || null : null;

  const sendCode = async (e) => {
    e.preventDefault();
    setTouched(true);
    const msg = emailError(email);
    if (msg && !msg.startsWith('Did you mean')) return;
    setBusy(true);
    setError('');
    try {
      setChallenge(await api.forgotPassword(email.trim()));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const pwError = pw.password && pw.password.length < 8 ? 'Use at least 8 characters' : pw.confirm && pw.confirm !== pw.password ? 'Passwords do not match' : null;

  if (done) {
    return (
      <AuthShell eyebrow="Password reset" title="Password changed" subtitle={null}>
        <div className="stack">
          <div className="alert success">Your password has been updated. Sign in with your new password.</div>
          <Link to="/login" className="btn primary lg block">Go to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  if (challenge) {
    return (
      <AuthShell eyebrow="Password reset" title="Set a new password" subtitle="Enter the code we emailed you and choose a new password.">
        <OtpStep
          challenge={challenge}
          verifyLabel="Reset password"
          backLabel="Use a different email"
          onBack={() => { setChallenge(null); setPw({ password: '', confirm: '' }); }}
          onVerify={async (id, code) => {
            if (pw.password.length < 8) throw new Error('Choose a new password of at least 8 characters');
            if (pw.password !== pw.confirm) throw new Error('The two passwords do not match');
            await api.resetPassword(id, code, pw.password);
            setDone(true);
          }}
        >
          <label className={pwError && pw.password.length > 0 && pw.password.length < 8 ? 'has-error' : ''}>
            New password
            <span className="pw-field">
              <input type={showPw ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 8 characters" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
              <button type="button" className="pw-toggle" aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw} onClick={() => setShowPw((v) => !v)}>{showPw ? 'Hide' : 'Show'}</button>
            </span>
          </label>
          <label className={pw.confirm && pw.confirm !== pw.password ? 'has-error' : ''}>
            Confirm new password
            <input type={showPw ? 'text' : 'password'} autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            {pwError && <small className="field-error">{pwError}</small>}
          </label>
        </OtpStep>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Password reset" title="Forgot your password?" subtitle="Enter your email and we'll send you a code to set a new password.">
      <form className="stack" onSubmit={sendCode} noValidate>
        {error && <div className="alert" role="alert">{error}</div>}
        <label className={emailMsg ? 'has-error' : ''}>
          Email
          <input type="email" autoComplete="email" autoFocus placeholder="you@bank.in" value={email} onChange={(e) => setEmail(e.target.value)} onBlur={() => email && setTouched(true)} />
          {emailMsg && <small className="field-error">{emailMsg}</small>}
        </label>
        <button className="btn primary lg block" disabled={busy || !email}>{busy ? 'Sending code…' : 'Send code'}</button>
        <p className="muted center-text">Remembered it? <Link to="/login">Back to sign in</Link></p>
      </form>
    </AuthShell>
  );
}
