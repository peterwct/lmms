import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, FileSpreadsheet, Search, AlertCircle } from 'lucide-react';
import { reportsApi, type MemberPreviewRow } from '../../api/reports';
import { apiError } from '../../api/client';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { PageSpinner } from '../../components/ui/Spinner';

function PreviewTable({ rows }: { rows: MemberPreviewRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-blue-900 text-white">
          <tr>
            {['#', 'Membership No.', 'Full Name', 'IC New', 'IC Old',
              'Tel Mobile', 'Email', 'Mailing Address', 'Co Code', 'Agreement No.', 'Agmt Status',
            ].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={row.membershipNo + i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
              <td className="px-3 py-2 text-gray-500">{row.no}</td>
              <td className="px-3 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{row.membershipNo}</td>
              <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{row.fullName}</td>
              <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{row.icNew || '—'}</td>
              <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{row.icOld || '—'}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.telMobile || '—'}</td>
              <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate" title={row.email}>{row.email || '—'}</td>
              <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate" title={row.mailAddr}>{row.mailAddr || '—'}</td>
              <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{row.coCode || '—'}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.agmtNos || '—'}</td>
              <td className="px-3 py-2 whitespace-nowrap">{row.agmtStatus || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={11} className="px-4 py-8 text-center text-gray-400">No records found for the selected filters.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function MemberReport() {
  const [coCode,       setCoCode]       = useState('');
  const [acctClassify, setAcctClassify] = useState('');

  // appliedFilters is only set when Preview is clicked — drives the query
  const [appliedFilters, setAppliedFilters] = useState<{ coCode?: string; acctClassify?: string } | null>(null);

  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [downloadError, setDownloadError] = useState('');

  const { data: preview, isFetching: previewLoading, error: previewError } = useQuery({
    queryKey: ['members-report-preview', appliedFilters?.coCode, appliedFilters?.acctClassify],
    queryFn: () => reportsApi.membersPreview({
      coCode:       appliedFilters?.coCode,
      acctClassify: appliedFilters?.acctClassify,
    }).then(r => r.data),
    enabled: appliedFilters !== null,
  });

  const handlePreview = () => {
    setAppliedFilters({
      coCode:       coCode       || undefined,
      acctClassify: acctClassify || undefined,
    });
  };

  const busy = pdfLoading || excelLoading;

  const handleDownload = async (format: 'pdf' | 'excel') => {
    if (format === 'pdf')   setPdfLoading(true);
    else                    setExcelLoading(true);
    setDownloadError('');

    try {
      const res = await reportsApi.membersReport({
        coCode:       coCode       || undefined,
        acctClassify: acctClassify || undefined,
        format,
      });

      const ext     = format === 'pdf' ? 'pdf' : 'xlsx';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url     = URL.createObjectURL(res.data as Blob);
      const a       = document.createElement('a');
      a.href        = url;
      a.download    = `members-report-${dateStr}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(apiError(err));
    } finally {
      if (format === 'pdf')   setPdfLoading(false);
      else                    setExcelLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Member Detail Listing</h2>
        <p className="text-sm text-gray-500 mt-1">
          Filter and preview members before downloading the report. Leave filters blank to include all members.
        </p>
      </div>

      {/* Filters + actions */}
      <Card>
        <CardBody>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Code</label>
                <Select value={coCode} onChange={e => setCoCode(e.target.value)} className="w-full">
                  <option value="">All Companies</option>
                  <option value="03">03 — LHC-A</option>
                  <option value="15">15 — LHC-B</option>
                  <option value="02">02 — CP</option>
                </Select>
                <p className="text-xs text-gray-400 mt-1">Members with agreements for this company.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Agreement Status</label>
                <Select value={acctClassify} onChange={e => setAcctClassify(e.target.value)} className="w-full">
                  <option value="">All Statuses</option>
                  <option value="NA">Active (NA)</option>
                  <option value="SU">Suspended (SU)</option>
                  <option value="PT">Pending Termination (PT)</option>
                  <option value="TM">Terminated (TM)</option>
                </Select>
                <p className="text-xs text-gray-400 mt-1">Filters by agreement account classification.</p>
              </div>
            </div>

            {/* Preview button */}
            <div className="flex items-center gap-3">
              <Button onClick={handlePreview} loading={previewLoading} variant="secondary" className="gap-2">
                <Search className="h-4 w-4" />
                Preview
              </Button>
              {preview && (
                <span className="text-sm text-gray-500">
                  Showing first <span className="font-semibold">{preview.meta.shown}</span> of{' '}
                  <span className="font-semibold text-blue-700">{preview.meta.total.toLocaleString()}</span> total records
                </span>
              )}
            </div>

            {/* Download section */}
            <div className="border-t pt-5">
              <p className="text-sm font-medium text-gray-700 mb-3">Download Full Report</p>

              {downloadError && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {downloadError}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => handleDownload('pdf')}
                  disabled={busy}
                  loading={pdfLoading}
                  variant="primary"
                >
                  <FileText className="h-4 w-4" />
                  Download PDF
                </Button>

                <Button
                  onClick={() => handleDownload('excel')}
                  disabled={busy}
                  loading={excelLoading}
                  variant="secondary"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Download Excel
                </Button>
              </div>

              <div className="mt-3 rounded-md bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 space-y-1">
                <p><span className="font-semibold">PDF</span> — Landscape A4 table: membership no., name, IC, contact, mailing address, agreements.</p>
                <p><span className="font-semibold">Excel</span> — Full dataset with individual address fields, agreement dates, and member type.</p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Preview table */}
      {previewError && (
        <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {apiError(previewError)}
        </div>
      )}

      {previewLoading && <PageSpinner />}

      {!previewLoading && preview && (
        <Card>
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">
              Preview — first {preview.meta.shown} of {preview.meta.total.toLocaleString()} records
            </p>
            <p className="text-xs text-gray-400">
              {preview.meta.total > preview.meta.shown
                ? `${preview.meta.total - preview.meta.shown} more records in the downloaded file`
                : 'All records shown'}
            </p>
          </div>
          <PreviewTable rows={preview.data} />
        </Card>
      )}
    </div>
  );
}
