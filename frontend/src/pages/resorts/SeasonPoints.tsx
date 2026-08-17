import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Trash2, Save, Plus, Pencil } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { seasonPointsApi } from '../../api/resorts';
import { useActiveProducts, productOptions } from '../../hooks/useActiveProducts';
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
//
// VERSIONS, NOT YEARS: a chart is all rows sharing (resortCode, effectiveDate) and stays
// in force until a later one supersedes it. A new one is created only when a rate changes
// or a room type is introduced — never annually. ONE effective date per version, set once
// in the editor header, so there is no per-row date and no year navigation.
//
// NAMING: the UI calls these "rates" ("New Rate", "Delete rate"); the code, the API and
// the schema call them versions. Same thing — don't rename one half without the other.
//
// A new rate opens PRE-FILLED from the rate in force (the editor loads it for the resort
// header and apartment types anyway), and must take effect AFTER the resort's latest rate
// — mirrored server-side in saveSeasonPointVersion.

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

// A grid row: either scaffolded (no stored row yet) or backed by one. With one date per
// version the natural key is just (apartmentType, season), so there is one row per combo.
interface Draft {
  key: string;            // stable react key + edits map key
  id: string | null;      // stored row id, null when scaffolded
  apartmentType: string;
  season: CpSeason;
  pts: Record<DayKey, string>;   // strings so a cleared cell stays blank, not 0
}

const iso = (s: string) => s.slice(0, 10);
const rowKey = (apartmentType: string, season: string) => `${apartmentType}|${season}`;

const blankPts = (): Record<DayKey, string> =>
  Object.fromEntries(DAYS.map(d => [d.key, ''])) as Record<DayKey, string>;

const storedPts = (r: SeasonPoint): Record<DayKey, string> =>
  Object.fromEntries(DAYS.map(d => [d.key, String(r[d.key])])) as Record<DayKey, string>;

// A row counts as filled once any day has a value; blank rows are never submitted
const isFilled = (d: Draft) => DAYS.some(day => d.pts[day.key].trim() !== '');
const rowTotal = (d: Draft) =>
  DAYS.reduce((sum, day) => sum + (parseInt(d.pts[day.key], 10) || 0), 0);

const fmtDate = (s: string) => {
  const [y, m, d] = iso(s).split('-');
  return `${d}-${m}-${y}`;
};

