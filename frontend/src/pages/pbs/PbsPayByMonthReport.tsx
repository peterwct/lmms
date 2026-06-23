import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pbsApi } from '../../api/pbs';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { ArrowLeft, Download } from 'lucide-react';

interface StatusCounts { na: number; su: number; pt: number; tm: number; total: number }
interface PbsPayRow {
  year: number;
  month: number;
  k19: StatusCounts & { totalRM: number };
  k21: StatusCounts & { totalRM: number };
}

function pad(s: string, w: number): string { return s.padStart(w); }
function fmtN(n: number): string { return n.toLocaleString('en-US'); }
function fmtRM(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MONTH_NAMES = ['', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function buildFullText(rows: PbsPayRow[], totals: { k19: StatusCounts; k21: StatusCounts } | undefined): string {
  const W = 210;
  const SEP = '-'.repeat(W);
  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getFullYear()}`;
  const lines: string[] = [];

  lines.push(pad(`Date: ${dateStr}`, W));
  const title = `PBS Payback Report II For ${MONTH_NAMES[now.getMonth() + 1]} ${now.getFullYear()}`;
  const titlePad = Math.max(0, Math.floor((W - title.length) / 2));
  lines.push(' '.repeat(titlePad) + title);
  lines.push(SEP);
  lines.push(
    'Payback Period  ' +
    '<-------------------------------RM19K Pay Back Scheme-------------------------------------------------->' +
    '    ' +
    '<--------------------------------RM21K Payback Scheme------------------------------------------------>'
  );
  lines.push(SEP);
  lines.push(
    pad('Year', 4) + '     ' + pad('Month', 5) +
    pad('NA/RA', 7) + pad('Total (RM)', 15) +
    pad('SU', 7) + pad('Total (RM)', 15) +
    pad('PT', 7) + pad('Total (RM)', 15) +
    pad('TM', 7) + pad('Total (RM)', 15) +
    pad('Ttl 19K', 8) + pad('Total (RM)', 15) +
    '    ' +
    pad('NA/RA', 7) + pad('Total (RM)', 14) +
    pad('SU', 7) + pad('Total (RM)', 15) +
    pad('PT', 7) + pad('Total (RM)', 15) +
    pad('TM', 7) + pad('Total (RM)', 15) +
    pad('Ttl 21K', 8) + pad('Total (RM)', 15)
  );
  lines.push(SEP);

  for (const r of rows) {
    lines.push(
      pad(String(r.year), 4) + '     ' + pad(String(r.month).padStart(2, '0'), 5) +
      pad(fmtN(r.k19.na), 7) + pad(fmtRM(r.k19.na * 19000), 15) +
      pad(fmtN(r.k19.su), 7) + pad(fmtRM(r.k19.su * 19000), 15) +
      pad(fmtN(r.k19.pt), 7) + pad(fmtRM(r.k19.pt * 19000), 15) +
      pad(fmtN(r.k19.tm), 7) + pad(fmtRM(r.k19.tm * 19000), 15) +
      pad(fmtN(r.k19.total), 8) + pad(fmtRM(r.k19.totalRM), 15) +
      '    ' +
      pad(fmtN(r.k21.na), 7) + pad(fmtRM(r.k21.na * 21000), 14) +
      pad(fmtN(r.k21.su), 7) + pad(fmtRM(r.k21.su * 21000), 15) +
      pad(fmtN(r.k21.pt), 7) + pad(fmtRM(r.k21.pt * 21000), 15) +
      pad(fmtN(r.k21.tm), 7) + pad(fmtRM(r.k21.tm * 21000), 15) +
      pad(fmtN(r.k21.total), 8) + pad(fmtRM(r.k21.totalRM), 15)
    );
  }

  lines.push(SEP);

  if (totals) {
    lines.push(
      pad('Total :', 14) +
      pad(fmtN(totals.k19.na), 7) + pad('', 15) +
      pad(fmtN(totals.k19.su), 7) + pad('', 15) +
      pad(fmtN(totals.k19.pt), 7) + pad('', 15) +
      pad(fmtN(totals.k19.tm), 7) + pad('', 15) +
      pad(fmtN(totals.k19.total), 8) + pad('', 15) +
      '    ' +
      pad(fmtN(totals.k21.na), 7) + pad('', 14) +
      pad(fmtN(totals.k21.su), 7) + pad('', 15) +
      pad(fmtN(totals.k21.pt), 7) + pad('', 15) +
      pad(fmtN(totals.k21.tm), 7) + pad('', 15) +
      pad(fmtN(totals.k21.total), 8) + pad('', 15)
    );
    lines.push(SEP);
  }

  return lines.join('\n');
}

export function PbsPayByMonthReport() {
  const { data, isLoading } = useQuery({
    queryKey: ['pbs-pay-by-month'],
    queryFn: () => pbsApi.previewPayByMonth().then(r => r.data as {
      data: PbsPayRow[];
      meta: { totalRows: number; totals: { k19: StatusCounts; k21: StatusCounts } };
    }),
  });

  const handleDownload = () => {
    if (!rows.length) return;
    const text = buildFullText(rows, totals);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pbs-pay-by-month.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = data?.data ?? [];
  const totals = data?.meta?.totals;
  const previewText = useMemo(() => buildFullText(rows, totals), [rows, totals]);

  return (
    <div className="space-y-4">
      <Link to="/pbs" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Zurich PBS
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">PBS Pay By Month/Year</h1>
          <p className="mt-1 text-sm text-gray-500">
            PBS payback amounts grouped by year and month, split by 19K and 21K scheme types. Excludes claimed records.
          </p>
        </div>
        <Button onClick={handleDownload} disabled={!rows.length} size="sm">
          <Download className="h-4 w-4 mr-1.5" />
          Download Text
        </Button>
      </div>

      {isLoading ? <PageSpinner /> : rows.length === 0 ? (
        <Card>
          <div className="px-6 py-12 text-center text-gray-400">No PBS payback records found.</div>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto p-4">
            <pre className="text-xs leading-5 text-gray-700 font-mono">{previewText}</pre>
          </div>
        </Card>
      )}
    </div>
  );
}
