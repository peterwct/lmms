import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { reportsApi, type ExpirySummaryRow } from '../../api/reports';
import { apiError } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

const CO_OPTIONS: { value: 'LHC' | 'CP'; label: string }[] = [
  { value: 'LHC', label: 'LHC (03 & 15)' },
  { value: 'CP',  label: 'CP (02)' },
];

function n(v: number): string {
  return v === 0 ? '-' : v.toLocaleString();
}

function SummaryTable({ rows }: { rows: ExpirySummaryRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      naRa:  acc.naRa  + r.naRa,
      suLe3: acc.suLe3 + r.suLe3,
      suGt3: acc.suGt3 + r.suGt3,
      ptLe3: acc.ptLe3 + r.ptLe3,
      ptGt3: acc.ptGt3 + r.ptGt3,
      total: acc.total + r.total,
    }),
    { naRa: 0, suLe3: 0, suGt3: 0, ptLe3: 0, ptGt3: 0, total: 0 },
  );

  return (
    <div className="overflow-x-auto w-[70%]">
      <table className="w-full text-sm border-collapse">
        <thead>
          {/* Group header row */}
          <tr>
            <th
              rowSpan={2}
              className="px-4 py-2 text-left font-bold bg-blue-900 text-white border border-blue-700 whitespace-nowrap align-middle"
            >
              Expiry Year
            </th>
            <th colSpan={5} className="px-4 py-2 text-center font-bold bg-blue-900 text-white border border-blue-700">
              Status
            </th>
            <th
              rowSpan={2}
              className="px-4 py-2 text-right font-bold bg-blue-900 text-white border border-blue-700 whitespace-nowrap align-middle"
            >
              Total
            </th>
          </tr>
          {/* Sub-header row */}
          <tr>
            {['NA/RA', 'SU ≤3 Yr', 'SU >3 Yr', 'PT ≤3 Yr', 'PT >3 Yr'].map((h, i) => (
              <th key={i} className="px-4 py-2 text-right font-semibold bg-blue-800 text-white border border-blue-700 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-gray-400">No data found.</td>
            </tr>
          )}
          {rows.map((row, i) => {
            const base = i % 2 === 0 ? 'bg-white' : 'bg-blue-50';
            return (
              <tr key={row.year} className={base}>
                <td className="px-4 py-2 text-left font-semibold border border-gray-200 whitespace-nowrap">{row.year}</td>
                <td className="px-4 py-2 text-right border border-gray-200">{n(row.naRa)}</td>
                <td className="px-4 py-2 text-right border border-gray-200">{n(row.suLe3)}</td>
                <td className="px-4 py-2 text-right border border-gray-200">{n(row.suGt3)}</td>
                <td className="px-4 py-2 text-right border border-gray-200">{n(row.ptLe3)}</td>
                <td className="px-4 py-2 text-right border border-gray-200">{n(row.ptGt3)}</td>
                <td className="px-4 py-2 text-right font-semibold border border-gray-200">{n(row.total)}</td>
              </tr>
            );
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-blue-900 text-white font-bold">
              <td className="px-4 py-2 text-left border border-blue-700 whitespace-nowrap">Grand Total</td>
              <td className="px-4 py-2 text-right border border-blue-700">{n(totals.naRa)}</td>
              <td className="px-4 py-2 text-right border border-blue-700">{n(totals.suLe3)}</td>
              <td className="px-4 py-2 text-right border border-blue-700">{n(totals.suGt3)}</td>
              <td className="px-4 py-2 text-right border border-blue-700">{n(totals.ptLe3)}</td>
              <td className="px-4 py-2 text-right border border-blue-700">{n(totals.ptGt3)}</td>
              <td className="px-4 py-2 text-right border border-blue-700">{n(totals.total)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function ExpirySummaryReport() {
  const [coCode, setCoCode] = useState<'LHC' | 'CP'>('LHC');
  const [pdfLoading,    setPdfLoading]    = useState(false);
  const [excelLoading,  setExcelLoading]  = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['expiry-summary-preview', coCode],
    queryFn:  () => reportsApi.expirySummaryPreview({ coCode }).then(r => r.data),
  });

  const busy = pdfLoading || excelLoading;

  const handleDownload = async (format: 'pdf' | 'excel') => {
    if (format === 'pdf') setPdfLoading(true);
    else                  setExcelLoading(true);
    setDownloadError('');

    try {
      const res     = await reportsApi.expirySummaryReport({ coCode, format });
      const ext     = format === 'pdf' ? 'pdf' : 'xlsx';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url     = URL.createObjectURL(res.data as Blob);
      const a       = document.createElement('a');
      a.href        = url;
      a.download    = `expiry-summary-${coCode.toLowerCase()}-${dateStr}.${ext}`;
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
        <h2 className="text-lg font-bold text-gray-800">Summary of Expiring Members by Years</h2>
        <p className="text-sm text-gray-500 mt-1">
          Agreements grouped by expiry year with counts by status category (NA/RA, SU and PT broken down by years in status).
          Excludes terminated (TM) agreements.
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
            <span className="font-semibold text-gray-800">{data.data.length}</span> expiry years &mdash;&nbsp;
            <span className="font-semibold text-blue-700">{data.meta.totalAgreements.toLocaleString()}</span> agreements total
          </div>
        )}

        {isLoading && <PageSpinner />}

        {error && (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {apiError(error)}
          </div>
        )}

        {!isLoading && data && <SummaryTable rows={data.data} />}
      </Card>
    </div>
  );
}
