import { useLocation, Link } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';

const LABELS: Record<string, string> = {
  '/pbs/proforma':     'Proforma Enquiry & Generation',
  '/pbs/tracking':     'PBS Certificate Tracking',
  '/pbs/transfer':     'Auto Transfer to Claim',
  '/pbs/report':       'PBS Report',
  '/pbs/variance':     'Variance Report',
  '/pbs/not-in-pbs':   'Not in PBS Report',
};

export function PbsPlaceholder() {
  const { pathname } = useLocation();
  const title = LABELS[pathname] ?? 'PBS Function';

  return (
    <div className="max-w-4xl space-y-4">
      <Link to="/pbs" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Zurich PBS
      </Link>

      <div className="rounded-lg border border-dashed border-gray-300 px-6 py-16 text-center">
        <Construction className="mx-auto h-10 w-10 text-gray-300" />
        <h1 className="mt-3 text-lg font-semibold text-gray-700">{title}</h1>
        <p className="mt-1 text-sm text-gray-400">This function is under development.</p>
      </div>
    </div>
  );
}
