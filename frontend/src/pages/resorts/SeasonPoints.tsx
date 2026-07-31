import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Trash2, Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { seasonPointsApi, productsApi } from '../../api/resorts';
import { useActiveResorts } from '../../hooks/useActiveResorts';
import type { SeasonPointRowInput } from '../../api/resorts';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { ResultDialog } from '../../components/ui/ResultDialog';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import type { CpSeason, PointsType, SeasonPoint } from '../../types';

// Home and non-home points share one table and this one screen; the tab picks which
// chart is being maintained. A home resort is coCode '02' (CP-PBR today) — everything
// else is reached through an LVC exchange programme and priced on the Non-Home tab.

const SEASON_LABELS: Record<string, string> = { D: 'Diamond', G: 'Gold', S: 'Silver' };
const SEASON_ORDER: CpSeason[] = ['S', 'G', 'D'];

const CP_CO_CODE = '02';

const TABS: { key: PointsType; slug: string; label: string }[] = [
  { key: 'HOME', slug: 'home', label: 'Home Resorts' },
  { key: 'AWAY', slug: 'away', label: 'Non-Home Resorts' },
];

// The 7 point columns — the legacy screen labels these "Sunday (0)" ... "Saturday (6)"
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

const storedPts = (r: SeasonPoint): Record<DayKey, string> =>
  Object.fromEntries(DAYS.map(d => [d.key, String(r[d.key])])) as Record<DayKey, string>;

// A row counts as filled once any day has a value; blank rows are never submitted
const isFilled = (d: Draft) => DAYS.some(day => d.pts[day.key].trim() !== '');
const rowTotal = (d: Draft) =>
  DAYS.reduce((sum, day) => sum + (parseInt(d.pts[day.key], 10) || 0), 0);

