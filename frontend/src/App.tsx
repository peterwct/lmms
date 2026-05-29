import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { Users } from './pages/admin/Users';
import { UserForm } from './pages/admin/UserForm';
import { UserDetail } from './pages/admin/UserDetail';
import { Departments } from './pages/admin/Departments';
import { AuditLog } from './pages/admin/AuditLog';
import { Members } from './pages/members/Members';
import { MemberDetail } from './pages/members/MemberDetail';
import { MemberForm }   from './pages/members/MemberForm';
import { MemberReport } from './pages/members/MemberReport';
import { Agreements } from './pages/agreements/Agreements';
import { AgreementDetail } from './pages/agreements/AgreementDetail';
import { AgreementReport } from './pages/agreements/AgreementReport';
import { Schedules } from './pages/amc/Schedules';
import { Invoices } from './pages/amc/Invoices';
import { InvoiceDetail } from './pages/amc/InvoiceDetail';
import { Rates } from './pages/amc/Rates';
import { DayEnd } from './pages/amc/DayEnd';

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/members" replace />} />
              <Route path="admin/users"         element={<Users />} />
              <Route path="admin/users/new"     element={<UserForm />} />
              <Route path="admin/users/:id"     element={<UserDetail />} />
              <Route path="admin/departments"   element={<Departments />} />
              <Route path="admin/audit"         element={<AuditLog />} />
              <Route path="members"             element={<Members />} />
              <Route path="members/:id"         element={<MemberDetail />} />
              <Route path="members/:id/edit"    element={<MemberForm />} />
              <Route path="members/reports"     element={<MemberReport />} />
              <Route path="agreements"          element={<Agreements />} />
              <Route path="agreements/reports"  element={<AgreementReport />} />
              <Route path="agreements/:id"      element={<AgreementDetail />} />
              <Route path="amc/schedules"       element={<Schedules />} />
              <Route path="amc/invoices"        element={<Invoices />} />
              <Route path="amc/invoices/:id"    element={<InvoiceDetail />} />
              <Route path="amc/rates"           element={<Rates />} />
              <Route path="amc/dayend"          element={<DayEnd />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
