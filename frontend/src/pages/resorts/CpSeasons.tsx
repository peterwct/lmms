import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, CopyPlus, Trash2, Save } from 'lucide-react';
import { cpSeasonsApi } from '../../api/resorts';
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
import type { CpSeason } from '../../types';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

const SEASON_LABELS: Record<string, string> = { D: 'Diamond', G: 'Gold', S: 'Silver' };
const SEASON_ORDER: CpSeason[] = ['S', 'G', 'D'];

// Ungraded days default to Silver — by far the most common grade, so a new month
// only needs its Gold/Diamond days adjusted.
const DEFAULT_SEASON: CpSeason = 'S';

const COLS = 3;          // Date/Season pairs per row, filled left-to-right
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

// Legacy screen format: dd-mm-yyyy
const fmtLegacy = (y: number, m: number, d: number) => `${pad(d)}-${pad(m)}-${y}`;
// API/business-date format: YYYY-MM-DD (UTC midnight)
const fmtIso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

const daysInMonth = (y: number, m: number) =>
  Math.round((Date.UTC(y, m, 1) - Date.UTC(y, m - 1, 1)) / DAY_MS);

interface CloneProps {
  open: boolean;
  years: number[];
  onClose: () => void;
  onCloned: (message: string) => void;
}

function CloneYearModal({ open, years, onClose, onCloned }: CloneProps) {
  const qc = useQueryClient();
  const [sourceYear, setSourceYear] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setSourceYear(years.length ? String(years[0]) : '');   // years arrive newest first
  }, [open, years]);

  const cloneMut = useMutation({
    mutationFn: () => cpSeasonsApi.clone({ sourceYear: Number(sourceYear) }),
    onSuccess: (r) => {
      const { sourceYear: src, targetYear, created } = r.data.data;
      qc.invalidateQueries({ queryKey: ['cp-seasons'] });
      qc.invalidateQueries({ queryKey: ['cp-season-years'] });
      onCloned(
        `Cloned ${created} graded day(s) from ${src} to ${targetYear}, on the same month and day. ` +
        `Review the grading — peak dates shift each year. If either year is a leap year, check ` +
        `29 February separately.`
      );
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  return (
    <Modal open={open} title="Clone Season Calendar to Next Year" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Copies every graded day of the selected year into the following year, keeping the
          same month and day. Peak periods move each year, so treat the result as a starting
          point and correct it afterwards.
        </p>
        <Select label="Clone from year" value={sourceYear} onChange={e => setSourceYear(e.target.value)} required>
          <option value="">Select year...</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Creates grading for</label>
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">
            {sourceYear ? Number(sourceYear) + 1 : '—'}
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => cloneMut.mutate()} loading={cloneMut.isPending} disabled={!sourceYear}>
          Clone calendar
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function CpSeasons() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Year is required; month is optional and defaults to January, from where the
  // Prev/Next buttons scroll (crossing year boundaries).
  const yearParam = parseInt(searchParams.get('year') ?? '', 10);
  const year = yearParam >= 1900 && yearParam <= 2999 ? yearParam : new Date().getFullYear();
  const monthParam = parseInt(searchParams.get('month') ?? '', 10);
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : 1;

  const [yearInput, setYearInput] = useState(String(year));
  const [edits, setEdits] = useState<Record<string, CpSeason>>({});
  const [cloneOpen, setCloneOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => { setYearInput(String(year)); }, [year]);

  const goTo = (y: number, m: number) => {
    setSearchParams({ year: String(y), month: String(m) }, { replace: true });
  };

  const step = (delta: number) => {
    const idx = (year * 12 + (month - 1)) + delta;
    goTo(Math.floor(idx / 12), (idx % 12) + 1);
  };

  const { data: monthData, isLoading } = useQuery({
    queryKey: ['cp-seasons', year, month],
    queryFn: () => cpSeasonsApi.month({ year, month }).then(r => r.data),
  });

  const { data: years } = useQuery({
    queryKey: ['cp-season-years'],
    queryFn: () => cpSeasonsApi.years().then(r => r.data.data),
  });

  // Scaffold the full month, overlaying stored grades then any unsaved edits
  const stored = useMemo(() => {
    const map: Record<string, CpSeason> = {};
    for (const d of monthData?.data ?? []) map[d.date.slice(0, 10)] = d.season;
    return map;
  }, [monthData]);

  const graded = Object.keys(stored).length;
  const isNewMonth = !isLoading && graded === 0;

  const days = useMemo(() => {
    const n = daysInMonth(year, month);
    return Array.from({ length: n }, (_, i) => {
      const day = i + 1;
      const iso = fmtIso(year, month, day);
      return {
        iso,
        legacy: fmtLegacy(year, month, day),
        season: edits[iso] ?? stored[iso] ?? DEFAULT_SEASON,
        dirty: edits[iso] !== undefined && edits[iso] !== stored[iso],
        untracked: stored[iso] === undefined,   // not yet in the DB
      };
    });
  }, [year, month, stored, edits]);

  // Reset pending edits whenever the displayed month changes
  useEffect(() => { setEdits({}); setSaveErr(''); }, [year, month]);

  const rows = useMemo(() => {
    const out: (typeof days)[] = [];
    for (let i = 0; i < days.length; i += COLS) out.push(days.slice(i, i + COLS));
    return out;
  }, [days]);

  const dirtyCount = days.filter(d => d.dirty).length;
  // A brand-new month is entirely unsaved, so Save is meaningful even with no edits
  const canSave = (canCreate('RESORTS_SETUP') || canEdit('RESORTS_SETUP')) && (dirtyCount > 0 || isNewMonth);

  const saveMut = useMutation({
    mutationFn: () => cpSeasonsApi.saveMonth({
      year, month,
      days: days.map(d => ({ date: d.iso, season: d.season })),
    }),
    onSuccess: (r) => {
      const { days: n, created, updated } = r.data.data;
      qc.invalidateQueries({ queryKey: ['cp-seasons'] });
      qc.invalidateQueries({ queryKey: ['cp-season-years'] });
      setEdits({});
      setResult(`${MONTHS[month - 1]} ${year} saved — ${n} day(s) graded (${created} new, ${updated} updated).`);
    },
    onError: (err) => setSaveErr(apiError(err)),
  });

  const deleteMut = useMutation({
    mutationFn: () => cpSeasonsApi.deleteMonth({ year, month }),
    onSuccess: (r) => {
      const { deleted } = r.data.data;
      qc.invalidateQueries({ queryKey: ['cp-seasons'] });
      qc.invalidateQueries({ queryKey: ['cp-season-years'] });
      setEdits({});
      setDeleteOpen(false);
      setResult(`${MONTHS[month - 1]} ${year} deleted — ${deleted} day(s) removed from the calendar.`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const applyYear = (e: React.FormEvent) => {
    e.preventDefault();
    const y = parseInt(yearInput, 10);
    if (y >= 1900 && y <= 2999) goTo(y, month);
  };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">CP's Seasons Maintenance and Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Season grading per calendar day for CP — one month at a time. Set the season on each
          date, then save the month.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={applyYear} className="flex flex-wrap items-center gap-2">
            <div className="w-28">
              <Input
                type="number"
                min={1900}
                max={2999}
                value={yearInput}
                onChange={e => setYearInput(e.target.value)}
                onBlur={applyYear}
                title="Year"
                placeholder="Year"
              />
            </div>
            <div className="w-36">
              <Select value={month} onChange={e => goTo(year, Number(e.target.value))} title="Month">
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Select>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="secondary" onClick={() => step(-1)} title="Previous month">
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => step(1)} title="Next month">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </form>
          <div className="flex items-center gap-2">
            {canCreate('RESORTS_SETUP') && (
              <Button size="sm" variant="secondary" onClick={() => setCloneOpen(true)}>
                <CopyPlus className="h-4 w-4" /> Clone to next year
              </Button>
            )}
            {canDelete('RESORTS_SETUP') && graded > 0 && (
              <Button size="sm" variant="secondary" onClick={() => { setDelErr(''); setDeleteOpen(true); }}>
                <Trash2 className="h-4 w-4" /> Delete month
              </Button>
            )}
          </div>
        </CardHeader>

        {isLoading ? <PageSpinner /> : (
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm font-semibold text-gray-800">
                {MONTHS[month - 1]} {year}
              </h2>
              {isNewMonth ? (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  No seasons set for this month — every date defaults to Silver. Adjust and save.
                </span>
              ) : (
                <span className="text-xs text-gray-500">
                  {graded} of {days.length} day(s) graded
                  {dirtyCount > 0 && <span className="ml-2 text-amber-700 font-medium">· {dirtyCount} unsaved change(s)</span>}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="font-mono text-sm">
                <thead>
                  <tr className="text-gray-500">
                    {Array.from({ length: COLS }, (_, i) => (
                      <Fragment key={i}>
                        <th className="px-3 py-1 text-left font-normal">Date</th>
                        <th className="px-3 py-1 text-left font-normal">Season</th>
                      </Fragment>
                    ))}
                  </tr>
                  <tr className="text-gray-300 select-none">
                    {Array.from({ length: COLS }, (_, i) => (
                      <Fragment key={i}>
                        <th className="px-3 pb-1 text-left font-normal">------------</th>
                        <th className="px-3 pb-1 text-left font-normal">------</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, ri) => (
                    <tr key={ri}>
                      {Array.from({ length: COLS }, (_, ci) => {
                        const cell = row[ci];
                        if (!cell) {
                          return (
                            <Fragment key={ci}>
                              <td className="px-3 py-0.5" />
                              <td className="px-3 py-0.5" />
                            </Fragment>
                          );
                        }
                        return (
                          <Fragment key={ci}>
                            <td className={`px-3 py-0.5 whitespace-nowrap ${cell.untracked ? 'text-gray-400' : 'text-gray-800'}`}>
                              [{cell.legacy}]
                            </td>
                            <td className="px-3 py-0.5 whitespace-nowrap">
                              <span className="text-gray-400">[</span>
                              <select
                                value={cell.season}
                                disabled={!canEdit('RESORTS_SETUP') && !canCreate('RESORTS_SETUP')}
                                onChange={e => setEdits(prev => ({ ...prev, [cell.iso]: e.target.value as CpSeason }))}
                                title={SEASON_LABELS[cell.season]}
                                className={`mx-0.5 w-9 bg-transparent font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 rounded disabled:text-gray-500 ${
                                  cell.dirty ? 'text-amber-700 font-semibold' : 'text-gray-800'}`}
                              >
                                {SEASON_ORDER.map(v => <option key={v} value={v}>{v}</option>)}
                              </select>
                              <span className="text-gray-400">]</span>
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {saveErr && <p className="mt-3 text-sm text-red-600">{saveErr}</p>}

            {(canCreate('RESORTS_SETUP') || canEdit('RESORTS_SETUP')) && (
              <div className="mt-4 flex items-center gap-3">
                <Button onClick={() => { setSaveErr(''); saveMut.mutate(); }} loading={saveMut.isPending} disabled={!canSave}>
                  <Save className="h-4 w-4" /> Save month
                </Button>
                {dirtyCount > 0 && (
                  <Button variant="secondary" onClick={() => setEdits({})}>Cancel changes</Button>
                )}
                <span className="text-xs text-gray-400">
                  Saving writes every date shown, including days left at the default.
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      <CloneYearModal
        open={cloneOpen}
        years={years ?? []}
        onClose={() => setCloneOpen(false)}
        onCloned={setResult}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Delete this month?"
        description="This removes every graded day in the month from the season calendar. CP booking has no season for an ungraded day. This cannot be undone."
        rows={[
          { label: 'Month', value: <span className="font-medium">{MONTHS[month - 1]} {year}</span> },
          { label: 'Days graded', value: <span className="font-mono">{graded}</span> },
        ]}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete month"
        onConfirm={() => deleteMut.mutate()}
        onClose={() => setDeleteOpen(false)}
      />
    </div>
  );
}
