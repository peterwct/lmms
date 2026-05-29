import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';

const TITLES: Record<string, string> = {
  '/admin/users':       'User Management',
  '/admin/departments': 'Departments',
  '/admin/audit':       'Audit Log',
  '/members':                'Members',
  '/agreements/reports':     'Agreement Reports',
  '/agreements':             'Agreements',
  '/amc/schedules':     'Billing Schedules',
  '/amc/invoices':      'Invoices',
  '/amc/rates':         'Rate Master',
  '/amc/dayend':        'Day-End Files',
};

function getTitle(path: string): string {
  for (const [prefix, title] of Object.entries(TITLES)) {
    if (path.startsWith(prefix)) return title;
  }
  return 'LHB MMS';
}

export function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <header className="flex h-14 items-center border-b border-gray-200 bg-white px-6 shadow-sm">
          <h1 className="text-base font-semibold text-gray-800">{getTitle(pathname)}</h1>
        </header>
        {/* Main */}
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
