import { Link } from 'react-router-dom';
import { FileBarChart2, Users, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import type { ReportKey } from '../../types';

interface ReportCard {
  key: ReportKey;
  label: string;
  description: string;
  to: string;
  icon: React.ReactNode;
}

const REPORT_CARDS: ReportCard[] = [
  {
    key: 'MEMBER_REPORT',
    label: 'Member Report',
    description: 'List of members with their agreements, contact details, and mailing addresses. Export as PDF or Excel.',
    to: '/reports/members',
    icon: <Users className="h-6 w-6" />,
  },
  {
    key: 'AGREEMENT_REPORT',
    label: 'SSM Agreement Report',
    description: 'Active agreements with member details by company code. Separate views for individual and corporate members.',
    to: '/reports/agreements',
    icon: <FileText className="h-6 w-6" />,
  },
];

export function Reports() {
  const { hasReport } = useAuth();
  const accessible = REPORT_CARDS.filter(r => hasReport(r.key));

  return (
    <div className="max-w-3xl space-y-6">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {accessible.map(card => (
            <Link
              key={card.key}
              to={card.to}
              className="group flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-md bg-blue-50 p-2 text-blue-600 group-hover:bg-blue-100 transition-colors">
                  {card.icon}
                </span>
                <h2 className="font-medium text-gray-900">{card.label}</h2>
              </div>
              <p className="text-sm text-gray-500">{card.description}</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
