import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import useAuth from '../hooks/useAuth';

export default function Login() {
  const navigate = useNavigate();
  const { authReady, currentUser, authBusy, authError, handleEmailAuth, handleGoogleAuth } = useAuth();

  useEffect(() => {
    if (authReady && currentUser) {
      navigate('/dashboard');
    }
  }, [authReady, currentUser, navigate]);

  if (!authReady) {
    return (
      <div className="auth-shell">
        <div className="auth-card loading-state">
          <h2>SecureCloud</h2>
          <p className="muted">Loading your encrypted workspace...</p>
        </div>
      </div>
    );
  }

  const sharedProps = {
    busy: authBusy,
    error: authError,
    onSubmit: ({ email, password }) => handleEmailAuth({ email, password }),
    onGoogle: handleGoogleAuth,
  };

  return <LoginForm {...sharedProps} onSwitch={() => navigate('/signup')} />;
}
