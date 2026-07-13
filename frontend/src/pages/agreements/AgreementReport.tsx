import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { FileText, FileSpreadsheet, Search, AlertCircle, ArrowLeft } from 'lucide-react';
import {
  reportsApi,
  type AgreementIndPreviewRow,
  type AgreementCorpPreviewRow,
} from '../../api/reports';
import { apiError } from '../../api/client';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { PageSpinner } from '../../components/ui/Spinner';

function IndPreviewTable({ rows }: { rows: AgreementIndPreviewRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-blue-900 text-white">
          <tr>
            {['#', 'Agreement No.', 'Agmt Date', 'Member Name', 'Old IC / Passport',
              'New IC No.', 'Date of Birth', 'Sex', 'Race', 'Nationality',
              'Mailing Address', 'Tel No.', 'Mobile No.', 'Email',
            ].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={row.agmtNo + i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
              <td className="px-3 py-2 text-gray-500">{row.no}</td>
              <td className="px-3 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{row.agmtNo}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.agmtDate || '—'}</td>
              <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{row.fullName}</td>
              <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{row.icOld || '—'}</td>
              <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{row.icNew || '—'}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.dob || '—'}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.gender || '—'}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.race || '—'}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.nationality || '—'}</td>
              <td className="px-3 py-2 text-gray-600 max-w-[200px] truncate" title={row.mailAddr}>{row.mailAddr || '—'}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.telHome || '—'}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.telMobile || '—'}</td>
              <td className="px-3 py-2 text-gray-600 max-w-[160px] truncate" title={row.email}>{row.email || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={14} className="px-4 py-8 text-center text-gray-400">No records found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function CorpPreviewTable({ rows }: { rows: AgreementCorpPreviewRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-blue-900 text-white">
          <tr>
            {['#', 'Agreement No.', 'Agreement Date', 'Company Name', 'Reg. No.', 'Mailing Address'].map(h => (
              <th key={h} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={row.agmtNo + i} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50'}>
              <td className="px-3 py-2 text-gray-500">{row.no}</td>
              <td className="px-3 py-2 font-mono font-semibold text-gray-800 whitespace-nowrap">{row.agmtNo}</td>
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{row.agmtDate || '—'}</td>
              <td className="px-3 py-2 text-gray-800 whitespace-nowrap">{row.fullName}</td>
              <td className="px-3 py-2 font-mono text-gray-600 whitespace-nowrap">{row.registrationNo || '—'}</td>
              <td className="px-3 py-2 text-gray-600 max-w-[280px] truncate" title={row.mailAddr}>{row.mailAddr || '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No records found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

type MemberTypeFilter = 'INDIVIDUAL' | 'CORPORATE';

interface AppliedFilters {
  coCode?: string;
  memberType: MemberTypeFilter;
}

export function AgreementReport() {
  const [coCode,     setCoCode]     = useState('');
  const [memberType, setMemberType] = useState<MemberTypeFilter>('INDIVIDUAL');

  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters | null>(null);
  const [pdfLoading,     setPdfLoading]     = useState(false);
  const [excelLoading,   setExcelLoading]   = useState(false);
  const [downloadError,  setDownloadError]  = useState('');

  const indQuery = useQuery({
    queryKey: ['agreements-report-preview', 'INDIVIDUAL', appliedFilters?.coCode],
    queryFn: () => reportsApi.agreementsIndPreview({ coCode: appliedFilters?.coCode }).then(r => r.data),
    enabled: appliedFilters !== null && appliedFilters.memberType === 'INDIVIDUAL',
  });

  const corpQuery = useQuery({
    queryKey: ['agreements-report-preview', 'CORPORATE', appliedFilters?.coCode],
    queryFn: () => reportsApi.agreementsCorpPreview({ coCode: appliedFilters?.coCode }).then(r => r.data),
    enabled: appliedFilters !== null && appliedFilters.memberType === 'CORPORATE',
  });

  const preview        = appliedFilters?.memberType === 'CORPORATE' ? corpQuery.data  : indQuery.data;
  const previewLoading = appliedFilters?.memberType === 'CORPORATE' ? corpQuery.isFetching : indQuery.isFetching;
  const previewError   = appliedFilters?.memberType === 'CORPORATE' ? corpQuery.error : indQuery.error;

  const handlePreview = () => {
    setAppliedFilters({ coCode: coCode || undefined, memberType });
  };

  const busy = pdfLoading || excelLoading;

  const handleDownload = async (format: 'pdf' | 'excel') => {
    if (format === 'pdf') setPdfLoading(true);
    else                  setExcelLoading(true);
    setDownloadError('');

    try {
      const res = await reportsApi.agreementsReport({
        coCode:     coCode     || undefined,
        memberType: memberType || undefined,
        format,
      });

      const ext     = format === 'pdf' ? 'pdf' : 'xlsx';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const url     = URL.createObjectURL(res.data as Blob);
      const a       = document.createElement('a');
      a.href        = url;
      a.download    = `agreement-detail-report-${dateStr}.${ext}`;
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

  const isCorp = memberType === 'CORPORATE';

  return (
    <div className="space-y-4">
      <Link to="/reports" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Reports
      </Link>
      <div>
        <h2 className="text-lg font-bold text-gray-800">Agreement Detail Report</h2>
        <p className="text-sm text-gray-500 mt-1">
          Active agreements filtered by company code and member type. Preview first 20 records or download the full report.
        </p>
      </div>

      <Card>
        <CardBody>
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Member Type</label>
                <Select
                  value={memberType}
                  onChange={e => {
                    setMemberType(e.target.value as MemberTypeFilter);
                    setAppliedFilters(null);
                  }}
                  className="w-full"
                >
                  <option value="INDIVIDUAL">Individual</option>
                  <option value="CORPORATE">Corporate</option>
                </Select>
                <p className="text-xs text-gray-400 mt-1">
                  {isCorp
                    ? 'Columns: agreement no., date, company name, reg. no., mailing address.'
                    : 'Columns: agreement no., date, name, IC, DOB, sex, race, nationality, address, tel, mobile, email.'}
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company Code</label>
                <Select value={coCode} onChange={e => setCoCode(e.target.value)} className="w-full">
                  <option value="">All Companies</option>
                  <option value="LHC">LHC (03 + 15)</option>
                  <option value="CP">CP (02)</option>
                </Select>
                <p className="text-xs text-gray-400 mt-1">LHC includes both LHC-A (03) and LHC-B (15).</p>
              </div>

              <div className="flex flex-col justify-end">
                <p className="text-xs text-gray-500">
                  <span className="font-medium">Fixed condition:</span> Active agreements (NA) only
                </p>
              </div>
            </div>

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

            <div className="border-t pt-5">
              <p className="text-sm font-medium text-gray-700 mb-3">Download Full Report</p>

              {downloadError && (
                <div className="flex items-center gap-2 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-3">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {downloadError}
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                <Button onClick={() => handleDownload('pdf')} disabled={busy} loading={pdfLoading} variant="primary">
                  <FileText className="h-4 w-4" />
                  Download PDF
                </Button>
                <Button onClick={() => handleDownload('excel')} disabled={busy} loading={excelLoading} variant="secondary">
                  <FileSpreadsheet className="h-4 w-4" />
                  Download Excel
                </Button>
              </div>

              <div className="mt-3 rounded-md bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 space-y-1">
                {isCorp ? (
                  <>
                    <p><span className="font-semibold">PDF</span> — Landscape A4: agreement no., date, company name, registration no., mailing address.</p>
                    <p><span className="font-semibold">Excel</span> — Expanded address columns (Mail Add 1/2/3, City/State, Postcode).</p>
                  </>
                ) : (
                  <>
                    <p><span className="font-semibold">PDF</span> — Landscape A4: agreement no., date, name, IC, DOB, sex, race, nationality, mailing address, telephone, mobile, email.</p>
                    <p><span className="font-semibold">Excel</span> — Full dataset with individual address fields (Mail Add 1/2/3, City/State, Postcode).</p>
                  </>
                )}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>

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
              <span className="ml-2 text-xs font-normal text-gray-400">({isCorp ? 'Corporate' : 'Individual'})</span>
            </p>
            <p className="text-xs text-gray-400">
              {preview.meta.total > preview.meta.shown
                ? `${preview.meta.total - preview.meta.shown} more records in the downloaded file`
                : 'All records shown'}
            </p>
          </div>
          {isCorp
            ? <CorpPreviewTable rows={(preview.data as AgreementCorpPreviewRow[])} />
            : <IndPreviewTable  rows={(preview.data as AgreementIndPreviewRow[])} />
          }
        </Card>
      )}
    </div>
  );
}
