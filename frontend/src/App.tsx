import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RequireEdit } from './components/RequirePermission';
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
import { Reports } from './pages/reports/Reports';
import { ExpiryReport } from './pages/reports/ExpiryReport';
import { ExpiringMembersReport } from './pages/reports/ExpiringMembersReport';
import { RemainingValueReport } from './pages/reports/RemainingValueReport';
import { ExpirySummaryReport } from './pages/reports/ExpirySummaryReport';
import { Pbs } from './pages/pbs/Pbs';
import { PbsEnquiry } from './pages/pbs/PbsEnquiry';
import { PbsEnquiryDetail } from './pages/pbs/PbsEnquiryDetail';
import { PbsPayByMonthReport } from './pages/pbs/PbsPayByMonthReport';
import { PbsPlaceholder } from './pages/pbs/PbsPlaceholder';
import { PbsClaimReport } from './pages/pbs/PbsClaimReport';
import { PbsNotInPbsReport } from './pages/pbs/PbsNotInPbsReport';
import { PbsVarianceReport } from './pages/pbs/PbsVarianceReport';
import { PbsAutoTransfer } from './pages/pbs/PbsAutoTransfer';
import { ResortsSetup } from './pages/resorts/ResortsSetup';
import { ResortMaster } from './pages/resorts/ResortMaster';
import { ResortDetail } from './pages/resorts/ResortDetail';
import { ApartmentTypes } from './pages/resorts/ApartmentTypes';
import { ResortUnits } from './pages/resorts/ResortUnits';
import { Schedules } from './pages/amc/Schedules';
import { Invoices } from './pages/amc/Invoices';
import { InvoiceDetail } from './pages/amc/InvoiceDetail';
import { InvoiceCancellation } from './pages/amc/InvoiceCancellation';
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
              <Route path="members/:id/edit"    element={<RequireEdit module="MEMBERS"><MemberForm /></RequireEdit>} />
              <Route path="agreements"          element={<Agreements />} />
              <Route path="agreements/:id"      element={<AgreementDetail />} />
              <Route path="reports"             element={<Reports />} />
              <Route path="reports/members"     element={<MemberReport />} />
              <Route path="reports/agreements"  element={<AgreementReport />} />
              <Route path="reports/expiry"             element={<ExpiryReport />} />
              <Route path="reports/expiring-members" element={<ExpiringMembersReport />} />
              <Route path="reports/remaining-value"   element={<RemainingValueReport />} />
              <Route path="reports/expiry-summary"    element={<ExpirySummaryReport />} />
              <Route path="pbs"                  element={<Pbs />} />
              <Route path="pbs/enquiry"          element={<PbsEnquiry />} />
              <Route path="pbs/enquiry/:id"     element={<PbsEnquiryDetail />} />
              <Route path="pbs/proforma"         element={<PbsPlaceholder />} />
              <Route path="pbs/tracking"         element={<PbsPlaceholder />} />
              <Route path="pbs/transfer"         element={<PbsAutoTransfer />} />
              <Route path="pbs/report"           element={<PbsPlaceholder />} />
              <Route path="pbs/variance"         element={<PbsVarianceReport />} />
              <Route path="pbs/claim-report"     element={<PbsClaimReport />} />
              <Route path="pbs/not-in-pbs"       element={<PbsNotInPbsReport />} />
              <Route path="pbs/pay-by-month"     element={<PbsPayByMonthReport />} />
              <Route path="resorts"             element={<ResortsSetup />} />
              <Route path="resorts/setup"       element={<ResortMaster />} />
              <Route path="resorts/setup/:id"   element={<ResortDetail />} />
              <Route path="resorts/apartment-types" element={<ApartmentTypes />} />
              <Route path="resorts/units"       element={<ResortUnits />} />
              <Route path="amc/schedules"       element={<Schedules />} />
              <Route path="amc/invoices"        element={<Invoices />} />
              <Route path="amc/invoices/:id"    element={<InvoiceDetail />} />
              <Route path="amc/invoice-cancellation" element={<InvoiceCancellation />} />
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
