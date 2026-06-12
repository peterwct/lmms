import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { reportsApi, type ExpiringMemberPreviewRow } from '../../api/reports';
import { apiError } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function PreviewTable({ rows }: { rows: ExpiringMemberPreviewRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {['#', 'Co Code', 'Name', 'Membership No.', 'Agreement No.', 'Agreement Date', 'Expiry Date', 'AMC Billed', 'Total AMC', 'Status'].map(h => (
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
              <td colSpan={10} className="px-4 py-8 text-center text-gray-400">No agreements found for this period.</td>
            </tr>
          )}
          {rows.map((row, i) => {
            const base = i % 2 === 0 ? 'bg-white' : 'bg-blue-50';
            return (
              <tr key={i} className={base}>
                <td className="px-3 py-1.5 border border-gray-200 text-gray-500">{row.no}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{row.coCode}</td>
                <td className="px-3 py-1.5 border border-gray-200">{row.fullName}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{row.membershipNo}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{row.agreementNo}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{row.agreementDate}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap font-medium text-blue-700">{row.expiryDate}</td>
                <td className="px-3 py-1.5 border border-gray-200 text-right">{row.amcBilled}</td>
                <td className="px-3 py-1.5 border border-gray-200 text-right">{row.totalAmc}</td>
                <td className="px-3 py-1.5 border border-gray-200 whitespace-nowrap">{row.acctClassify}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ExpiringMembersReport() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());

  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['expiring-members-preview', month, year],
    queryFn: () => reportsApi.expiringMembersPreview({ month, year }).then(r => r.data),
  });

  const busy = pdfLoading || excelLoading;

  const handleDownload = async (format: 'pdf' | 'excel') => {
    if (format === 'pdf') setPdfLoading(true);
    else                  setExcelLoading(true);
    setDownloadError('');

    try {
      const res  = await reportsApi.expiringMembersReport({ month, year, format });
      const ext  = format === 'pdf' ? 'pdf' : 'xlsx';
      const ym   = `${year}${String(month).padStart(2, '0')}`;
      const url  = URL.createObjectURL(res.data as Blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `expiring-members-${ym}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(apiError(err));
    } finally {
      if (format === 'pdf') setPdfLoading(false);
      else                  setExcelLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">List of Expiring Members</h2>
        <p className="text-sm text-gray-500 mt-1">
          Agreements expiring in the selected month and year, grouped by company code. Excludes terminated (TM) agreements.
        </p>
      </div>

      <Card>
        <div className="px-4 py-4 border-b flex flex-wrap items-end gap-4">
          {/* Month filter */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Month</label>
            <select
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {MONTH_NAMES.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>

          {/* Year filter */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Year</label>
            <input
              type="number"
              value={year}
              min={2000}
              max={2099}
              onChange={e => setYear(Number(e.target.value))}
              className="w-24 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {downloadError && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {downloadError}
              </div>
            )}
            <Button onClick={() => handleDownload('pdf')} disabled={busy} loading={pdfLoading} variant="primary">
              <FileText className="h-4 w-4" />
              Download PDF
            </Button>
            <Button onClick={() => handleDownload('excel')} disabled={busy} loading={excelLoading} variant="secondary">
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
            agreement{data.meta.total !== 1 ? 's' : ''} expiring in {MONTH_NAMES[month - 1]} {year}
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
