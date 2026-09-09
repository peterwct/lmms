import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Trash2, CalendarRange } from 'lucide-react';
import { rciWeeksApi } from '../../api/rci';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { ResultDialog } from '../../components/ui/ResultDialog';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';

// The register starts at 2026 - older Informix years were deliberately not migrated.
// Mirrors MIN_YEAR in backend/src/controllers/rci-week.controller.ts.
const MIN_YEAR = 2026;
const MAX_YEAR = 2999;
const DAY_MS = 86_400_000;

// Stored dates are UTC midnight - format without constructing a local Date
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

// Client-side copy of the server derivation, used ONLY to preview a year before it is
// generated. The server remains authoritative - see generateWeeks() in the controller.
function firstFriday(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  return new Date(jan1.getTime() + ((5 - jan1.getUTCDay() + 7) % 7) * DAY_MS);
}

function previewYear(year: number) {
  const start = firstFriday(year);
  const weeks = Math.round((firstFriday(year + 1).getTime() - start.getTime()) / (7 * DAY_MS));
  const end = new Date(start.getTime() + weeks * 7 * DAY_MS);
  return { weeks, first: start.toISOString().slice(0, 10), last: end.toISOString().slice(0, 10) };
}

interface AddModalProps {
  open: boolean;
  existingYears: number[];
  onClose: () => void;
  onAdded: (year: number, weeks: number) => void;
}

