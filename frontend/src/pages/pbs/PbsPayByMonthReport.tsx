import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pbsApi } from '../../api/pbs';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { ArrowLeft, Download } from 'lucide-react';
import { clsx } from 'clsx';

interface StatusCounts { na: number; su: number; pt: number; tm: number; total: number }
interface PbsPayRow {
  year: number;
  month: number;
  k19: StatusCounts & { totalRM: number };
  k21: StatusCounts & { totalRM: number };
}
interface PbsPayYearRow {
  year: number;
  k19: StatusCounts & { totalRM: number };
  k21: StatusCounts & { totalRM: number };
  combined: StatusCounts & { totalRM: number };
}

function fmtN(n: number): string { return n.toLocaleString('en-US'); }
function fmtRM(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const SUB_HEADERS = ['NA/RA', 'RM', 'SU', 'RM', 'PT', 'RM', 'TM', 'RM', 'Ttl', 'RM'];

type Tab = 'monthly' | 'yearly';

export function PbsPayByMonthReport() {
  const [tab, setTab] = useState<Tab>('monthly');

  const { data, isLoading } = useQuery({
    queryKey: ['pbs-pay-by-month'],
    queryFn: () => pbsApi.previewPayByMonth().then(r => r.data as {
      data: PbsPayRow[];
      yearly: PbsPayYearRow[];
      meta: { totalRows: number; totals: { k19: StatusCounts; k21: StatusCounts } };
    }),
  });

  const rows = data?.data ?? [];
  const yearlyRows = data?.yearly ?? [];
  const totals = data?.meta?.totals;

  const handleDownload = async () => {
    const resp = await pbsApi.downloadPayByMonth();
    const blob = new Blob([resp.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pbs-pay-by-month-year.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const yTotals = useMemo(() => {
    const t = { k19: { na: 0, su: 0, pt: 0, tm: 0, total: 0 }, k21: { na: 0, su: 0, pt: 0, tm: 0, total: 0 }, combined: { na: 0, su: 0, pt: 0, tm: 0, total: 0 } };
    for (const r of yearlyRows) {
      t.k19.na += r.k19.na; t.k19.su += r.k19.su; t.k19.pt += r.k19.pt; t.k19.tm += r.k19.tm; t.k19.total += r.k19.total;
      t.k21.na += r.k21.na; t.k21.su += r.k21.su; t.k21.pt += r.k21.pt; t.k21.tm += r.k21.tm; t.k21.total += r.k21.total;
      t.combined.na += r.combined.na; t.combined.su += r.combined.su; t.combined.pt += r.combined.pt; t.combined.tm += r.combined.tm; t.combined.total += r.combined.total;
    }
    return t;
  }, [yearlyRows]);

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
            PBS payback amounts grouped by month and year, split by 19K and 21K scheme types. Excludes claimed records.
          </p>
        </div>
        <Button onClick={handleDownload} disabled={!rows.length && !yearlyRows.length} size="sm">
          <Download className="h-4 w-4 mr-1.5" />
          Download Excel
        </Button>
      </div>

      {isLoading ? <PageSpinner /> : (
        <>
          <div className="flex gap-1 border-b">
            <button
              onClick={() => setTab('monthly')}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === 'monthly'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              Pay By Month ({rows.length})
            </button>
            <button
              onClick={() => setTab('yearly')}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === 'yearly'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              Pay By Year ({yearlyRows.length})
            </button>
          </div>

          {tab === 'monthly' ? (
            rows.length === 0 ? (
              <Card>
                <div className="px-6 py-12 text-center text-gray-400">No PBS payback records found.</div>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-blue-600 text-white">
                        <th rowSpan={2} className="px-2 py-1.5 text-center font-medium border-r border-blue-500">Year</th>
                        <th rowSpan={2} className="px-2 py-1.5 text-center font-medium border-r border-blue-500">Month</th>
                        <th colSpan={10} className="px-2 py-1.5 text-center font-medium border-r border-blue-500">RM19K Pay Back Scheme</th>
                        <th colSpan={10} className="px-2 py-1.5 text-center font-medium">RM21K Payback Scheme</th>
                      </tr>
                      <tr className="bg-slate-800 text-white">
                        {SUB_HEADERS.map((h, i) => (
                          <th key={`19-${i}`} className="px-1.5 py-1.5 text-right font-medium border-r border-slate-700 whitespace-nowrap">{h}</th>
                        ))}
                        {SUB_HEADERS.map((h, i) => (
                          <th key={`21-${i}`} className="px-1.5 py-1.5 text-right font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={`${r.year}-${r.month}`} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                          <td className="px-2 py-1 text-center font-medium border-r">{r.year}</td>
                          <td className="px-2 py-1 text-center border-r">{String(r.month).padStart(2, '0')}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k19.na)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.na * 19000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k19.su)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.su * 19000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k19.pt)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.pt * 19000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k19.tm)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.tm * 19000)}</td>
                          <td className="px-1.5 py-1 text-right font-semibold">{fmtN(r.k19.total)}</td>
                          <td className="px-1.5 py-1 text-right font-mono font-semibold border-r">{fmtRM(r.k19.totalRM)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k21.na)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k21.na * 21000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k21.su)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k21.su * 21000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k21.pt)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k21.pt * 21000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k21.tm)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k21.tm * 21000)}</td>
                          <td className="px-1.5 py-1 text-right font-semibold">{fmtN(r.k21.total)}</td>
                          <td className="px-1.5 py-1 text-right font-mono font-semibold">{fmtRM(r.k21.totalRM)}</td>
                        </tr>
                      ))}
                    </tbody>
                    {totals && (
                      <tfoot>
                        <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                          <td className="px-2 py-1.5 text-left border-r" colSpan={2}>Total:</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k19.na)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totals.k19.na * 19000)}</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k19.su)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totals.k19.su * 19000)}</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k19.pt)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totals.k19.pt * 19000)}</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k19.tm)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totals.k19.tm * 19000)}</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k19.total)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono border-r">{fmtRM(totals.k19.total * 19000)}</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k21.na)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totals.k21.na * 21000)}</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k21.su)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totals.k21.su * 21000)}</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k21.pt)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totals.k21.pt * 21000)}</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k21.tm)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totals.k21.tm * 21000)}</td>
                          <td className="px-1.5 py-1.5 text-right">{fmtN(totals.k21.total)}</td>
                          <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(totals.k21.total * 21000)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </Card>
            )
          ) : (
            yearlyRows.length === 0 ? (
              <Card>
                <div className="px-6 py-12 text-center text-gray-400">No PBS payback records found.</div>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-blue-600 text-white">
                        <th rowSpan={2} className="px-2 py-1.5 text-center font-medium border-r border-blue-500">Year</th>
                        <th colSpan={10} className="px-2 py-1.5 text-center font-medium border-r border-blue-500">RM19K Pay Back Scheme</th>
                        <th colSpan={10} className="px-2 py-1.5 text-center font-medium border-r border-blue-500">RM21K Payback Scheme</th>
                        <th colSpan={10} className="px-2 py-1.5 text-center font-medium">RM19K + RM21K</th>
                      </tr>
                      <tr className="bg-slate-800 text-white">
                        {SUB_HEADERS.map((h, i) => (
                          <th key={`19-${i}`} className="px-1.5 py-1.5 text-right font-medium border-r border-slate-700 whitespace-nowrap">{h}</th>
                        ))}
                        {SUB_HEADERS.map((h, i) => (
                          <th key={`21-${i}`} className="px-1.5 py-1.5 text-right font-medium border-r border-slate-700 whitespace-nowrap">{h}</th>
                        ))}
                        {SUB_HEADERS.map((h, i) => (
                          <th key={`c-${i}`} className="px-1.5 py-1.5 text-right font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {yearlyRows.map((r, i) => (
                        <tr key={r.year} className={i % 2 === 0 ? 'bg-white' : 'bg-blue-50/40'}>
                          <td className="px-2 py-1 text-center font-medium border-r">{r.year}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k19.na)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.na * 19000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k19.su)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.su * 19000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k19.pt)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.pt * 19000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k19.tm)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.tm * 19000)}</td>
                          <td className="px-1.5 py-1 text-right font-semibold">{fmtN(r.k19.total)}</td>
                          <td className="px-1.5 py-1 text-right font-mono font-semibold border-r">{fmtRM(r.k19.totalRM)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k21.na)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k21.na * 21000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k21.su)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k21.su * 21000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k21.pt)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k21.pt * 21000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.k21.tm)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k21.tm * 21000)}</td>
                          <td className="px-1.5 py-1 text-right font-semibold">{fmtN(r.k21.total)}</td>
                          <td className="px-1.5 py-1 text-right font-mono font-semibold border-r">{fmtRM(r.k21.totalRM)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.combined.na)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.na * 19000 + r.k21.na * 21000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.combined.su)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.su * 19000 + r.k21.su * 21000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.combined.pt)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.pt * 19000 + r.k21.pt * 21000)}</td>
                          <td className="px-1.5 py-1 text-right">{fmtN(r.combined.tm)}</td>
                          <td className="px-1.5 py-1 text-right font-mono">{fmtRM(r.k19.tm * 19000 + r.k21.tm * 21000)}</td>
                          <td className="px-1.5 py-1 text-right font-semibold">{fmtN(r.combined.total)}</td>
                          <td className="px-1.5 py-1 text-right font-mono font-semibold">{fmtRM(r.combined.totalRM)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 font-bold border-t-2 border-gray-300">
                        <td className="px-2 py-1.5 text-left border-r">Total:</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k19.na)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k19.na * 19000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k19.su)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k19.su * 19000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k19.pt)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k19.pt * 19000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k19.tm)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k19.tm * 19000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k19.total)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono border-r">{fmtRM(yTotals.k19.total * 19000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k21.na)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k21.na * 21000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k21.su)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k21.su * 21000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k21.pt)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k21.pt * 21000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k21.tm)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k21.tm * 21000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.k21.total)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono border-r">{fmtRM(yTotals.k21.total * 21000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.combined.na)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k19.na * 19000 + yTotals.k21.na * 21000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.combined.su)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k19.su * 19000 + yTotals.k21.su * 21000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.combined.pt)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k19.pt * 19000 + yTotals.k21.pt * 21000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.combined.tm)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k19.tm * 19000 + yTotals.k21.tm * 21000)}</td>
                        <td className="px-1.5 py-1.5 text-right">{fmtN(yTotals.combined.total)}</td>
                        <td className="px-1.5 py-1.5 text-right font-mono">{fmtRM(yTotals.k19.total * 19000 + yTotals.k21.total * 21000)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            )
          )}
        </>
      )}
    </div>
  );
}
