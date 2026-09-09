import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { AppModule, ReportKey } from '../types';

// Route guard: renders children only if the user has `edit` on the given module,
// otherwise redirects to the parent route. Closes direct-URL access to edit pages
// (the save endpoint is separately protected on the backend).
export function RequireEdit({ module, children }: { module: AppModule; children: React.ReactNode }) {
  const { canEdit } = useAuth();
  return canEdit(module) ? <>{children}</> : <Navigate to=".." replace />;
}

// Layout route guard: renders the nested routes only if the user has `view` on `module` AND,
// when given, the per-user `reportKey` grant. Used as a PATHLESS <Route element={...}> so a whole
// module's routes are gated in one place instead of wrapping each one -- see App.tsx.
//
// Redirects to an ABSOLUTE "/" rather than RequireEdit's ".."; a pathless route contributes no URL
// segment, so relative resolution there is subtle and router-version-fragile. "/" lands on
// /members, which is outside both guards, so there is no redirect loop.
//
// Reading `user` unconditionally is safe: this only ever renders inside <ProtectedRoute>, which
// already blocks on `loading` and a null user, so there is no redirect flash on refresh.
export function RequireAccess({ module, reportKey }: { module: AppModule; reportKey?: ReportKey }) {
  const { canView, hasReport } = useAuth();
  const ok = canView(module) && (!reportKey || hasReport(reportKey));
  return ok ? <Outlet /> : <Navigate to="/" replace />;
}
