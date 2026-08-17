import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { aptBlocksApi } from '../api/resorts';
import { useActiveProducts } from '../hooks/useActiveProducts';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { PageSpinner } from './ui/Spinner';

// Resort availability chart — ResAvailMast pivoted resort x date, cell = balNight
// (units still bookable that day: actNight minus maintenance minus bookings).
// Rendered inside a DraggableWindow from both the Unit Availability/Inventory and the
// Resorts Maintenance pages, so a save can be verified without leaving the page.

export const CHART_DAYS = 15;

export const shiftYmd = (ymd: string, delta: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
};

export function ResortAvailabilityChart() {
  // Product Type used to be a fixed LHC/CP pair mapped to coCode 03/02. It now reads the
  // ACTIVE products from the Product master (2026-08-17), so any product can be charted.
  const { products } = useActiveProducts();
  const [picked, setPicked] = useState('');
  // Fall back to LHC-A (03) so the default view is unchanged, then to whatever is first --
  // a product can be deactivated, and the picked one must stay a real option.
  const coCode = products.some(p => p.coCode === picked)
    ? picked
    : (products.find(p => p.coCode === '03') ?? products[0])?.coCode ?? '';
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  const { data, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['availability-chart', coCode, date],
    queryFn: () => aptBlocksApi.chart({ coCode, date, days: CHART_DAYS }).then(r => r.data),
    enabled: !!coCode,
  });

  const lastUpdated = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <label className="text-sm text-gray-600">Product Type:</label>
        <Select value={coCode} onChange={e => setPicked(e.target.value)} className="w-64">
          {products.map(p => (
            <option key={p.coCode} value={p.coCode}>{p.coCode} — {p.coName}</option>
          ))}
        </Select>
        <label className="text-sm text-gray-600">Date:</label>
        <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-40" />
        <Button size="sm" onClick={() => refetch()} loading={isFetching}>Refresh Availability</Button>
      </div>
      <p className="text-center text-xs italic text-gray-500">Last updated: {lastUpdated}</p>

      {!data ? <PageSpinner /> : (
        <div className="overflow-x-auto">
          <table className="mx-auto border-collapse text-sm">
            <thead>
              <tr>
                <th className="border border-gray-300 bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">Day</th>
                {data.dates.map(c => (
                  <th key={c.date} className={`border border-gray-300 px-2 py-1.5 font-semibold text-gray-700 ${c.weekend ? 'bg-amber-100' : 'bg-gray-100'}`}>
                    {c.dow}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="border border-gray-300 bg-gray-100 px-3 py-1.5 font-semibold text-gray-700">Resort</th>
                {data.dates.map(c => (
                  <th key={c.date} className={`border border-gray-300 px-2 py-1.5 font-semibold text-gray-800 ${c.weekend ? 'bg-amber-100' : 'bg-gray-50'}`}>
                    {c.dom}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map(r => (
                <tr key={`${r.resortCode}|${r.apartmentType}`}>
                  <td className="border border-gray-300 px-3 py-1.5 whitespace-nowrap font-semibold text-gray-800">{r.label}</td>
                  {r.cells.map((v, i) => (
                    <td
                      key={i}
                      className={`border border-gray-300 px-2 py-1.5 text-center font-medium ${data.dates[i].weekend ? 'bg-amber-50' : ''} ${v <= 2 ? 'text-red-600' : 'text-blue-800'}`}
                    >
                      {v}
                    </td>
                  ))}
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr><td colSpan={data.days + 1} className="border border-gray-300 px-4 py-6 text-center text-gray-400">No resorts for this product</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-center gap-2">
        <Button size="sm" onClick={() => setDate(d => shiftYmd(d, -CHART_DAYS))} title="Previous dates"><ChevronsLeft className="h-4 w-4" /></Button>
        <Button size="sm" onClick={() => setDate(d => shiftYmd(d, CHART_DAYS))} title="Next dates"><ChevronsRight className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}
