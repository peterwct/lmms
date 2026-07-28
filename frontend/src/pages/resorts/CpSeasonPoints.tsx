import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Trash2, Save } from 'lucide-react';
import { cpSeasonPointsApi, resortsApi } from '../../api/resorts';
import type { CpSeasonPointRowInput } from '../../api/resorts';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ResultDialog } from '../../components/ui/ResultDialog';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import type { CpSeason, CpSeasonPoint } from '../../types';

const SEASON_LABELS: Record<string, string> = { D: 'Diamond', G: 'Gold', S: 'Silver' };
const SEASON_ORDER: CpSeason[] = ['S', 'G', 'D'];

// Season points are a CP concept — the picker never offers LHC resorts, and the
// server rejects them too. See the per-product calendar rule in CLAUDE.md.
const CP_CO_CODE = '02';

// No company table exists in the DB; the legacy screen showed this alongside the code
const CO_NAMES: Record<string, string> = {
  '02': 'CONNECTIONPOINTS SYSTEM',
  '03': 'LEISURE HOLIDAYS BHD',
  '15': 'LEISURE HOLIDAYS BHD',
};

// pssa_norpts0..6 — the legacy screen labels these "Sunday (0)" ... "Saturday (6)"
const DAYS = [
  { key: 'ptsSun', label: 'Sun', idx: 0 },
  { key: 'ptsMon', label: 'Mon', idx: 1 },
  { key: 'ptsTue', label: 'Tue', idx: 2 },
  { key: 'ptsWed', label: 'Wed', idx: 3 },
  { key: 'ptsThu', label: 'Thu', idx: 4 },
  { key: 'ptsFri', label: 'Fri', idx: 5 },
  { key: 'ptsSat', label: 'Sat', idx: 6 },
] as const;

type DayKey = (typeof DAYS)[number]['key'];

// A grid row: either scaffolded (no id yet) or backed by a stored record
interface Draft {
  key: string;            // stable react key + edits map key
  id: string | null;      // stored row id, null when scaffolded
  apartmentType: string;
  season: CpSeason;
  effectiveDate: string;  // YYYY-MM-DD
  pts: Record<DayKey, string>;   // strings so a cleared cell stays blank, not 0
}

const iso = (s: string) => s.slice(0, 10);
const rowKey = (apartmentType: string, season: string, effectiveDate: string) =>
  `${apartmentType}|${season}|${effectiveDate}`;

const blankPts = (): Record<DayKey, string> =>
  Object.fromEntries(DAYS.map(d => [d.key, ''])) as Record<DayKey, string>;

const storedPts = (r: CpSeasonPoint): Record<DayKey, string> =>
  Object.fromEntries(DAYS.map(d => [d.key, String(r[d.key])])) as Record<DayKey, string>;

// A row counts as filled once any day has a value; blank rows are never submitted
const isFilled = (d: Draft) => DAYS.some(day => d.pts[day.key].trim() !== '');
const rowTotal = (d: Draft) =>
  DAYS.reduce((sum, day) => sum + (parseInt(d.pts[day.key], 10) || 0), 0);

