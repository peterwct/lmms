import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pbsApi } from '../../api/pbs';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { ArrowLeft, Download, Search } from 'lucide-react';

interface VarianceRow {
  coCode: string;
  membershipNo: string;
  fullName: string;
  agreementNo: string;
  agreementDate: string;
  paybackDate: string;
  acctClassify: string;
  rightfulScheme: string;
  zurichScheme: string;
}

export function PbsVarianceReport() {
  // Preview only runs when the user clicks Preview.
  const [previewRequested, setPreviewRequested] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pbs-variance-report'],
    queryFn: () => pbsApi.previewVariance().then(r => r.data as {
      data: VarianceRow[];
      meta: { total: number };
    }),
    enabled: previewRequested,
  });

  const rows = data?.data ?? [];
  const total = data?.meta?.total ?? 0;

  const handleDownload = async () => {
    const resp = await pbsApi.downloadVariance();
    const blob = new Blob([resp.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const d = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    a.download = `pbs-variance-report-${d}.xlsx`;
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
          <h1 className="text-xl font-semibold text-gray-900">PBS Variance Report</h1>
          <p className="mt-1 text-sm text-gray-500">
            Compares rightful scheme (by agreement date) against the Zurich scheme on record.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setPreviewRequested(true)} loading={previewRequested && isLoading} variant="secondary" size="sm">
            <Search className="h-4 w-4 mr-1.5" />
            Preview
          </Button>
          <Button onClick={handleDownload} size="sm">
            <Download className="h-4 w-4 mr-1.5" />
            Download Excel
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
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Co Code</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Mem No</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Name</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Agmt No</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Agmt Date</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Payback Date</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Acct Class</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Rightful Scheme</th>
                  <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Zurich Scheme</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isVariance = r.rightfulScheme !== r.zurichScheme;
                  const base = i % 2 === 0 ? 'bg-white' : 'bg-blue-50/40';
                  const rowClass = isVariance ? 'bg-red-50' : base;
                  return (
                    <tr key={i} className={rowClass}>
                      <td className="px-1.5 py-1">{r.coCode}</td>
                      <td className="px-1.5 py-1 font-mono">{r.membershipNo}</td>
                      <td className="px-1.5 py-1 whitespace-nowrap">{r.fullName}</td>
                      <td className="px-1.5 py-1">{r.agreementNo}</td>
                      <td className="px-1.5 py-1">{r.agreementDate}</td>
                      <td className="px-1.5 py-1">{r.paybackDate}</td>
                      <td className="px-1.5 py-1">{r.acctClassify}</td>
                      <td className="px-1.5 py-1">{r.rightfulScheme}</td>
                      <td className="px-1.5 py-1 font-medium">{r.zurichScheme}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                  <td className="px-1.5 py-1.5 text-left" colSpan={9}>Total: {total} records</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