export function SeasonPoints() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const editable = canCreate('RESORTS_SETUP') || canEdit('RESORTS_SETUP');

  // Tab lives in the URL alongside resort + year, so Back restores the whole view
  const slug = searchParams.get('type') === 'away' ? 'away' : 'home';
  const type: PointsType = slug === 'away' ? 'AWAY' : 'HOME';
  const isAway = type === 'AWAY';

  const yearParam = parseInt(searchParams.get('year') ?? '', 10);
  const year = yearParam >= 1900 && yearParam <= 2999 ? yearParam : new Date().getFullYear();
  const resortCode = searchParams.get('resort') ?? '';

  const [yearInput, setYearInput] = useState(String(year));
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [bulkDate, setBulkDate] = useState('');
  const [chargedTo, setChargedTo] = useState('');
  const [deleteYearOpen, setDeleteYearOpen] = useState(false);
  const [deleteRow, setDeleteRow] = useState<Draft | null>(null);
  const [delErr, setDelErr] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => { setYearInput(String(year)); }, [year]);

  const goTo = (rc: string, y: number) =>
    setSearchParams({ type: slug, resort: rc, year: String(y) }, { replace: true });

  // A resort valid on one tab is invalid on the other, so switching drops it and
  // falls through to the default-resort effect below.
  const switchTab = (nextSlug: string) =>
    setSearchParams({ type: nextSlug, year: String(year) }, { replace: true });

  // Active-only comes from the hook; an inactive resort's data is still reachable by URL.
  // Home = our own CP product; away = every exchange resort.
  const { resorts } = useActiveResorts();
  const tabResorts = useMemo(
    () => resorts.filter(r => (isAway ? r.coCode !== CP_CO_CODE : r.coCode === CP_CO_CODE)),
    [resorts, isAway],
  );

  // Default to the first resort of this kind once the list arrives
  useEffect(() => {
    if (!resortCode && tabResorts.length) goTo(tabResorts[0].resortCode, year);
  }, [resortCode, tabResorts, year]);

  const { data: yearData, isLoading } = useQuery({
    queryKey: ['season-points', type, resortCode, year],
    queryFn: () => seasonPointsApi.year({ type, resortCode, year }).then(r => r.data),
    enabled: !!resortCode,
  });

  // Products name both the resort's own company and the charged-to company; there is
  // no Prisma relation, so the name is resolved client-side (same as the LVC Code list).
  const { data: products } = useQuery({
    queryKey: ['products', ''],
    queryFn: () => productsApi.list().then(r => r.data.data),
  });
  const productName = (coCode: string | undefined) =>
    products?.find(p => p.coCode === coCode)?.coName ?? '—';

  const resort = tabResorts.find(r => r.resortCode === resortCode);
  const resortCoCode = resort?.coCode ?? yearData?.resort.coCode;
  const stored = useMemo(() => yearData?.data ?? [], [yearData]);

  // Scaffold every apartment type x season combo, then add any stored row that falls
  // outside it — a year may hold a second effective-dated revision of the same combo
  // (the migrated home 2015/SLEEP4/G does), which must stay visible.
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

    // Extra effective-dated revisions, appended after the scaffold
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

  // Types the server will accept without a new Apartment Types Setup entry
  const registered = useMemo(
    () => new Set((yearData?.apartmentTypes ?? []).filter(t => t.registered).map(t => t.apartmentType)),
    [yearData],
  );

  // Reset pending edits whenever the displayed tab / resort-year changes
  useEffect(() => { setEdits({}); setSaveErr(''); setBulkDate(''); }, [type, resortCode, year]);
  // Charged-to follows the loaded year until the user overrides it (away only)
  useEffect(() => { setChargedTo(yearData?.lvcCoCode ?? CP_CO_CODE); }, [yearData]);

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
  const chargedToDirty = isAway && !!yearData && chargedTo !== yearData.lvcCoCode;

  const kindWord = isAway ? 'Non-home' : 'Home';

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: SeasonPointRowInput[] = filled.map(r => ({
        apartmentType: r.apartmentType,
        season: r.season,
        effectiveDate: r.effectiveDate,
        ...(Object.fromEntries(
          DAYS.map(d => [d.key, parseInt(r.pts[d.key], 10) || 0]),
        ) as Record<DayKey, number>),
      }));
      return seasonPointsApi.saveYear({
        pointsType: type,
        resortCode,
        year,
        // Away-only; the server ignores it on home and stores null
        ...(isAway ? { lvcCoCode: chargedTo || CP_CO_CODE } : {}),
        rows: payload,
      });
    },
    onSuccess: (r) => {
      const { rows: n, created, updated } = r.data.data;
      qc.invalidateQueries({ queryKey: ['season-points'] });
      setEdits({});
      setResult(`${kindWord} season points saved — ${resortCode} ${year}, ${n} row(s) (${created} new, ${updated} updated).`);
    },
    onError: (err) => setSaveErr(apiError(err)),
  });

  const deleteYearMut = useMutation({
    mutationFn: () => seasonPointsApi.deleteYear({ type, resortCode, year }),
    onSuccess: (r) => {
      const { deleted } = r.data.data;
      qc.invalidateQueries({ queryKey: ['season-points'] });
      setEdits({});
      setDeleteYearOpen(false);
      setResult(
        `${kindWord} season points deleted — ${resortCode} ${year}, ${deleted} row(s) removed. ` +
        (isAway
          ? 'A CP member booking this resort has no points to deduct until it is set up again.'
          : 'CP booking has no points for this year until it is set up again.')
      );
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const deleteRowMut = useMutation({
    mutationFn: (row: Draft) => seasonPointsApi.remove(row.id!),
    onSuccess: (_r, row) => {
      qc.invalidateQueries({ queryKey: ['season-points'] });
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
        <h1 className="mt-1 text-xl font-semibold text-gray-900">CP Points Deduction - Maintenance and Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAway
            ? 'Points deducted from a CP member per night when they book a resort other than their home resort — one resort-year at a time.'
            : 'Points deducted from a CP member per night at their own home resort, by apartment type, season and day of week — one resort-year at a time.'}
          {' '}The season of each date is set in CP&apos;s Seasons Maintenance and Setup.
        </p>
      </div>

      <Card>
        <div className="flex gap-1 border-b px-4 pt-2">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.slug)}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                type === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={applyYear} className="flex flex-wrap items-center gap-2">
            <div className={isAway ? 'w-72' : 'w-56'}>
              <Select
                value={resortCode}
                onChange={e => goTo(e.target.value, year)}
                title="Resort"
              >
                {tabResorts.length === 0 && (
                  <option value="">{isAway ? 'No exchange resorts' : 'No CP resorts'}</option>
                )}
                {tabResorts.map(r => (
                  <option key={r.resortCode} value={r.resortCode}>
                    {r.resortCode} — {r.shortName ?? r.resortName}{isAway ? ` (${r.coCode})` : ''}
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
            {/* Header block mirroring the legacy ps_seasonapt / ps_lvcapt screens */}
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
                <span className="w-32 text-gray-500">Resort Product</span>
                <span className="text-gray-800">
                  <span className="font-mono">[{resortCoCode ?? '—'}]</span>{' '}
                  <span className="text-gray-600">{productName(resortCoCode)}</span>
                </span>
              </div>
              {isAway && (
                <div className="flex items-center gap-2">
                  <span className="w-32 shrink-0 text-gray-500" title="The product whose members these points are charged to">
                    Charged To
                  </span>
                  {editable ? (
                    <div className="w-64">
                      <Select
                        value={chargedTo}
                        onChange={e => setChargedTo(e.target.value)}
                        title="Product whose members are charged these points"
                      >
                        {(products ?? []).map(p => (
                          <option key={p.coCode} value={p.coCode}>{p.coCode} — {p.coName}</option>
                        ))}
                      </Select>
                    </div>
                  ) : (
                    <span className="text-gray-800">
                      <span className="font-mono">[{chargedTo}]</span>{' '}
                      <span className="text-gray-600">{productName(chargedTo)}</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm font-semibold text-gray-800">
                {isAway ? 'Non-Home Points' : 'Home Points'} — {year}
              </h2>
              {isNewYear ? (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  No points set up for {resortCode} {year} — fill in the rows you need and save.
                </span>
              ) : (
                <span className="text-xs text-gray-500">
                  {stored.length} row(s) stored
                  {dirtyCount > 0 && <span className="ml-2 text-amber-700 font-medium">· {dirtyCount} unsaved change(s)</span>}
                  {chargedToDirty && <span className="ml-2 text-amber-700 font-medium">· charged-to changed</span>}
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

            {rows.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                No apartment types for {resortCode}. Add one in Apartment Sleep Types Maintenance and Setup before setting up points.
              </p>
            ) : (
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
                            {!registered.has(row.apartmentType) && (
                              <span
                                className="ml-1 text-[10px] font-sans text-gray-400"
                                title="Not in Apartment Sleep Types Maintenance and Setup — kept editable because points already exist for it"
                              >
                                (legacy)
                              </span>
                            )}
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
                                title={`${d.label} — day ${d.idx}`}
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
            )}

            {missingDate.length > 0 && (
              <p className="mt-3 text-sm text-amber-700">
                {missingDate.length} row(s) have points but no effective date — set one before saving.
              </p>
            )}
            {saveErr && <p className="mt-3 text-sm text-red-600">{saveErr}</p>}

            {editable && rows.length > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={() => { setSaveErr(''); saveMut.mutate(); }}
                  loading={saveMut.isPending}
                  disabled={(dirtyCount === 0 && !chargedToDirty) || filled.length === 0 || missingDate.length > 0}
                >
                  <Save className="h-4 w-4" /> Save year
                </Button>
                {(dirtyCount > 0 || chargedToDirty) && (
                  <Button
                    variant="secondary"
                    onClick={() => { setEdits({}); setChargedTo(yearData?.lvcCoCode ?? CP_CO_CODE); }}
                  >
                    Cancel changes
                  </Button>
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
        title={`Delete this year's ${isAway ? 'non-home' : 'home'} season points?`}
        description={
          'This removes every points row for this resort and year. ' +
          (isAway
            ? 'A CP member booking this resort has no points to deduct without them. '
            : 'CP booking has no points for this year without them. ') +
          'This cannot be undone.'
        }
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
