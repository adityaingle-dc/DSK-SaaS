import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
import { IconClock } from '../components/Icons.jsx';
import { emailError } from '../utils/email.js';

export default function Register() {
  const { user, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', branch: '', employeeId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [serverEmailError, setServerEmailError] = useState('');

  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => { setForm({ ...form, [k]: e.target.value }); if (k === 'email') setServerEmailError(''); };
  const emailMsg = (emailTouched && emailError(form.email)) || serverEmailError;

  const submit = async (e) => {
    e.preventDefault();
    setEmailTouched(true);
    if (emailError(form.email)) return;
    setBusy(true);
    setError('');
    try {
      await register({ ...form, email: form.email.trim() });
      setPending(true);
    } catch (err) {
      const fieldErr = err.errors?.find((x) => x.field === 'email');
      if (fieldErr) setServerEmailError(fieldErr.message);
      else setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    return (
      <AuthShell eyebrow="Request access" title="Request sent" subtitle={null}>
        <div className="empty left">
          <div className="empty-icon"><IconClock size={26} /></div>
          <strong>Your account is awaiting approval</strong>
          <p className="muted">The superadmin has been notified in the team panel. You can sign in as soon as your account is approved.</p>
          <Link to="/login" className="btn primary">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell eyebrow="Request access" title="Create your account" subtitle="For field evaluators. The superadmin approves new accounts before first sign-in.">
      <form className="stack" onSubmit={submit} noValidate>
        {error && <div className="alert">{error}</div>}
        <label>Full name<input required autoComplete="name" value={form.name} onChange={set('name')} /></label>
        <label className={emailMsg ? 'has-error' : ''}>
          Email
          <input type="email" required autoComplete="email" placeholder="you@bank.in" value={form.email} onChange={set('email')} onBlur={() => form.email && setEmailTouched(true)} aria-invalid={Boolean(emailMsg)} aria-describedby={emailMsg ? 'reg-email-err' : undefined} />
          {emailMsg && <small id="reg-email-err" className="field-error">{emailMsg}</small>}
        </label>
        <label>Password<input type="password" required minLength={6} autoComplete="new-password" placeholder="At least 6 characters" value={form.password} onChange={set('password')} /></label>
        <label>Phone<input type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} /></label>
        <div className="row">
          <label>Branch<input value={form.branch} onChange={set('branch')} /></label>
          <label>Employee ID<input value={form.employeeId} onChange={set('employeeId')} /></label>
        </div>
        <button className="btn primary lg block" disabled={busy}>{busy ? 'Sending…' : 'Request account'}</button>
        <p className="muted center-text">
          Already approved? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
