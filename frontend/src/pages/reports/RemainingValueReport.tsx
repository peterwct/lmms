import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, AlertCircle } from 'lucide-react';
import { reportsApi, type RemainingValuePreviewRow } from '../../api/reports';
import { apiError } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

const CO_OPTIONS: { value: 'LHC' | 'CP'; label: string }[] = [
  { value: 'LHC', label: 'LHC (03 & 15)' },
  { value: 'CP',  label: 'CP (02)' },
];

function fmt(n: number): string {
  return n === 0 ? '-' : n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function PreviewTable({ rows }: { rows: RemainingValuePreviewRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {['#', 'Membership No.', 'Name', 'Agreement No.', 'Agreement Date', 'Expiry Date',
              'Net Purchase Price', 'Remaining Year', 'Value / Year', 'Remaining Value'].map(h => (
              <th
                key={h}
                className="px-3 py-2 text-left font-bold bg-blue-900 text-white border border-blue-700 whitespace-nowrap"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="px-4 py-8 text-center text-gray-400">No active agreements found.</td>
            </tr>
          )}
          {rows.map((row, i) => {
            const base = i % 2 === 0 ? 'bg-white' : 'bg-blue-50';
            return (
              <tr key={i} className={base}>
                <td className="px-3 py-1.5 border border-gray-200 text-gray-500">{row.no}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{row.membershipNo}</td>
                <td className="px-3 py-1.5 border border-gray-200">{row.fullName}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{row.agreementNo}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{row.agreementDate}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{row.expiryDate}</td>
                <td className="px-3 py-1.5 border border-gray-200 text-right">{fmt(row.purchasePrice)}</td>
                <td className="px-3 py-1.5 border border-gray-200 text-right">{row.remainingYear}</td>
                <td className="px-3 py-1.5 border border-gray-200 text-right">{fmt(row.valuePerYear)}</td>
                <td className="px-3 py-1.5 border border-gray-200 text-right font-medium text-blue-700">{fmt(row.remainingValue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RemainingValueReport() {
  const [coCode, setCoCode] = useState<'LHC' | 'CP'>('LHC');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['remaining-value-preview', coCode],
    queryFn: () => reportsApi.remainingValuePreview({ coCode }).then(r => r.data),
  });

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError('');
    try {
      const res     = await reportsApi.remainingValueReport({ coCode });
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url     = URL.createObjectURL(res.data as Blob);
      const a       = document.createElement('a');
      a.href        = url;
      a.download    = `remaining-value-${coCode.toLowerCase()}-${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(apiError(err));
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Remaining Value Report</h2>
        <p className="text-sm text-gray-500 mt-1">
          Year-by-year projected remaining book value of active agreements by company code.
          Excel includes yearly breakdown columns from next year through each agreement's expiry.
        </p>
      </div>

      <Card>
        <div className="px-4 py-4 border-b flex flex-wrap items-end gap-4">
          {/* Company filter */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Company</label>
            <select
              value={coCode}
              onChange={e => setCoCode(e.target.value as 'LHC' | 'CP')}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CO_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {downloadError && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {downloadError}
              </div>
            )}
            <Button onClick={handleDownload} disabled={downloading} loading={downloading} variant="primary">
              <FileSpreadsheet className="h-4 w-4" />
              Download Excel
            </Button>
          </div>
        </div>

        {data && (
          <div className="px-4 py-2 text-sm text-gray-500 border-b">
            Showing{' '}
            <span className="font-semibold text-gray-800">{data.meta.shown}</span>
            {data.meta.shown < data.meta.total && (
              <> of <span className="font-semibold text-blue-700">{data.meta.total.toLocaleString()}</span></>
            )}{' '}
            active agreements.{' '}
            {data.meta.startYear <= data.meta.endYear && (
              <span>
                Excel will include yearly columns from{' '}
                <span className="font-semibold text-gray-700">{data.meta.startYear}</span>
                {' '}to{' '}
                <span className="font-semibold text-gray-700">{data.meta.endYear}</span>
                {' '}({data.meta.endYear - data.meta.startYear + 1} columns).
              </span>
            )}
          </div>
        )}

        {isLoading && <PageSpinner />}

        {error && (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {apiError(error)}
          </div>
        )}

        {!isLoading && data && <PreviewTable rows={data.data} />}
      </Card>
    </div>
  );
}
