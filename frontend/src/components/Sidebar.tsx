import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import {
  Users, Building2, ClipboardList, UserSearch,
  FileText, CalendarClock, Receipt, BarChart3,
  Hotel, Award, LogOut, FileBarChart2, Ban,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  soon?: boolean;
}

function NavGroup({ title, items }: { title: string; items: NavItem[] }) {
  return (
    <div className="mb-4">
      <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {items.map(({ to, label, icon, soon }) => (
        soon ? (
          <div key={to} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-slate-500 cursor-default">
            <span className="text-slate-600">{icon}</span>
            <span>{label}</span>
            <span className="ml-auto rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">Soon</span>
          </div>
        ) : (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              clsx('flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-700 hover:text-white')
            }
          >
            {icon}
            {label}
          </NavLink>
        )
      ))}
    </div>
  );
}

export function Sidebar() {
  const { user, logout, canView, canEdit, hasReport } = useAuth();

  const adminItems: NavItem[] = [];
  if (canView('ADMIN')) {
    adminItems.push(
      { to: '/admin/users',       label: 'Users',       icon: <Users className="h-4 w-4" /> },
      { to: '/admin/departments', label: 'Departments', icon: <Building2 className="h-4 w-4" /> },
    );
    if (user?.department.isLocked) {
      adminItems.push({ to: '/admin/audit', label: 'Audit Log', icon: <ClipboardList className="h-4 w-4" /> });
    }
  }

  const memberItems: NavItem[] = [];
  if (canView('MEMBERS'))    memberItems.push({ to: '/members',    label: 'Members',    icon: <UserSearch className="h-4 w-4" /> });
  if (canView('AGREEMENTS')) memberItems.push({ to: '/agreements', label: 'Agreements', icon: <FileText className="h-4 w-4" /> });

  const reportItems: NavItem[] = [];
  if (hasReport('MEMBER_REPORT') || hasReport('AGREEMENT_REPORT') || hasReport('EXPIRY_REPORT') || hasReport('EXPIRING_MEMBER_REPORT') || hasReport('REMAINING_VALUE_REPORT') || hasReport('EXPIRY_SUMMARY_REPORT')) {
    reportItems.push({ to: '/reports', label: 'Reports', icon: <FileBarChart2 className="h-4 w-4" /> });
  }

  const amcItems: NavItem[] = [];
  if (canView('AMC_BILLING')) {
    amcItems.push(
      { to: '/amc/schedules', label: 'Schedules', icon: <CalendarClock className="h-4 w-4" /> },
      { to: '/amc/invoices',  label: 'Invoices',  icon: <Receipt className="h-4 w-4" /> },
      { to: '/amc/rates',     label: 'Rate Master', icon: <BarChart3 className="h-4 w-4" /> },
      { to: '/amc/dayend',    label: 'Day-End Files', icon: <ClipboardList className="h-4 w-4" /> },
    );
    // Invoice Cancellation requires AMC Billing Edit permission
    if (canEdit('AMC_BILLING')) {
      amcItems.push({ to: '/amc/invoice-cancellation', label: 'Invoice Cancellation', icon: <Ban className="h-4 w-4" /> });
    }
  }

  const pbsItems: NavItem[] = [];
  if (canView('PBS_SCHEME')) pbsItems.push({ to: '/pbs', label: 'Payback Scheme', icon: <Award className="h-4 w-4" /> });

  const comingSoon: NavItem[] = [];
  if (canView('RESORT_BOOKING')) comingSoon.push({ to: '/resort-booking', label: 'Resort Booking', icon: <Hotel className="h-4 w-4" />, soon: true });

  return (
    <aside className="flex h-screen w-60 flex-col bg-slate-900 text-white">
      {/* Logo */}
      <div className="border-b border-slate-700 px-4 py-4 flex flex-col items-center">
        <img src="/logo.png" alt="Leisure Holidays" className="w-44 brightness-0 invert" />
        <p className="mt-1 text-xs tracking-widest text-slate-400 uppercase">Member Management</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {adminItems.length > 0    && <NavGroup title="Admin"        items={adminItems} />}
        {memberItems.length > 0   && <NavGroup title="Members"      items={memberItems} />}
        {amcItems.length > 0      && <NavGroup title="AMC Billing"  items={amcItems} />}
        {pbsItems.length > 0      && <NavGroup title="Zurich PBS"    items={pbsItems} />}
        {reportItems.length > 0   && <NavGroup title="Reports"      items={reportItems} />}
        {comingSoon.length > 0    && <NavGroup title="Coming Soon"  items={comingSoon} />}
      </nav>

      {/* User footer */}
      <div className="border-t border-slate-700 px-4 py-3">
        <p className="text-sm font-medium text-white truncate">{user?.fullName}</p>
        <p className="text-xs text-slate-400 truncate">{user?.department.name}</p>
        <button
          onClick={logout}
          className="mt-2 flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
