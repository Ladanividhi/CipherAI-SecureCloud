import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import PreviewPage from './pages/Preview';
import useAuth from './hooks/useAuth';

function ProtectedRoute({ children }) {
  const { authReady, currentUser } = useAuth();
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
  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/dashboard"
        element={(
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/preview"
        element={(
          <ProtectedRoute>
            <PreviewPage />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
