import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { AppModule } from '../types';

// Route guard: renders children only if the user has `edit` on the given module,
// otherwise redirects to the parent route. Closes direct-URL access to edit pages
// (the save endpoint is separately protected on the backend).
export function RequireEdit({ module, children }: { module: AppModule; children: React.ReactNode }) {
  const { canEdit } = useAuth();
  return canEdit(module) ? <>{children}</> : <Navigate to=".." replace />;
}