export function SeasonPoints() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const editable = canCreate('RESORTS_SETUP') || canEdit('RESORTS_SETUP');

  // Tab lives in the URL alongside resort + version, so Back restores the whole view
  const slug = searchParams.get('type') === 'away' ? 'away' : 'home';
  const type: PointsType = slug === 'away' ? 'AWAY' : 'HOME';
  const isAway = type === 'AWAY';

  const resortCode = searchParams.get('resort') ?? '';
  // absent -> the version list; a date -> edit that version; 'new' -> a blank version
  const effParam = searchParams.get('eff') ?? '';
  const isNew = effParam === 'new';
  const editing = effParam !== '';

  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [effDate, setEffDate] = useState('');
  const [chargedTo, setChargedTo] = useState('');
  const [deleteVersionOpen, setDeleteVersionOpen] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [saveErr, setSaveErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const goResort = (rc: string) =>
    setSearchParams({ type: slug, resort: rc }, { replace: true });

  const openVersion = (eff: string) =>
    setSearchParams({ type: slug, resort: resortCode, eff }, { replace: true });

  const backToList = () =>
    setSearchParams({ type: slug, resort: resortCode }, { replace: true });

  // A resort valid on one tab is invalid on the other, so switching drops it and
  // falls through to the default-resort effect below.
  const switchTab = (nextSlug: string) =>
    setSearchParams({ type: nextSlug }, { replace: true });

  // Active-only comes from the hook; an inactive resort's data is still reachable by URL.
  // Home = our own CP product; away = every exchange resort.
  const { resorts } = useActiveResorts();
  const tabResorts = useMemo(
    () => resorts.filter(r => (isAway ? r.coCode !== CP_CO_CODE : r.coCode === CP_CO_CODE)),
    [resorts, isAway],
  );

  // Default to the first resort of this kind once the list arrives
  useEffect(() => {
    if (!resortCode && tabResorts.length) goResort(tabResorts[0].resortCode);
  }, [resortCode, tabResorts]);

  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: ['season-point-versions', resortCode],
    queryFn: () => seasonPointsApi.versions({ resortCode }).then(r => r.data.data),
    enabled: !!resortCode,
  });

  // A new version still needs the resort header and its apartment types, so it loads the
  // in-force version (no date) and simply ignores the rows.
  const { data: versionData, isLoading } = useQuery({
    queryKey: ['season-points', type, resortCode, isNew ? 'new' : effParam],
    queryFn: () =>
      seasonPointsApi
        .version({ type, resortCode, ...(isNew || !effParam ? {} : { effectiveDate: effParam }) })
        .then(r => r.data),
    enabled: !!resortCode && editing,
  });

  // Products name both the resort's own company and the charged-to company; there is
  // no Prisma relation, so the name is resolved client-side (same as the LVC Code list).
  // The Charged To dropdown offers ACTIVE products only; the name lookup uses the full
  // list so a resort's own coCode -- or a charged-to code set before the product was
  // retired -- still resolves to a name.
  const { products, allProducts } = useActiveProducts();
  const productName = (coCode: string | undefined) =>
    allProducts.find(p => p.coCode === coCode)?.coName ?? '—';

  const resort = tabResorts.find(r => r.resortCode === resortCode);
  const resortCoCode = resort?.coCode ?? versionData?.resort.coCode;
  // In `new` mode the query returns the rate in force; its rows seed the grid so a new
  // rate starts as a copy of the current one, for the user to amend.
  const stored = useMemo(() => versionData?.data ?? [], [versionData]);

  // The rate's stored date — what the save replaces when the date is being corrected.
  // Blank in `new` mode, so the save creates rather than moves the copied-from rate.
  const storedEff = isNew ? '' : versionData?.effectiveDate ? iso(versionData.effectiveDate) : '';

  // The date the new rate was copied from, for the banner
  const copiedFrom = isNew && versionData?.effectiveDate ? iso(versionData.effectiveDate) : '';

  // One row per apartment type x season. No per-row date means no "extra revisions" tail.
  const drafts = useMemo<Draft[]>(() => {
    const types = versionData?.apartmentTypes ?? [];
    const out: Draft[] = [];
    for (const t of types) {
      for (const season of SEASON_ORDER) {
        const match = stored.find(r => r.apartmentType === t.apartmentType && r.season === season);
        out.push({
          key: rowKey(t.apartmentType, season),
          // A copied row is not a stored row of the rate being created
          id: isNew ? null : match?.id ?? null,
          apartmentType: t.apartmentType,
          season,
          pts: match ? storedPts(match) : blankPts(),
        });
      }
    }
    return out;
  }, [versionData, stored, isNew]);

  const registered = useMemo(
    () => new Set((versionData?.apartmentTypes ?? []).filter(t => t.registered).map(t => t.apartmentType)),
    [versionData],
  );

  // Reset pending edits whenever the displayed tab / resort / version changes
  useEffect(() => { setEdits({}); setSaveErr(''); }, [type, resortCode, effParam]);
  // The header date and charged-to follow the loaded version until the user overrides them
  useEffect(() => { setEffDate(isNew ? '' : storedEff); }, [storedEff, isNew]);
  useEffect(() => { setChargedTo(versionData?.lvcCoCode ?? CP_CO_CODE); }, [versionData]);

  const rows = useMemo(() => drafts.map(d => edits[d.key] ?? d), [drafts, edits]);

  const patch = (d: Draft, change: Partial<Draft>) =>
    setEdits(prev => ({ ...prev, [d.key]: { ...(prev[d.key] ?? d), ...change } }));

  const setPts = (d: Draft, dayKey: DayKey, value: string) => {
    const cur = edits[d.key] ?? d;
    patch(d, { pts: { ...cur.pts, [dayKey]: value.replace(/[^0-9]/g, '').slice(0, 4) } });
  };

  const dirtyCount = Object.keys(edits).length;
  const filled = rows.filter(isFilled);
  const chargedToDirty = isAway && !!versionData && chargedTo !== versionData.lvcCoCode;
  const effDirty = !isNew && !!storedEff && effDate !== storedEff;
  const dirty = dirtyCount > 0 || chargedToDirty || effDirty;

  // Mirrors the backend guard: a NEW rate must take effect after the resort's latest one,
  // since rates supersede in date order. Editing an existing rate is exempt.
  const latestEff = versions?.length
    ? versions.reduce((mx, v) => (iso(v.effectiveDate) > mx ? iso(v.effectiveDate) : mx), '')
    : '';
  const effTooEarly = isNew && !!effDate && !!latestEff && effDate <= latestEff;

  const kindWord = isAway ? 'Non-home' : 'Home';

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: SeasonPointRowInput[] = filled.map(r => ({
        apartmentType: r.apartmentType,
        season: r.season,
        ...(Object.fromEntries(DAYS.map(d => [d.key, parseInt(r.pts[d.key], 10) || 0])) as Record<DayKey, number>),
      }));
      return seasonPointsApi.saveVersion({
        pointsType: type,
        resortCode,
        effectiveDate: effDate,
        // Naming the stored date lets the server move this version rather than clash with it
        ...(isNew || !storedEff ? {} : { replaces: storedEff }),
        ...(isAway ? { lvcCoCode: chargedTo || CP_CO_CODE } : {}),
        rows: payload,
      });
    },
    onSuccess: (res) => {
      const { rows: n, replaced } = res.data.data;
      qc.invalidateQueries({ queryKey: ['season-points'] });
      qc.invalidateQueries({ queryKey: ['season-point-versions', resortCode] });
      setEdits({});
      setResult(
        replaced > 0
          ? `${kindWord} season points saved — ${resortCode}, rate effective ${fmtDate(effDate)}, ${n} row(s).`
          : `${kindWord} season points rate created — ${resortCode}, effective ${fmtDate(effDate)}, ${n} row(s). ` +
            'It stays in force until a later rate supersedes it.',
      );
      // Keep the URL on the version just written, in case its date was corrected
      openVersion(effDate);
    },
    onError: (err) => setSaveErr(apiError(err)),
  });

  const deleteVersionMut = useMutation({
    mutationFn: () => seasonPointsApi.deleteVersion({ type, resortCode, effectiveDate: storedEff }),
    onSuccess: (res) => {
      const { deleted } = res.data.data;
      qc.invalidateQueries({ queryKey: ['season-points'] });
      qc.invalidateQueries({ queryKey: ['season-point-versions', resortCode] });
      setDeleteVersionOpen(false);
      setResult(
        `${kindWord} season points rate deleted — ${resortCode}, effective ${fmtDate(storedEff)}, ${deleted} row(s) removed.`,
      );
      backToList();
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const statusOf = (v: { effectiveDate: string; isCurrent: boolean }) => {
    if (v.isCurrent) return { label: 'Current', cls: 'bg-green-50 text-green-700 border-green-200' };
    const today = new Date().toISOString().slice(0, 10);
    if (iso(v.effectiveDate) > today) return { label: 'Scheduled', cls: 'bg-blue-50 text-blue-700 border-blue-200' };
    return { label: 'Superseded', cls: 'bg-gray-50 text-gray-500 border-gray-200' };
  };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">9. CP Points Deduction - Maintenance and Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isAway
            ? 'Points deducted from a CP member per night when they book a resort other than their home resort.'
            : 'Points deducted from a CP member per night at their own home resort, by apartment type, season and day of week.'}
          {' '}A rate stays in force until a later one supersedes it — create a new rate only when a
          rate changes or a room type is introduced. The season of each date is set in CP&apos;s Seasons
          Maintenance and Setup.
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
          <div className="flex flex-wrap items-center gap-2">
            <div className={isAway ? 'w-72' : 'w-56'}>
              <Select value={resortCode} onChange={e => goResort(e.target.value)} title="Resort">
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
            {editing && (
              <Button type="button" size="sm" variant="secondary" onClick={backToList}>
                <ChevronLeft className="h-4 w-4" /> All rates
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!editing && canCreate('RESORTS_SETUP') && resortCode && (
              <Button size="sm" onClick={() => openVersion('new')}>
                <Plus className="h-4 w-4" /> New Rate
              </Button>
            )}
            {editing && !isNew && storedEff && canDelete('RESORTS_SETUP') && stored.length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => { setDelErr(''); setDeleteVersionOpen(true); }}>
                <Trash2 className="h-4 w-4" /> Delete rate
              </Button>
            )}
          </div>
        </CardHeader>

        {/* ---------------------------------------------------------------- version list */}
        {!editing ? (
          versionsLoading || !resortCode ? <PageSpinner /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Effective From</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-right">Room Types</th>
                    <th className="px-4 py-3 text-right">Seasons</th>
                    <th className="px-4 py-3 text-right">Rows</th>
                    {isAway && <th className="px-4 py-3 text-left">Charged To</th>}
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {(versions ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={isAway ? 7 : 6} className="px-4 py-8 text-center text-sm text-gray-500">
                        No points set up for {resortCode}.
                        {canCreate('RESORTS_SETUP') && ' Use New Rate to create the first one.'}
                      </td>
                    </tr>
                  ) : (versions ?? []).map(v => {
                    const st = statusOf(v);
                    return (
                      <tr key={v.effectiveDate} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-gray-800">{fmtDate(v.effectiveDate)}</td>
                        <td className="px-4 py-2">
                          <span className={clsx('rounded border px-2 py-0.5 text-xs', st.cls)}>{st.label}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono">{v.apartmentTypes}</td>
                        <td className="px-4 py-2 text-right font-mono">{v.seasons}</td>
                        <td className="px-4 py-2 text-right font-mono">{v.rows}</td>
                        {isAway && (
                          <td className="px-4 py-2">
                            <span className="font-mono">[{v.lvcCoCode ?? '—'}]</span>{' '}
                            <span className="text-gray-600">{productName(v.lvcCoCode ?? undefined)}</span>
                          </td>
                        )}
                        <td className="px-4 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => openVersion(iso(v.effectiveDate))}
                            title={editable ? 'Edit this rate' : 'View this rate'}
                            className="text-gray-400 hover:text-blue-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : isLoading || !resortCode ? <PageSpinner /> : (
          /* ------------------------------------------------------------ version editor */
          <div className="p-4">
            {/* Header block mirroring the legacy ps_seasonapt / ps_lvcapt screens */}
            <div className="mb-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex gap-2">
                <span className="w-32 text-gray-500">Resort Code</span>
                <span className="font-mono text-gray-800">[{resortCode}]</span>
              </div>
              <div className="flex gap-2">
                <span className="w-32 text-gray-500">Resort Name</span>
                <span className="text-gray-800">{resort?.resortName ?? versionData?.resort.resortName ?? '—'}</span>
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
                        {productOptions(products, allProducts, chargedTo).map(p => (
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
                {isAway ? 'Non-Home Points' : 'Home Points'}
                {isNew ? ' — new rate' : storedEff ? ` — effective ${fmtDate(storedEff)}` : ''}
              </h2>
              {isNew ? (
                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                  {copiedFrom
                    ? `New rate for ${resortCode} — values copied from the rate effective ${fmtDate(copiedFrom)}. Set the effective date, amend, then save.`
                    : `New rate for ${resortCode} — set the effective date, fill in the rows, then save.`}
                </span>
              ) : (
                <span className="text-xs text-gray-500">
                  {stored.length} row(s) stored
                  {dirtyCount > 0 && <span className="ml-2 text-amber-700 font-medium">· {dirtyCount} unsaved change(s)</span>}
                  {effDirty && <span className="ml-2 text-amber-700 font-medium">· effective date changed</span>}
                  {chargedToDirty && <span className="ml-2 text-amber-700 font-medium">· charged-to changed</span>}
                </span>
              )}
            </div>

            {/* ONE effective date for the whole version — there is no per-row date */}
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-500">Effective from</span>
              <div className="w-40">
                <Input
                  type="date"
                  value={effDate}
                  disabled={!editable}
                  onChange={e => setEffDate(e.target.value)}
                  title="Date this chart takes effect"
                />
              </div>
              <span className="text-xs text-gray-400">
                Applies to the whole chart, and stays in force until a later rate supersedes it.
              </span>
            </div>

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
                      {DAYS.map(d => (
                        <th key={d.key} className="px-1 py-1 text-center font-normal">{d.label} ({d.idx})</th>
                      ))}
                      <th className="px-2 py-1 text-right font-normal">Total/Wk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const total = rowTotal(row);
                      const rowDirty = edits[row.key] !== undefined;
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
                                  rowDirty ? 'text-amber-700 font-semibold' : 'text-gray-800'}`}
                              />
                            </td>
                          ))}
                          <td className={`px-2 py-0.5 text-right ${total ? 'text-gray-800' : 'text-gray-300'}`}>
                            {total || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {!effDate && filled.length > 0 && (
              <p className="mt-3 text-sm text-amber-700">
                Set an effective date for this rate before saving.
              </p>
            )}
            {effTooEarly && (
              <p className="mt-3 text-sm text-red-600">
                {resortCode} already has a rate effective {fmtDate(latestEff)} — a new rate must take
                effect after that date.
              </p>
            )}
            {saveErr && <p className="mt-3 text-sm text-red-600">{saveErr}</p>}

            {editable && rows.length > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={() => { setSaveErr(''); saveMut.mutate(); }}
                  loading={saveMut.isPending}
                  disabled={!effDate || effTooEarly || filled.length === 0 || (!isNew && !dirty)}
                >
                  <Save className="h-4 w-4" /> {isNew ? 'Create rate' : 'Save rate'}
                </Button>
                {dirty && (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setEdits({});
                      setEffDate(isNew ? '' : storedEff);
                      setChargedTo(versionData?.lvcCoCode ?? CP_CO_CODE);
                    }}
                  >
                    Cancel changes
                  </Button>
                )}
                <span className="text-xs text-gray-400">
                  Rows left blank are not saved, and a blanked row is removed. Total per week is calculated, not stored.
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={deleteVersionOpen}
        title={`Delete this ${isAway ? 'non-home' : 'home'} points rate?`}
        description={
          'This removes every points row in this rate. ' +
          'The previous rate, if any, becomes the one in force. ' +
          'This cannot be undone.'
        }
        rows={[
          { label: 'Resort', value: <span className="font-medium">{resortCode}</span> },
          { label: 'Effective from', value: <span className="font-mono">{storedEff ? fmtDate(storedEff) : '—'}</span> },
          { label: 'Rows', value: <span className="font-mono">{stored.length}</span> },
        ]}
        error={delErr}
        loading={deleteVersionMut.isPending}
        confirmLabel="Delete rate"
        onConfirm={() => deleteVersionMut.mutate()}
        onClose={() => setDeleteVersionOpen(false)}
      />
    </div>
  );
}
