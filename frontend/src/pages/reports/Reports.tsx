import { Link } from 'react-router-dom';
import { FileBarChart2, Users, FileText, CalendarDays, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { ReportKey } from '../../types';

interface ReportItem {
  key: ReportKey;
  label: string;
  description: string;
  to: string;
  icon: React.ReactNode;
}

const REPORT_LIST: ReportItem[] = [
  {
    key: 'MEMBER_REPORT',
    label: 'Member Report',
    description: 'List of members with their agreements, contact details, and mailing addresses. Export as PDF or Excel.',
    to: '/reports/members',
    icon: <Users className="h-4 w-4" />,
  },
  {
    key: 'AGREEMENT_REPORT',
    label: 'SSM Agreement Report',
    description: 'Active agreements with member details by company code. Separate views for individual and corporate members.',
    to: '/reports/agreements',
    icon: <FileText className="h-4 w-4" />,
  },
  {
    key: 'EXPIRY_REPORT',
    label: 'Senior Management Report - Analysis of Agreement Expiry',
    description: 'Summary of agreements grouped by expiry year, showing active vs non-active counts for LHC and CP with cumulative totals.',
    to: '/reports/expiry',
    icon: <CalendarDays className="h-4 w-4" />,
  },
  {
    key: 'EXPIRING_MEMBER_REPORT',
    label: 'List of Expiring Members',
    description: 'Agreements expiring in a selected month and year, grouped by company code. Excludes terminated agreements.',
    to: '/reports/expiring-members',
    icon: <CalendarDays className="h-4 w-4" />,
  },
  {
    key: 'REMAINING_VALUE_REPORT',
    label: 'Remaining Value Report',
    description: 'Year-by-year projected remaining book value of active agreements by company code (LHC or CP). Excel output with dynamic yearly columns.',
    to: '/reports/remaining-value',
    icon: <FileBarChart2 className="h-4 w-4" />,
  },
  {
    key: 'EXPIRY_SUMMARY_REPORT',
    label: 'Summary of Expiring Members by Years',
    description: 'Agreements grouped by expiry year with counts by status category (NA, SU <=3yr, SU >3yr, PT <=3yr, PT >3yr) for LHC or CP.',
    to: '/reports/expiry-summary',
    icon: <CalendarDays className="h-4 w-4" />,
  },
];

export function Reports() {
  const { hasReport } = useAuth();
  const accessible = REPORT_LIST.filter(r => hasReport(r.key));

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-500">Select a report to generate or preview data.</p>
      </div>

      {accessible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 px-6 py-12 text-center">
          <FileBarChart2 className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-500">No reports assigned</p>
          <p className="mt-1 text-xs text-gray-400">Contact IT to request access to specific reports.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {accessible.map((item, idx) => (
            <Link
              key={item.key}
              to={item.to}
              title={item.description}
              className="group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors border border-transparent hover:border-blue-200"
            >
              <span className="w-6 shrink-0 text-xs text-gray-400 font-mono text-right">
                {idx + 1}.
              </span>
              <span className="shrink-0 text-gray-400 group-hover:text-blue-500 transition-colors">
                {item.icon}
              </span>
              <span className="flex-1 font-medium leading-snug">{item.label}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-blue-400 transition-colors" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
