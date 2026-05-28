import { useState } from 'react';
import { FileText, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { reportsApi } from '../../api/reports';
import { apiError } from '../../api/client';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';

export function MemberReport() {
  const [coCode, setCoCode] = useState('');
  const [status, setStatus] = useState('');
  const [pdfLoading,   setPdfLoading]   = useState(false);
  const [excelLoading, setExcelLoading] = useState(false);
  const [error, setError] = useState('');

  const busy = pdfLoading || excelLoading;

  const handleDownload = async (format: 'pdf' | 'excel') => {
    if (format === 'pdf')   setPdfLoading(true);
    else                    setExcelLoading(true);
    setError('');

    try {
      const res = await reportsApi.membersReport({
        coCode: coCode || undefined,
        status: status || undefined,
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
      setError(apiError(err));
    } finally {
      if (format === 'pdf')   setPdfLoading(false);
      else                    setExcelLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-gray-800">Member Detail Listing</h2>
        <p className="text-sm text-gray-500 mt-1">
          Generate a printable report of members with their contact details, IC numbers, and agreement information.
          Leave filters blank to include all members.
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Code</label>
                <Select value={coCode} onChange={e => setCoCode(e.target.value)} className="w-full">
                  <option value="">All Companies</option>
                  <option value="03">03 — LHC-A</option>
                  <option value="15">15 — LHC-B</option>
                  <option value="02">02 — CP</option>
                </Select>
                <p className="text-xs text-gray-400 mt-1">Filters by members who have agreements with this company.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Member Status</label>
                <Select value={status} onChange={e => setStatus(e.target.value)} className="w-full">
                  <option value="">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="CLOSED">Closed</option>
                  <option value="DECEASED">Deceased</option>
                  <option value="TRANSFERRED">Transferred</option>
                </Select>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="border-t pt-5">
              <p className="text-sm font-medium text-gray-700 mb-3">Download Report</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => handleDownload('pdf')}
                  disabled={busy}
                  loading={pdfLoading}
                  variant="primary"
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Download PDF
                </Button>

                <Button
                  onClick={() => handleDownload('excel')}
                  disabled={busy}
                  loading={excelLoading}
                  variant="secondary"
                  className="gap-2"
                >
                  <FileSpreadsheet className="h-4 w-4" />
                  Download Excel
                </Button>
              </div>

              <div className="mt-4 rounded-md bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 space-y-1">
                <p><span className="font-semibold">PDF</span> — Landscape A4 table: membership no., name, IC, contact, mailing address, agreements. Best for printing.</p>
                <p><span className="font-semibold">Excel</span> — Full dataset with all address fields, agreement dates, and member type. Best for data analysis.</p>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
