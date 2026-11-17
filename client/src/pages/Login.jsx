import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
import OtpStep from '../components/OtpStep.jsx';

export default function Login() {
  const { user, login, verifyLogin } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [challenge, setChallenge] = useState(null);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await login(form.email.trim(), form.password);
      if (res.challenge) setChallenge(res.challenge);
      else navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (challenge) {
    return (
      <AuthShell eyebrow="Secure sign-in" title="Check your email" subtitle="Enter the code to finish signing in.">
        <OtpStep
          challenge={challenge}
          verifyLabel="Verify & sign in"
          backLabel="Use a different account"
          onBack={() => { setChallenge(null); setForm((f) => ({ ...f, password: '' })); }}
          onVerify={async (id, code) => { await verifyLogin(id, code); navigate('/'); }}
        />
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Secure sign-in" title="Welcome back" subtitle="Sign in to your valuation workspace.">
      <form className="stack" onSubmit={submit}>
        {error && <div className="alert">{error}</div>}
        <label>
          Email
          <input type="email" autoComplete="email" required placeholder="you@bank.in" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </label>
        <label>
          <span className="label-row">Password <Link to="/forgot-password" className="label-link">Forgot password?</Link></span>
          <span className="pw-field">
            <input type={showPw ? 'text' : 'password'} autoComplete="current-password" required placeholder="Enter your password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <button type="button" className="pw-toggle" aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw} onClick={() => setShowPw((v) => !v)}>{showPw ? 'Hide' : 'Show'}</button>
          </span>
        </label>
        <button className="btn primary lg block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted center-text">
          New field evaluator? <Link to="/register">Request access</Link>
        </p>
      </form>
    </AuthShell>
  );
}
