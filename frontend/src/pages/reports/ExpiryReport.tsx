import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileText, FileSpreadsheet, AlertCircle, Search, ArrowLeft } from 'lucide-react';
import { reportsApi, type ExpiryRow } from '../../api/reports';
import { apiError } from '../../api/client';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { PageSpinner } from '../../components/ui/Spinner';

function n(v: number): string {
  return v === 0 ? '-' : v.toLocaleString();
}

function ExpiryTable({ rows }: { rows: ExpiryRow[] }) {
  const totals = rows.reduce(
    (acc, r) => ({
      lhcNa: acc.lhcNa + r.lhcNa,
      lhcNonNa: acc.lhcNonNa + r.lhcNonNa,
      lhcTotal: acc.lhcTotal + r.lhcTotal,
      cpNa: acc.cpNa + r.cpNa,
      cpNonNa: acc.cpNonNa + r.cpNonNa,
      cpTotal: acc.cpTotal + r.cpTotal,
      combinedNa: acc.combinedNa + r.combinedNa,
      combinedNonNa: acc.combinedNonNa + r.combinedNonNa,
      combinedTotal: acc.combinedTotal + r.combinedTotal,
    }),
    { lhcNa: 0, lhcNonNa: 0, lhcTotal: 0, cpNa: 0, cpNonNa: 0, cpTotal: 0, combinedNa: 0, combinedNonNa: 0, combinedTotal: 0 },
  );
  const lastRow = rows[rows.length - 1];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          {/* Group header row */}
          <tr>
            <th
              rowSpan={2}
              className="px-3 py-2 text-center font-bold bg-blue-900 text-white border border-blue-700 whitespace-nowrap align-middle"
            >
              Expiry Year
            </th>
            <th colSpan={3} className="px-3 py-2 text-center font-bold bg-blue-900 text-white border border-blue-700">
              LHC
            </th>
            <th colSpan={3} className="px-3 py-2 text-center font-bold bg-blue-900 text-white border border-blue-700">
              CP
            </th>
            <th colSpan={3} className="px-3 py-2 text-center font-bold bg-blue-900 text-white border border-blue-700">
              LHC &amp; CP
            </th>
            <th colSpan={3} className="px-3 py-2 text-center font-bold bg-blue-800 text-white border border-blue-700">
              LHC &amp; CP Cumulative
            </th>
          </tr>
          {/* Sub-header row */}
          <tr>
            {['NA', 'Non-NA', 'Total', 'NA', 'Non-NA', 'Total', 'NA', 'Non-NA', 'Total'].map((h, i) => (
              <th key={i} className="px-3 py-1.5 text-right font-semibold bg-blue-800 text-white border border-blue-700 whitespace-nowrap">
                {h}
              </th>
            ))}
            {['NA', 'Non-NA', 'Total'].map((h, i) => (
              <th key={i} className="px-3 py-1.5 text-right font-semibold bg-blue-700 text-white border border-blue-600 whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={13} className="px-4 py-8 text-center text-gray-400">No data found.</td>
            </tr>
          )}
          {rows.map((row, i) => {
            const even = i % 2 === 0;
            const base = even ? 'bg-white' : 'bg-blue-50';
            const cum  = even ? 'bg-blue-100' : 'bg-blue-200';
            return (
              <tr key={row.year}>
                <td className={`px-3 py-1.5 text-left font-semibold border border-gray-200 whitespace-nowrap ${base}`}>
                  {row.year}
                </td>
                <td className={`px-3 py-1.5 text-right border border-gray-200 ${base}`}>{n(row.lhcNa)}</td>
                <td className={`px-3 py-1.5 text-right border border-gray-200 ${base}`}>{n(row.lhcNonNa)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold border border-gray-200 ${base}`}>{n(row.lhcTotal)}</td>
                <td className={`px-3 py-1.5 text-right border border-gray-200 ${base}`}>{n(row.cpNa)}</td>
                <td className={`px-3 py-1.5 text-right border border-gray-200 ${base}`}>{n(row.cpNonNa)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold border border-gray-200 ${base}`}>{n(row.cpTotal)}</td>
                <td className={`px-3 py-1.5 text-right border border-gray-200 ${base}`}>{n(row.combinedNa)}</td>
                <td className={`px-3 py-1.5 text-right border border-gray-200 ${base}`}>{n(row.combinedNonNa)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold border border-gray-200 ${base}`}>{n(row.combinedTotal)}</td>
                <td className={`px-3 py-1.5 text-right border border-blue-300 ${cum}`}>{n(row.cumNa)}</td>
                <td className={`px-3 py-1.5 text-right border border-blue-300 ${cum}`}>{n(row.cumNonNa)}</td>
                <td className={`px-3 py-1.5 text-right font-semibold border border-blue-300 ${cum}`}>{n(row.cumTotal)}</td>
              </tr>
            );
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-blue-900 text-white font-bold">
              <td className="px-3 py-2 text-left border border-blue-700 whitespace-nowrap">Total</td>
              <td className="px-3 py-2 text-right border border-blue-700">{n(totals.lhcNa)}</td>
              <td className="px-3 py-2 text-right border border-blue-700">{n(totals.lhcNonNa)}</td>
              <td className="px-3 py-2 text-right border border-blue-700">{n(totals.lhcTotal)}</td>
              <td className="px-3 py-2 text-right border border-blue-700">{n(totals.cpNa)}</td>
              <td className="px-3 py-2 text-right border border-blue-700">{n(totals.cpNonNa)}</td>
              <td className="px-3 py-2 text-right border border-blue-700">{n(totals.cpTotal)}</td>
              <td className="px-3 py-2 text-right border border-blue-700">{n(totals.combinedNa)}</td>
              <td className="px-3 py-2 text-right border border-blue-700">{n(totals.combinedNonNa)}</td>
              <td className="px-3 py-2 text-right border border-blue-700">{n(totals.combinedTotal)}</td>
              <td className="px-3 py-2 text-right border border-blue-600 bg-blue-800">{lastRow ? n(lastRow.cumNa) : '-'}</td>
              <td className="px-3 py-2 text-right border border-blue-600 bg-blue-800">{lastRow ? n(lastRow.cumNonNa) : '-'}</td>
              <td className="px-3 py-2 text-right border border-blue-600 bg-blue-800">{lastRow ? n(lastRow.cumTotal) : '-'}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

export function ExpiryReport() {
  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  // Preview only runs when the user clicks Preview.
  const [previewRequested, setPreviewRequested] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['expiry-report-preview'],
    queryFn: () => reportsApi.expiryPreview().then(r => r.data),
    enabled: previewRequested,
  });

  const busy = pdfLoading || excelLoading;

  const handleDownload = async (format: 'pdf' | 'excel') => {
    if (format === 'pdf') setPdfLoading(true);
    else                  setExcelLoading(true);
    setDownloadError('');

    try {
      const res     = await reportsApi.expiryReport(format);
      const ext     = format === 'pdf' ? 'pdf' : 'xlsx';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url     = URL.createObjectURL(res.data as Blob);
      const a       = document.createElement('a');
      a.href        = url;
      a.download    = `agreement-expiry-report-${dateStr}.${ext}`;
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
      <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Reports
      </Link>
      <div>
        <h2 className="text-lg font-bold text-gray-800">Senior Management Report — Analysis of Agreement Expiry</h2>
        <p className="text-sm text-gray-500 mt-1">
          Agreements (NA and Non-NA) grouped by expiry year, broken down by LHC and CP with running cumulative totals.
          Non-NA includes Suspended (SU) and Pending Termination (PT) only.
        </p>
      </div>

      <Card>
        <div className="px-4 py-4 border-b flex flex-wrap items-center gap-3">
          {downloadError && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700 w-full">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {downloadError}
            </div>
          )}
          <Button onClick={() => setPreviewRequested(true)} loading={previewRequested && isLoading} variant="secondary">
            <Search className="h-4 w-4" />
            Preview
          </Button>
          <Button onClick={() => handleDownload('pdf')} disabled={busy} loading={pdfLoading} variant="primary">
            <FileText className="h-4 w-4" />
            Download PDF
          </Button>
          <Button onClick={() => handleDownload('excel')} disabled={busy} loading={excelLoading} variant="secondary">
            <FileSpreadsheet className="h-4 w-4" />
            Download Excel
          </Button>
          {previewRequested && data && (
            <span className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{data.data.length}</span> expiry years &mdash;&nbsp;
              <span className="font-semibold text-blue-700">{data.meta.totalAgreements.toLocaleString()}</span> agreements total
            </span>
          )}
        </div>

        {!previewRequested && (
          <p className="px-4 py-8 text-center text-gray-400">Click Preview to load the report.</p>
        )}

        {previewRequested && isLoading && <PageSpinner />}

        {error && (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {apiError(error)}
          </div>
        )}

        {previewRequested && !isLoading && data && <ExpiryTable rows={data.data} />}
      </Card>
    </div>
  );
}