function AddYearModal({ open, existingYears, onClose, onAdded }: AddModalProps) {
  const qc = useQueryClient();
  const [yearInput, setYearInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    // Default to the year after the newest one set up, so the common case is one click
    const next = existingYears.length ? Math.max(...existingYears) + 1 : new Date().getFullYear();
    setYearInput(String(Math.max(next, MIN_YEAR)));
  }, [open, existingYears]);

  const year = parseInt(yearInput, 10);
  const validYear = year >= MIN_YEAR && year <= MAX_YEAR;
  const taken = validYear && existingYears.includes(year);
  const preview = validYear ? previewYear(year) : null;

  const addMut = useMutation({
    mutationFn: () => rciWeeksApi.createYear({ year }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rci-weeks'] });
      qc.invalidateQueries({ queryKey: ['rci-week-years'] });
      onAdded(r.data.data.year, r.data.data.weeks);
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  return (
    <Modal open={open} title="Add RCI Week Calendar" onClose={onClose} size="sm">
      <div className="space-y-3">
        <Input
          label="Year"
          type="number"
          min={MIN_YEAR}
          max={MAX_YEAR}
          value={yearInput}
          onChange={e => setYearInput(e.target.value)}
          required
        />

        {preview && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm space-y-1">
            <div>
              <span className="text-gray-500">Weeks:</span>{' '}
              <span className="font-semibold text-gray-900">{preview.weeks}</span>
            </div>
            <div><span className="text-gray-500">Week 1 starts:</span> {fmtDate(preview.first)} (Friday)</div>
            <div><span className="text-gray-500">Week {preview.weeks} ends:</span> {fmtDate(preview.last)}</div>
          </div>
        )}

        {taken && (
          <p className="text-xs text-amber-600">
            {year} is already set up. Delete that year first if you need to regenerate it.
          </p>
        )}

        <p className="text-xs text-gray-400">
          Every week runs Friday to the following Friday and is derived from the year, so
          there is nothing else to key. The last week carries over into the next year.
        </p>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => addMut.mutate()} loading={addMut.isPending} disabled={!validYear || taken}>
          {preview ? `Generate ${preview.weeks} weeks` : 'Generate'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function RciWeeklyInterval() {
  const { canCreate, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [addOpen, setAddOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const { data: years, isLoading: yearsLoading } = useQuery({
    queryKey: ['rci-week-years'],
    queryFn: () => rciWeeksApi.years().then(r => r.data.data),
  });

  // Year lives in the URL so Back restores the view; read and clamped, never mirrored
  // into state. Falls back to the newest year set up.
  const yearParam = parseInt(searchParams.get('year') ?? '', 10);
  const year = yearParam >= MIN_YEAR && yearParam <= MAX_YEAR
    ? yearParam
    : (years?.[0] ?? new Date().getFullYear());

  // Unwrap to the ROW ARRAY, not the { data, year, weeks } envelope: RCI fn 3's week
  // picker reads this same cache key and expects an array. Caching two shapes under one
  // key made whichever page fetched last win, and fn 3 then crashed on weeks.map.
  const { data: list, isLoading } = useQuery({
    queryKey: ['rci-weeks', year],
    queryFn: () => rciWeeksApi.list({ year }).then(r => r.data.data),
    enabled: !!years?.length,
  });

  const deleteMut = useMutation({
    mutationFn: () => rciWeeksApi.deleteYear({ year }),
    onSuccess: (r) => {
      const { year: y, deleted } = r.data.data;
      qc.invalidateQueries({ queryKey: ['rci-weeks'] });
      qc.invalidateQueries({ queryKey: ['rci-week-years'] });
      setConfirmDelete(false);
      setSearchParams({}, { replace: true });   // fall back to the newest remaining year
      setResult(`RCI week calendar deleted — ${y}, ${deleted} week(s) removed.`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const weeks = list ?? [];
  const noYears = !yearsLoading && !years?.length;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/rci" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> RCI
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">2. RCI Weekly Interval</h1>
        <p className="mt-1 text-sm text-gray-500">
          RCI week numbers by year. Each week runs Friday to the following Friday; a year holds 52 or 53 weeks.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-36">
              <Select
                value={String(year)}
                onChange={e => setSearchParams({ year: e.target.value }, { replace: true })}
                disabled={noYears}
              >
                {years?.map(y => <option key={y} value={y}>{y}</option>)}
                {noYears && <option value="">No years</option>}
              </Select>
            </div>
            {!!weeks.length && (
              <p className="text-sm text-gray-500">
                <span className="font-semibold text-gray-800">{weeks.length}</span> weeks
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canCreate('RESORT_BOOKING') && (
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add year</Button>
            )}
            {canDelete('RESORT_BOOKING') && !!weeks.length && (
              <Button size="sm" variant="secondary" onClick={() => { setDelErr(''); setConfirmDelete(true); }}>
                <Trash2 className="h-4 w-4" /> Delete year
              </Button>
            )}
          </div>
        </CardHeader>

        {noYears ? (
          <div className="px-6 py-16 text-center">
            <CalendarRange className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No RCI weeks set up yet.</p>
            <p className="mt-1 text-sm text-gray-400">Add a year to generate its 52 or 53 weeks.</p>
          </div>
        ) : isLoading || yearsLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-right w-20">Week</th>
                  <th className="px-4 py-3 text-left">Start (Friday)</th>
                  <th className="px-4 py-3 text-left">End (Friday)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {weeks.map(w => (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-right font-mono font-medium">{w.weekNo}</td>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">{fmtDate(w.friStart)}</td>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">
                      {fmtDate(w.friEnd)}
                      {w.friEnd.slice(0, 4) !== String(year) && (
                        <span className="ml-2 text-xs text-gray-400">carries into {w.friEnd.slice(0, 4)}</span>
                      )}
                    </td>
                  </tr>
                ))}
                {weeks.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-gray-400">No weeks set up for {year}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddYearModal
        open={addOpen}
        existingYears={years ?? []}
        onClose={() => setAddOpen(false)}
        onAdded={(y, n) => {
          setSearchParams({ year: String(y) }, { replace: true });
          setResult(`RCI week calendar added — ${y}, ${n} weeks generated from Friday to Friday.`);
        }}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={confirmDelete}
        title="Delete this whole year?"
        description="This removes every week of the selected year in one go — there is no per-week delete. The year can be regenerated afterwards. This cannot be undone."
        rows={[
          { label: 'Year',  value: <span className="font-mono font-medium">{year}</span> },
          { label: 'Weeks', value: weeks.length },
        ]}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete year"
        onConfirm={() => deleteMut.mutate()}
        onClose={() => setConfirmDelete(false)}
      />
    </div>
  );
}
