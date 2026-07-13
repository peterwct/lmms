import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pbsApi } from '../../api/pbs';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { ArrowLeft, Download, Search } from 'lucide-react';

interface NotInPbsRow {
  no: number;
  agreementNo: string;
  agreementDate: string;
  membershipNo: string;
  acctClassify: string;
}

export function PbsNotInPbsReport() {
  // Preview only runs when the user clicks Preview.
  const [previewRequested, setPreviewRequested] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pbs-not-in-pbs-report'],
    queryFn: () => pbsApi.previewNotInPbs().then(r => r.data as {
      data: NotInPbsRow[];
      meta: { total: number };
    }),
    enabled: previewRequested,
  });

  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const handleDownload = async () => {
    const resp = await pbsApi.downloadNotInPbs();
    const blob = new Blob([resp.data], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const d = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    a.download = `not-in-pbs-${d}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <Link to="/pbs" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Zurich PBS
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Not In PBS Report</h1>
          <p className="mt-1 text-sm text-gray-500">
            Agreements entitled for Payback Scheme but not in the Zurich list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setPreviewRequested(true)} loading={previewRequested && isLoading} variant="secondary" size="sm">
            <Search className="h-4 w-4 mr-1.5" />
            Preview
          </Button>
          <Button onClick={handleDownload} size="sm">
            <Download className="h-4 w-4 mr-1.5" />
            Download Text File
          </Button>
        </div>
      </div>

      {!previewRequested ? (
        <Card>
          <div className="px-6 py-12 text-center text-gray-400">Click Preview to load the report.</div>
        </Card>
      ) : isLoading ? <PageSpinner /> : rows.length === 0 ? (
        <Card>
          <div className="px-6 py-12 text-center text-gray-400">No records found.</div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-blue-600 text-white">
                  <th className="px-1.5 py-1.5 text-right font-medium whitespace-nowrap">No</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Agmt</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Agmt Date</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Membership No</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                    <td className="px-1.5 py-1 text-right text-gray-500">{r.no}</td>
                    <td className="px-1.5 py-1">{r.agreementNo}</td>
                    <td className="px-1.5 py-1">{r.agreementDate}</td>
                    <td className="px-1.5 py-1 font-mono">{r.membershipNo}</td>
                    <td className="px-1.5 py-1">{r.acctClassify}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                  <td className="px-1.5 py-1.5 text-left" colSpan={5}>Total: {total} records</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
