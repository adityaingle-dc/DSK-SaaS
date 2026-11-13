import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import AuthShell from '../components/AuthShell.jsx';
import { IconClock } from '../components/Icons.jsx';

export default function Register() {
  const { user, register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', branch: '', employeeId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to="/" replace />;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await register(form);
      setPending(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (pending) {
    return (
      <AuthShell title="Request sent" subtitle={null}>
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
    <AuthShell title="Request an account" subtitle="Field evaluators can sign up here; a superadmin approves new accounts">
      <form className="stack" onSubmit={submit}>
        {error && <div className="alert">{error}</div>}
        <label>Full name<input required autoComplete="name" value={form.name} onChange={set('name')} /></label>
        <label>Email<input type="email" required autoComplete="email" value={form.email} onChange={set('email')} /></label>
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