export function CpSeasonPoints() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const editable = canCreate('RESORTS_SETUP') || canEdit('RESORTS_SETUP');

  const yearParam = parseInt(searchParams.get('year') ?? '', 10);
  const year = yearParam >= 1900 && yearParam <= 2999 ? yearParam : new Date().getFullYear();
  const resortCode = searchParams.get('resort') ?? '';

  const [yearInput, setYearInput] = useState(String(year));
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [bulkDate, setBulkDate] = useState('');
  const [deleteYearOpen, setDeleteYearOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Draft | null>(null);
  const [delErr, setDelErr] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => { setYearInput(String(year)); }, [year]);

  const goTo = (rc: string, y: number) =>
    setSearchParams({ resort: rc, year: String(y) }, { replace: true });

  // CP resorts only — season points don't apply to LHC
  const { data: resorts } = useQuery({
    queryKey: ['resorts', ''],
    queryFn: () => resortsApi.list().then(r => r.data.data),
  });
  const cpResorts = useMemo(
    () => (resorts ?? []).filter(r => r.coCode === CP_CO_CODE),
    [resorts],
  );

  // Default to the first CP resort once the list arrives
  useEffect(() => {
    if (!resortCode && cpResorts.length) goTo(cpResorts[0].resortCode, year);
  }, [resortCode, cpResorts, year]);

  const { data: yearData, isLoading } = useQuery({
    queryKey: ['cp-season-points', resortCode, year],
    queryFn: () => cpSeasonPointsApi.year({ resortCode, year }).then(r => r.data),
    enabled: !!resortCode,
  });

  const resort = cpResorts.find(r => r.resortCode === resortCode);
  const stored = yearData?.data ?? [];

  // Scaffold every apartment type x season combo, then add any stored row that
  // falls outside it — a year may hold a second effective-dated revision of the
  // same combo (the migrated 2015/SLEEP4/G does), which must stay visible.
  const drafts = useMemo<Draft[]>(() => {
    const types = yearData?.apartmentTypes ?? [];
    const byKey = new Map(stored.map(r => [rowKey(r.apartmentType, r.season, iso(r.effectiveDate)), r]));
    const used = new Set<string>();
    const out: Draft[] = [];

    for (const t of types) {
      for (const season of SEASON_ORDER) {
        // The scaffold slot takes the earliest stored revision of this combo, if any
        const match = stored.find(r => r.apartmentType === t.apartmentType && r.season === season);
        if (match) {
          const k = rowKey(match.apartmentType, match.season, iso(match.effectiveDate));
          used.add(k);
          out.push({
            key: k, id: match.id,
            apartmentType: match.apartmentType, season: match.season,
            effectiveDate: iso(match.effectiveDate), pts: storedPts(match),
          });
        } else {
          out.push({
            key: rowKey(t.apartmentType, season, ''), id: null,
            apartmentType: t.apartmentType, season, effectiveDate: '', pts: blankPts(),
          });
        }
      }
    }

    // Extra effective-dated revisions, appended after their scaffold slot's type
    for (const [k, r] of byKey) {
      if (used.has(k)) continue;
      out.push({
        key: k, id: r.id,
        apartmentType: r.apartmentType, season: r.season,
        effectiveDate: iso(r.effectiveDate), pts: storedPts(r),
      });
    }

    return out;
  }, [yearData, stored]);

  // Reset pending edits whenever the displayed resort-year changes
  useEffect(() => { setEdits({}); setSaveErr(''); setBulkDate(''); }, [resortCode, year]);

  const rows = useMemo(() => drafts.map(d => edits[d.key] ?? d), [drafts, edits]);

  const patch = (d: Draft, change: Partial<Draft>) =>
    setEdits(prev => ({ ...prev, [d.key]: { ...(prev[d.key] ?? d), ...change } }));

  const setPts = (d: Draft, dayKey: DayKey, value: string) => {
    const cur = edits[d.key] ?? d;
    patch(d, { pts: { ...cur.pts, [dayKey]: value.replace(/[^0-9]/g, '').slice(0, 4) } });
  };

  // Most years use a single effective date across all rows — set them in one click
  const applyDateToAll = () => {
    if (!bulkDate) return;
    setEdits(prev => {
      const next = { ...prev };
      for (const d of drafts) next[d.key] = { ...(next[d.key] ?? d), effectiveDate: bulkDate };
      return next;
    });
  };

  const dirtyCount = Object.keys(edits).length;
  const filled = rows.filter(isFilled);
  const missingDate = filled.filter(r => !r.effectiveDate);
  const isNewYear = !isLoading && stored.length === 0;

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: CpSeasonPointRowInput[] = filled.map(r => ({
        apartmentType: r.apartmentType,
        season: r.season,
        effectiveDate: r.effectiveDate,
        ...(Object.fromEntries(
          DAYS.map(d => [d.key, parseInt(r.pts[d.key], 10) || 0]),
        ) as Record<DayKey, number>),
      }));
      return cpSeasonPointsApi.saveYear({ resortCode, year, rows: payload });
    },
    onSuccess: (r) => {
      const { rows: n, created, updated } = r.data.data;
      qc.invalidateQueries({ queryKey: ['cp-season-points'] });
      setEdits({});
      setResult(`Season points saved — ${resortCode} ${year}, ${n} row(s) (${created} new, ${updated} updated).`);
    },
    onError: (err) => setSaveErr(apiError(err)),
  });

  const deleteYearMut = useMutation({
    mutationFn: () => cpSeasonPointsApi.deleteYear({ resortCode, year }),
    onSuccess: (r) => {
      const { deleted } = r.data.data;
      qc.invalidateQueries({ queryKey: ['cp-season-points'] });
      setEdits({});
      setDeleteYearOpen(false);
      setResult(`Season points deleted — ${resortCode} ${year}, ${deleted} row(s) removed. CP booking has no points for this year until it is set up again.`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const deleteRowMut = useMutation({
    mutationFn: (row: Draft) => cpSeasonPointsApi.remove(row.id!),
    onSuccess: (_r, row) => {
      qc.invalidateQueries({ queryKey: ['cp-season-points'] });
      setEdits({});
      setDeleteRow(null);
      setResult(`Season points row deleted — ${resortCode} ${row.apartmentType} ${SEASON_LABELS[row.season]} ${year}, effective ${row.effectiveDate}.`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const applyYear = (e: React.FormEvent) => {
    e.preventDefault();
    const y = parseInt(yearInput, 10);
    if (y >= 1900 && y <= 2999) goTo(resortCode, y);
  };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">CP Resorts Season Points Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Points deducted from a CP member per night, by apartment type, season and day of week —
          one resort-year at a time. The season of each date is set in CP's Seasons Setup.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={applyYear} className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <Select
                value={resortCode}
                onChange={e => goTo(e.target.value, year)}
                title="Resort"
              >
                {cpResorts.length === 0 && <option value="">No CP resorts</option>}
                {cpResorts.map(r => (
                  <option key={r.resortCode} value={r.resortCode}>
                    {r.resortCode} — {r.shortName ?? r.resortName}
                  </option>
                ))}
              </Select>
            </div>
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
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant="secondary" onClick={() => goTo(resortCode, year - 1)} title="Previous year">
                <ChevronLeft className="h-4 w-4" /> Prev
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={() => goTo(resortCode, year + 1)} title="Next year">
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </form>
          <div className="flex items-center gap-2">
            {canDelete('RESORTS_SETUP') && stored.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => { setDelErr(''); setDeleteYearOpen(true); }}>
                <Trash2 className="h-4 w-4" /> Delete year
              </Button>
            )}
          </div>
        </CardHeader>

        {isLoading || !resortCode ? <PageSpinner /> : (
          <div className="p-4">
            {/* Header block mirroring the legacy ps_seasonapt screen */}
            <div className="mb-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <span className="w-32 text-gray-500">Resort Code</span>
                <span className="font-mono text-gray-800">[{resortCode}]</span>
              </div>
              <div className="flex gap-2">
                <span className="w-32 text-gray-500">Resort Name</span>
                <span className="text-gray-800">{resort?.resortName ?? yearData?.resort.resortName ?? '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-32 text-gray-500">Company Code</span>
                <span className="font-mono text-gray-800">[{yearData?.resort.coCode ?? CP_CO_CODE}]</span>
              </div>
              <div className="flex gap-2">
                <span className="w-32 text-gray-500">Company Name</span>
                <span className="text-gray-800">{CO_NAMES[yearData?.resort.coCode ?? CP_CO_CODE] ?? '—'}</span>
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm font-semibold text-gray-800">Normal Points — {year}</h2>
              {isNewYear ? (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  No points set up for {resortCode} {year} — fill in the rows you need and save.
                </span>
              ) : (
                <span className="text-xs text-gray-500">
                  {stored.length} row(s) stored
                  {dirtyCount > 0 && <span className="ml-2 text-amber-700 font-medium">· {dirtyCount} unsaved change(s)</span>}
                </span>
              )}
            </div>

            {editable && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-500">Effective date</span>
                <div className="w-40">
                  <Input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} title="Effective date to apply" />
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={applyDateToAll} disabled={!bulkDate}>
                  Apply to all rows
                </Button>
                <span className="text-xs text-gray-400">
                  Most years share one effective date; a row can still be dated individually.
                </span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="min-w-full font-mono text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="px-2 py-1 text-left font-normal">Apt Type</th>
                    <th className="px-2 py-1 text-left font-normal">Season</th>
                    <th className="px-2 py-1 text-left font-normal">Effective Date</th>
                    {DAYS.map(d => (
                      <th key={d.key} className="px-1 py-1 text-center font-normal">{d.label} ({d.idx})</th>
                    ))}
                    <th className="px-2 py-1 text-right font-normal">Total/Wk</th>
                    <th className="px-2 py-1" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const total = rowTotal(row);
                    const dirty = edits[row.key] !== undefined;
                    const untracked = row.id === null;
                    return (
                      <tr key={row.key} className="border-b border-gray-100">
                        <td className={`px-2 py-0.5 whitespace-nowrap ${untracked ? 'text-gray-400' : 'text-gray-800'}`}>
                          {row.apartmentType}
                        </td>
                        <td className={`px-2 py-0.5 whitespace-nowrap ${untracked ? 'text-gray-400' : 'text-gray-800'}`}>
                          {row.season} <span className="text-xs text-gray-400">{SEASON_LABELS[row.season]}</span>
                        </td>
                        <td className="px-2 py-0.5">
                          <input
                            type="date"
                            value={row.effectiveDate}
                            disabled={!editable}
                            onChange={e => patch(row, { effectiveDate: e.target.value })}
                            className={`w-36 rounded border border-gray-200 px-1 py-0.5 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500 ${
                              dirty ? 'text-amber-700' : 'text-gray-800'}`}
                          />
                        </td>
                        {DAYS.map(d => (
                          <td key={d.key} className="px-1 py-0.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={row.pts[d.key]}
                              disabled={!editable}
                              onChange={e => setPts(row, d.key, e.target.value)}
                              title={`${d.label} — pssa_norpts${d.idx}`}
                              className={`w-12 rounded border border-gray-200 px-1 py-0.5 text-right font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-50 disabled:text-gray-500 ${
                                dirty ? 'text-amber-700 font-semibold' : 'text-gray-800'}`}
                            />
                          </td>
                        ))}
                        <td className={`px-2 py-0.5 text-right ${total ? 'text-gray-800' : 'text-gray-300'}`}>
                          {total || '—'}
                        </td>
                        <td className="px-2 py-0.5 text-right">
                          {canDelete('RESORTS_SETUP') && row.id && (
                            <button
                              type="button"
                              onClick={() => { setDelErr(''); setDeleteRow(row); }}
                              title="Delete this row"
                              className="text-gray-400 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {missingDate.length > 0 && (
              <p className="mt-3 text-sm text-amber-700">
                {missingDate.length} row(s) have points but no effective date — set one before saving.
              </p>
            )}
            {saveErr && <p className="mt-3 text-sm text-red-600">{saveErr}</p>}

            {editable && (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={() => { setSaveErr(''); saveMut.mutate(); }}
                  loading={saveMut.isPending}
                  disabled={dirtyCount === 0 || filled.length === 0 || missingDate.length > 0}
                >
                  <Save className="h-4 w-4" /> Save year
                </Button>
                {dirtyCount > 0 && (
                  <Button variant="secondary" onClick={() => setEdits({})}>Cancel changes</Button>
                )}
                <span className="text-xs text-gray-400">
                  Rows left blank are not saved. Total per week is calculated, not stored.
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={deleteYearOpen}
        title="Delete this year's season points?"
        description="This removes every points row for this resort and year. CP booking has no points to deduct without them. This cannot be undone."
        rows={[
          { label: 'Resort', value: <span className="font-medium">{resortCode}</span> },
          { label: 'Year', value: <span className="font-mono">{year}</span> },
          { label: 'Rows', value: <span className="font-mono">{stored.length}</span> },
        ]}
        error={delErr}
        loading={deleteYearMut.isPending}
        confirmLabel="Delete year"
        onConfirm={() => deleteYearMut.mutate()}
        onClose={() => setDeleteYearOpen(false)}
      />

      <ConfirmDeleteModal
        open={deleteRow !== null}
        title="Delete this points row?"
        description="This removes a single effective-dated row. The rest of the year is left untouched."
        rows={deleteRow ? [
          { label: 'Resort', value: <span className="font-medium">{resortCode}</span> },
          { label: 'Apartment type', value: <span className="font-mono">{deleteRow.apartmentType}</span> },
          { label: 'Season', value: <span>{deleteRow.season} — {SEASON_LABELS[deleteRow.season]}</span> },
          { label: 'Year / effective', value: <span className="font-mono">{year} / {deleteRow.effectiveDate}</span> },
          { label: 'Total per week', value: <span className="font-mono">{rowTotal(deleteRow)}</span> },
        ] : []}
        error={delErr}
        loading={deleteRowMut.isPending}
        confirmLabel="Delete row"
        onConfirm={() => deleteRow && deleteRowMut.mutate(deleteRow)}
        onClose={() => setDeleteRow(null)}
      />
    </div>
  );
}
