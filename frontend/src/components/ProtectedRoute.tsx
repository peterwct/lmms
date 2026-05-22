import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PageSpinner } from './ui/Spinner';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePwd) return <Navigate to="/change-password" replace />;
  return <>{children}</>;
}
