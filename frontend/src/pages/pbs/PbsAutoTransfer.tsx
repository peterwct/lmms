import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, AlertCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react';
import { pbsApi, type PbsTransferPreviewRow } from '../../api/pbs';
import { apiError } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const fmtRM = (n: number) =>
  n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString('en-GB') : '-');

function PreviewTable({ rows }: { rows: PbsTransferPreviewRow[] }) {
  const totalAmt = rows.reduce((s, r) => s + r.claimAmt, 0);
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="bg-blue-600 text-white">
            {['#', 'Membership No.', 'Name', 'Agreement No.', 'Cert No.', 'Scheme', 'Payback Date', 'Status', 'Claim Amount'].map(h => (
              <th key={h} className="px-1.5 py-1.5 font-medium whitespace-nowrap text-left">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                No schemes due for claim in this period.
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr key={r.pbsId} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
              <td className="px-1.5 py-1 text-gray-500">{i + 1}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{r.membershipNo}</td>
              <td className="px-1.5 py-1">{r.fullName}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{r.agreementNo}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{r.certNo ?? '-'}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{r.schemeType ?? '-'}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{fmtDate(r.paybackDate)}</td>
              <td className="px-1.5 py-1 whitespace-nowrap">{r.acctClassify}</td>
              <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.claimAmt)}</td>
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
              <td className="px-1.5 py-1.5" colSpan={8}>Total ({rows.length})</td>
              <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totalAmt)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function PbsAutoTransfer() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear]   = useState(now.getFullYear());
  const [result, setResult] = useState<{ count: number; month: number; year: number; claimIds: string[] } | null>(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, error: previewError, refetch } = useQuery({
    queryKey: ['pbs-transfer-preview', month, year],
    queryFn: () => pbsApi.previewTransfer({ month, year }).then(r => r.data),
  });

  const rows = data?.data ?? [];

  // May only run for the current or next month; back-dated runs are unrestricted.
  const periodIndex  = year * 12 + (month - 1);
  const currentIndex = now.getFullYear() * 12 + now.getMonth();
  const beyondNextMonth = periodIndex > currentIndex + 1;

  const runMut = useMutation({
    mutationFn: () => pbsApi.runTransfer({ month, year }),
    onSuccess: (res) => {
      setResult(res.data.data);
      setError('');
      refetch();
    },
    onError: (err) => setError(apiError(err)),
  });

  const handleRun = () => {
    setResult(null);
    setError('');
    if (beyondNextMonth) return;
    if (!window.confirm(
      `Create ${rows.length} PBS claim(s) for ${MONTH_NAMES[month - 1]} ${year}? ` +
      `This flags each scheme as claimed and cannot be undone in bulk.`
    )) return;
    runMut.mutate();
  };

  const handleExport = async () => {
    if (!result) return;
    setExporting(true);
    setError('');
    try {
      const res = await pbsApi.exportTransfer({ month: result.month, year: result.year, claimIds: result.claimIds });
      const ym  = `${result.year}${String(result.month).padStart(2, '0')}`;
      const url = URL.createObjectURL(res.data as Blob);
      const a   = document.createElement('a');
      a.href = url;
      a.download = `pbs-auto-transfer-${ym}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(apiError(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <Link to="/pbs" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Zurich PBS
      </Link>

      <div>
        <h1 className="text-xl font-semibold text-gray-900">Auto Transfer to Claim</h1>
        <p className="mt-1 text-sm text-gray-500">
          Bulk-create PBS claims for all schemes whose payback falls due in the selected month and year.
          Only schemes that are in PBS and have not been claimed are included.
        </p>
      </div>

      <Card>
        <div className="px-4 py-4 border-b flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Payback Month</label>
            <select
              value={month}
              onChange={e => { setMonth(Number(e.target.value)); setResult(null); }}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Year</label>
            <input
              type="number"
              value={year}
              min={1990}
              max={2099}
              onChange={e => { setYear(Number(e.target.value)); setResult(null); }}
              className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3 ml-auto">
            {beyondNextMonth && (
              <div className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Can only run for the current or next month.
              </div>
            )}
            <Button onClick={handleRun} loading={runMut.isPending} disabled={isLoading || rows.length === 0 || beyondNextMonth}>
              <ArrowRightLeft className="h-4 w-4" />
              Run Auto Transfer
            </Button>
          </div>
        </div>

        {result && (
          <div className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Created {result.count} PBS claim{result.count !== 1 ? 's' : ''} for {MONTH_NAMES[result.month - 1]} {result.year}.</span>
            {result.count > 0 && (
              <Button variant="secondary" onClick={handleExport} loading={exporting} className="ml-auto">
                <FileSpreadsheet className="h-4 w-4" />
                Export to Excel
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="mx-4 mt-4 flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {data && (
          <div className="px-4 py-2 text-sm text-gray-500 border-b">
            <span className="font-semibold text-gray-800">{data.meta.total.toLocaleString()}</span>
            {' '}scheme{data.meta.total !== 1 ? 's' : ''} due in {MONTH_NAMES[month - 1]} {year}
          </div>
        )}

        {isLoading && <PageSpinner />}

        {previewError && (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {apiError(previewError)}
          </div>
        )}

        {!isLoading && data && <PreviewTable rows={rows} />}
      </Card>
    </div>
  );
}
