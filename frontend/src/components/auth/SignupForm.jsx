import { useState } from 'react';

export default function SignupForm({ onSubmit, onGoogle, busy, error, onSwitch }) {
  const [formState, setFormState] = useState({ name: '', email: '', password: '' });

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
          <h1>Spin up a secure workspace in seconds.</h1>
          <p>
            Enterprise-grade encryption, instant sharing controls, and live audit logs keep sensitive work locked down
            from day one.
          </p>
        </div>
        <form className="auth-form" onSubmit={handleSubmit}>
          <h2>Create account</h2>
          <p className="muted">Sign up and start encrypting files with your team.</p>
          <label>
            <span>Display name</span>
            <input
              name="name"
              type="text"
              placeholder="Ada Lovelace"
              value={formState.name}
              onChange={handleChange}
              disabled={busy}
              required
            />
          </label>
          <label>
            <span>Email</span>
            <input
              name="email"
              type="email"
              placeholder="abc@gmail.com"
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
              placeholder="At least 6 characters"
              value={formState.password}
              onChange={handleChange}
              disabled={busy}
              required
              minLength={6}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button className="primary-btn" type="submit" disabled={busy}>
            {busy ? 'Working...' : 'Create account'}
          </button>
          <button className="secondary-btn" type="button" onClick={onGoogle} disabled={busy}>
            Continue with Google
          </button>
          <p className="muted auth-switch">
            Already onboard?
            <button className="ghost-btn" type="button" onClick={onSwitch} disabled={busy}>
              Sign in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}
