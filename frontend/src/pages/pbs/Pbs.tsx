import { Link } from 'react-router-dom';
import {
  Search, FileText, MapPin, ArrowRightLeft,
  FileBarChart2, GitCompare, ClipboardCheck, UserX, CalendarDays,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { ReportKey } from '../../types';

interface PbsMenuItem {
  num: number;
  label: string;
  to: string;
  icon: React.ReactNode;
  enabled?: boolean;
}

const MAINTENANCE: PbsMenuItem[] = [
  { num: 1,  label: 'PBS Enquiry & Maintenance',      to: '/pbs/enquiry',      icon: <Search className="h-4 w-4" />, enabled: true },
  { num: 2,  label: 'Proforma Enquiry & Generation',  to: '/pbs/proforma',     icon: <FileText className="h-4 w-4" /> },
  { num: 3,  label: 'PBS Certificate Tracking',        to: '/pbs/tracking',     icon: <MapPin className="h-4 w-4" /> },
  { num: 4,  label: 'Auto Transfer to Claim',          to: '/pbs/transfer',     icon: <ArrowRightLeft className="h-4 w-4" /> },
];

function buildReports(hasReport: (key: ReportKey) => boolean): PbsMenuItem[] {
  return [
    { num: 11, label: 'PBS Report',                to: '/pbs/report',       icon: <FileBarChart2 className="h-4 w-4" /> },
    ...(hasReport('PBS_VARIANCE_REPORT') ? [{ num: 12, label: 'Variance Report', to: '/pbs/variance', icon: <GitCompare className="h-4 w-4" />, enabled: true }] : []),
    ...(hasReport('PBS_CLAIM_REPORT') ? [{ num: 13, label: 'Claim Report', to: '/pbs/claim-report', icon: <ClipboardCheck className="h-4 w-4" />, enabled: true }] : []),
    ...(hasReport('PBS_NOT_IN_PBS_REPORT') ? [{ num: 14, label: 'Not in PBS Report', to: '/pbs/not-in-pbs', icon: <UserX className="h-4 w-4" />, enabled: true }] : []),
    ...(hasReport('PBS_PAY_BY_MONTH_REPORT') ? [{ num: 15, label: 'PBS Pay By Month/Year', to: '/pbs/pay-by-month', icon: <CalendarDays className="h-4 w-4" />, enabled: true }] : []),
  ];
}

function MenuSection({ title, items }: { title: string; items: PbsMenuItem[] }) {
  return (
    <div>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h2>
      <div className="space-y-0.5">
        {items.map(item => item.enabled ? (
          <Link
            key={item.num}
            to={item.to}
            className="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border border-transparent hover:border-blue-200"
          >
            <span className="w-6 shrink-0 text-xs text-gray-400 font-mono text-right">
              {item.num}.
            </span>
            <span className="shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors">
              {item.icon}
            </span>
            <span className="flex-1 font-medium leading-snug">{item.label}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-blue-400 transition-colors" />
          </Link>
        ) : (
          <div
            key={item.num}
            className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-400 cursor-default"
          >
            <span className="w-6 shrink-0 text-xs font-mono text-right">
              {item.num}.
            </span>
            <span className="shrink-0">
              {item.icon}
            </span>
            <span className="flex-1 font-medium leading-snug">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Pbs() {
  const { hasReport } = useAuth();
  const reports = buildReports(hasReport);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Zurich Payback Scheme</h1>
        <p className="mt-1 text-sm text-gray-500">Select a function or report.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
        <MenuSection title="Maintenance" items={MAINTENANCE} />
        <MenuSection title="Reports" items={reports} />
      </div>
    </div>
  );
}
