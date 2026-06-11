import { JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAdmin({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="px-6 py-12 text-center text-mute">Chargement...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!user.isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
}
