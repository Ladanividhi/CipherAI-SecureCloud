import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Dashboard from './pages/Dashboard';
import PreviewPage from './pages/Preview';
import useAuth from './hooks/useAuth';
import AppShellLayout from './layouts/AppShellLayout';
import MyFiles from './pages/MyFiles';
import TagFiles from './pages/TagFiles';
import SharedWithMe from './pages/SharedWithMe';

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
        element={(
          <ProtectedRoute>
            <AppShellLayout />
          </ProtectedRoute>
        )}
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/my-files" element={<MyFiles />} />
        <Route path="/my-files/:tagName" element={<TagFiles />} />
        <Route path="/shared" element={<SharedWithMe />} />
      </Route>
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
