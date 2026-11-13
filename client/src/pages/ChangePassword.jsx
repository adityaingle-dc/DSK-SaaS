import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { IconShield } from '../components/Icons.jsx';

function strength(p) {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}
const LABELS = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong'];

export default function ChangePassword() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const forced = user.mustChangePassword;
  const s = strength(form.next);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.next.length < 8) return setError('New password must be at least 8 characters.');
    if (form.next !== form.confirm) return setError('New passwords do not match.');
    setBusy(true);
    try {
      await changePassword(form.current, form.next);
      setDone(true);
      setTimeout(() => navigate('/'), 900);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <section className="card">
        <div className="section-head">
          <span className="section-step"><IconShield size={18} /></span>
          <div>
            <h2>{forced ? 'Set your password' : 'Change password'}</h2>
            {forced && <p className="muted small">You signed in with a temporary password. Choose your own to continue.</p>}
          </div>
        </div>
        {done ? (
          <div className="alert success">Password updated. Taking you to the dashboard…</div>
        ) : (
          <form className="stack" onSubmit={submit}>
            {error && <div className="alert">{error}</div>}
            <label>{forced ? 'Temporary password' : 'Current password'}
              <input type="password" required autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
            </label>
            <label>New password
              <input type="password" required minLength={8} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
            </label>
            {form.next && (
              <div className="strength">
                <div className="strength-bar">{[0, 1, 2, 3].map((i) => <span key={i} className={i < s ? `on s${s}` : ''} />)}</div>
                <small className="muted">{LABELS[s]} · use 12+ characters with a mix of letters, numbers and symbols</small>
              </div>
            )}
            <label>Confirm new password
              <input type="password" required autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
            </label>
            <button className="btn primary lg block" disabled={busy}>{busy ? 'Saving…' : 'Update password'}</button>
          </form>
        )}
      </section>
    </div>
  );
}
