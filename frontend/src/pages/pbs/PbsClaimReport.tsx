import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pbsApi } from '../../api/pbs';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { ArrowLeft, Download } from 'lucide-react';
import { clsx } from 'clsx';

interface ClaimPreviewRow {
  no: number;
  certNo: string;
  membershipNo: string;
  agreementNo: string;
  fullName: string;
  maturityDate: string;
  claimAmt: number;
  docNo: string;
  pymtFromTrustee: string;
  pymtDateToMem: string;
  claimType: string;
  payTo: string;
}

interface ClaimMeta {
  total: number;
  totalClaimAmt: number;
  totalLhbAmt: number;
  lhbCases: number;
  ndTotal: number;
  totalNdAmt: number;
}

function fmtRM(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Tab = 'claim' | 'nd';

export function PbsClaimReport() {
  const [tab, setTab] = useState<Tab>('claim');

  const { data, isLoading } = useQuery({
    queryKey: ['pbs-claim-report'],
    queryFn: () => pbsApi.previewClaimReport().then(r => r.data as {
      data: ClaimPreviewRow[];
      nd: ClaimPreviewRow[];
      meta: ClaimMeta;
    }),
  });

  const claimRows = data?.data ?? [];
  const ndRows    = data?.nd ?? [];
  const meta      = data?.meta;

  const handleDownload = async () => {
    const resp = await pbsApi.downloadClaimReport();
    const blob = new Blob([resp.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const d = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
    a.download = `pbs-claim-report-${d}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeRows = tab === 'claim' ? claimRows : ndRows;

  return (
    <div className="space-y-4">
      <Link to="/pbs" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Zurich PBS
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">PBS Claim Report</h1>
          <p className="mt-1 text-sm text-gray-500">
            Zurich PBS claim listing. Excel download includes both worksheets.
          </p>
        </div>
        <Button onClick={handleDownload} disabled={!claimRows.length && !ndRows.length} size="sm">
          <Download className="h-4 w-4 mr-1.5" />
          Download Excel
        </Button>
      </div>

      {isLoading ? <PageSpinner /> : (
        <>
          {/* Tabs */}
          <div className="flex gap-1 border-b">
            <button
              onClick={() => setTab('claim')}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === 'claim'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              PBS Claim Listing ({claimRows.length})
            </button>
            <button
              onClick={() => setTab('nd')}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === 'nd'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              Natural Death Claim ({ndRows.length})
            </button>
          </div>

          {activeRows.length === 0 ? (
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
                      <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Cert No</th>
                      <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Mem No</th>
                      <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Agmt No</th>
                      <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Name</th>
                      <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Maturity Date</th>
                      <th className="px-1.5 py-1.5 text-right font-medium whitespace-nowrap">Claim Amt</th>
                      <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Doc No</th>
                      <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Pymt From Trustee</th>
                      <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Pymt Date To Mem</th>
                      <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Type</th>
                      {tab === 'claim' && <th className="px-1.5 py-1.5 text-left font-medium whitespace-nowrap">Pay To</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {activeRows.map((r, i) => (
                      <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                        <td className="px-1.5 py-1 text-right text-gray-500">{r.no}</td>
                        <td className="px-1.5 py-1">{r.certNo}</td>
                        <td className="px-1.5 py-1 font-mono">{r.membershipNo}</td>
                        <td className="px-1.5 py-1">{r.agreementNo}</td>
                        <td className="px-1.5 py-1 whitespace-nowrap">{r.fullName}</td>
                        <td className="px-1.5 py-1">{r.maturityDate}</td>
                        <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.claimAmt)}</td>
                        <td className="px-1.5 py-1">{r.docNo}</td>
                        <td className="px-1.5 py-1">{r.pymtFromTrustee}</td>
                        <td className="px-1.5 py-1">{r.pymtDateToMem}</td>
                        <td className="px-1.5 py-1">{r.claimType}</td>
                        {tab === 'claim' && <td className="px-1.5 py-1 font-medium text-blue-700">{r.payTo}</td>}
                      </tr>
                    ))}
                  </tbody>
                  {meta && (
                    <tfoot>
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        {tab === 'claim' ? (
                          <>
                            <td className="px-1.5 py-1.5 text-left" colSpan={5}>Total Claims: {meta.total}</td>
                            <td className="px-1.5 py-1.5 text-right" colSpan={2}>Total Claim Paid:</td>
                            <td className="px-1.5 py-1.5 text-right font-mono" colSpan={2}>{fmtRM(meta.totalClaimAmt)}</td>
                            <td className="px-1.5 py-1.5 text-right" colSpan={2}>Total Paid to LHB:</td>
                            <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(meta.totalLhbAmt)} ({meta.lhbCases} cases)</td>
                          </>
                        ) : (
                          <>
                            <td className="px-1.5 py-1.5 text-left" colSpan={5}>Total Claims: {meta.ndTotal}</td>
                            <td className="px-1.5 py-1.5 text-right" colSpan={2}>Total Claim Paid:</td>
                            <td className="px-1.5 py-1.5 text-right font-mono" colSpan={4}>{fmtRM(meta.totalNdAmt)}</td>
                          </>
                        )}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
