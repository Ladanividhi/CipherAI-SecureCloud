import { useState } from 'react';

export default function LoginForm({ onSubmit, onGoogle, busy, error, onSwitch }) {
  const [formState, setFormState] = useState({ email: '', password: '' });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSubmit({ ...formState });
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-hero">
          <p className="eyebrow">CipherAI SecureCloud</p>
          <h1>Protect every file with zero-trust workflows.</h1>
          <p>
            Hardware-grade encryption, audit trails, and AI copilots keep your documents private while your team moves
            fast.
          </p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <h2>Sign in</h2>
          <p className="muted">Log into your encrypted workspace to manage files securely.</p>
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              placeholder="you@securecloud.dev"
              value={formState.email}
              onChange={handleChange}
              disabled={busy}
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              name="password"
              type="password"
              placeholder="Your password"
              value={formState.password}
              onChange={handleChange}
              disabled={busy}
              required
              minLength={6}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? 'Working...' : 'Sign in'}
          </button>
          <button className="secondary-btn" type="button" onClick={onGoogle} disabled={busy}>
            Continue with Google
          </button>
          <p className="muted auth-switch">
            Need an account?
            <button className="ghost-btn" type="button" onClick={onSwitch} disabled={busy}>
              Create one
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
