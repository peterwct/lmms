import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Save, Landmark, Trash2 } from 'lucide-react';
import { rciBulkBankApi, rciWeeksApi } from '../../api/rci';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveResorts } from '../../hooks/useActiveResorts';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { ResultDialog } from '../../components/ui/ResultDialog';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';

// RCI Bulk Bank - RCI fn 3. LHB inventory deposited into the RCI exchange network.
//
// The screen is a WHOLE-YEAR GRID in the shape of fn 8's month grid (CpSeasons.tsx, which
// is the reference implementation for the table, the dirty tracking and the save row):
// pick resort + unit + year, and every RCI week of that year is a row with an editable
// season beside it. That follows the data - each unit is banked for essentially the whole
// year - where the record-at-a-time modal this replaced cost 52 trips to key one year.
//
// A blank season means NOT BANKED, so the dropdown does all three operations: blank -> a
// colour banks the week, colour -> colour regrades it, colour -> blank clears it. The
// server is told every week the grid shows and works out the diff, so the page never has
// to know which of the three a given edit became.

const DAY_MS = 86_400_000;

const SEASONS = ['R', 'B', 'W'] as const;
const SEASON_LABELS: Record<string, string> = { R: 'Red', B: 'Blue', W: 'White' };
// The season IS a colour, so the cell shows it rather than naming it. Text stays black
// throughout - the background carries the meaning. White needs a border to read as a
// filled cell against the white card rather than as an empty one.
const SEASON_BG: Record<string, string> = {
  R: 'bg-red-400 border border-red-500',
  B: 'bg-blue-400 border border-blue-500',
  W: 'bg-white border border-gray-400',
};
const NONE_BG = 'bg-transparent border border-transparent';
// Not banked. A dash rather than an empty option so the cell reads as a deliberate state.
const NONE = '';
const NONE_LABEL = '-';
// A unit/year with nothing banked yet is the grid's "add" state, so every bankable week is
// prefilled with the dominant season (495 of the 774 existing records are Red) and one Save
// banks the year. Exactly how fn 8 prefills an ungraded month with Silver. A year that
// already holds weeks is never prefilled - there, blank keeps meaning "not banked".
const DEFAULT_SEASON = 'R';

// Season/Date pairs per row, filled left to right (fn 8 uses 3; a week needs both its
// dates, so 2 keeps the table inside a normal window at 27 rows for a 53-week year).
const COLS = 2;

// Stored dates are UTC midnight - slice the ISO string, never construct a local Date
const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : '');
const fmtDate = (iso: string) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

// checkOut = friStart + 6 (= friEnd - 1), the LAST NIGHT. Pure UTC math on an ISO string.
const weekCheckOut = (friStart: string) =>
  new Date(new Date(`${friStart.slice(0, 10)}T00:00:00Z`).getTime() + 6 * DAY_MS).toISOString().slice(0, 10);

export function RciBulkBank() {
  const qc = useQueryClient();
  const { canCreate, canEdit, canDelete } = useAuth();
  const { resorts } = useActiveResorts();
  const [searchParams, setSearchParams] = useSearchParams();

  // Resort / unit / year live in the URL so Back restores the whole view
  const resortCode = searchParams.get('resort') ?? '';
  const unitNo = searchParams.get('unit') ?? '';
  const yearParam = parseInt(searchParams.get('year') ?? '', 10);
  const year = Number.isFinite(yearParam) ? yearParam : 0;

  const [edits, setEdits] = useState<Record<number, string>>({});
  const [saveErr, setSaveErr] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const setParams = (next: { resort?: string; unit?: string; year?: string }) => {
    const p: Record<string, string> = {};
    const nr = next.resort ?? resortCode;
    // Changing resort invalidates the unit; changing either keeps the year, which is the
    // dimension staff scroll through most.
    const nu = next.resort !== undefined && next.resort !== resortCode ? '' : (next.unit ?? unitNo);
    const ny = next.year ?? (year ? String(year) : '');
    if (nr) p.resort = nr;
    if (nu) p.unit = nu;
    if (ny) p.year = ny;
    setSearchParams(p, { replace: true });
  };

  // Units the grid may show at this resort, each with its fn 5 availability ranges
  const { data: unitsResp } = useQuery({
    queryKey: ['rci-bulk-bank', 'units', resortCode],
    queryFn: () => rciBulkBankApi.units(resortCode).then(r => r.data),
    enabled: !!resortCode,
  });
  const units = unitsResp?.data;
  // Non-empty only at a lock-on/lock-off resort: the half types the server filtered out.
  const splitTypes = unitsResp?.splitTypes ?? null;
  const selectedUnit = units?.find(u => u.unitNo === unitNo);

  // Years come from fn 2's calendar, not from what has been banked: the grid renders one
  // row per RCI week, so a year with no calendar has nothing to draw. Shares fn 2's cache
  // key, so generating a year there refreshes this picker with no extra endpoint.
  const { data: weekYears } = useQuery({
    queryKey: ['rci-week-years'],
    queryFn: () => rciWeeksApi.years().then(r => r.data.data),
  });

  // Both of these share fn 2's query keys and must unwrap to the same shape it does
  const { data: weeks, isLoading: weeksLoading } = useQuery({
    queryKey: ['rci-weeks', year],
    queryFn: () => rciWeeksApi.list({ year }).then(r => r.data.data),
    enabled: year > 0,
  });

  const { data: banked, isLoading: bankedLoading } = useQuery({
    queryKey: ['rci-bulk-bank', 'year', resortCode, unitNo, year],
    queryFn: () => rciBulkBankApi.year({ resortCode, unitNo, weekYear: year }).then(r => r.data.data),
    enabled: !!resortCode && !!unitNo && year > 0,
  });

  const ready = !!resortCode && !!unitNo && year > 0;
  const isLoading = ready && (weeksLoading || bankedLoading);
  // Nothing banked for this unit and year yet - the grid's add state
  const isNewYear = ready && !isLoading && (banked?.length ?? 0) === 0;

  // Pending edits are dropped whenever the displayed year/unit/resort changes
  useEffect(() => { setEdits({}); setSaveErr(''); setDelErr(''); }, [resortCode, unitNo, year]);

  // What the server holds, keyed by week number
  const stored = useMemo(() => {
    const map: Record<number, string> = {};
    for (const b of banked ?? []) {
      const wk = (weeks ?? []).find(w => dateOnly(w.friStart) === dateOnly(b.checkIn));
      if (wk) map[wk.weekNo] = b.season;
    }
    return map;
  }, [banked, weeks]);

  // Scaffold every week of the year, overlaying stored seasons then unsaved edits.
  // `blocked` mirrors the server's availability guard so an unbankable week is visibly
  // out of play rather than only failing on save - advisory, the server is authoritative.
  const rows = useMemo(() => {
    if (!weeks) return [];
    return weeks.map(w => {
      const start = dateOnly(w.friStart);
      const end = weekCheckOut(w.friStart);
      const isBanked = stored[w.weekNo] !== undefined;

      let blocked = '';
      if (!isBanked && selectedUnit) {
        if (!selectedUnit.bankable) {
          blocked = selectedUnit.rciReserved !== 'Y' ? 'not RCI-qualified' : 'lock-off half';
        } else {
          const days: string[] = [];
          for (let ms = Date.parse(`${start}T00:00:00Z`); ms <= Date.parse(`${end}T00:00:00Z`); ms += DAY_MS) {
            days.push(new Date(ms).toISOString().slice(0, 10));
          }
          // Coverage is by the UNION of the unit's blocks, matching the server: a week can
          // legitimately straddle two consecutive yearly availability records.
          const covered = days.every(d =>
            selectedUnit.blocks.some(b => dateOnly(b.startDate) <= d && dateOnly(b.endDate) >= d));
          if (!covered) blocked = 'no availability (fn 5)';
        }
      }

      // Precedence: unsaved edit -> what the server holds -> the add-state default. A week
      // the grid can see is unbankable is never prefilled: the save is all-or-nothing, so
      // defaulting one to Red would make an untouched new year refuse to save.
      const fallback = isNewYear && !blocked ? DEFAULT_SEASON : NONE;
      const season = edits[w.weekNo] ?? stored[w.weekNo] ?? fallback;

      return {
        weekNo: w.weekNo,
        start,
        end,
        season,
        banked: isBanked,
        blocked,
        dirty: edits[w.weekNo] !== undefined && edits[w.weekNo] !== (stored[w.weekNo] ?? NONE),
      };
    });
  }, [weeks, stored, edits, selectedUnit, isNewYear]);

  const grid = useMemo(() => {
    const out: (typeof rows)[] = [];
    for (let i = 0; i < rows.length; i += COLS) out.push(rows.slice(i, i + COLS));
    return out;
  }, [rows]);

  const dirtyCount = rows.filter(r => r.dirty).length;
  const bankedCount = rows.filter(r => r.season !== NONE).length;
  // Weeks are cleared from the END backwards (53, then 52, then 51...), so only the highest
  // banked week carries a trash button. It is computed from what is DISPLAYED, not from what
  // is stored, so clearing one immediately moves the button up to the week before it.
  const lastBankedWeek = rows.reduce((last, r) => (r.season !== NONE ? r.weekNo : last), 0);
  // A brand-new year is entirely unsaved, so Save is meaningful even with no edits - but
  // only if something is actually prefilled. A clear-only unit, or one whose availability
  // doesn't reach this year, scaffolds an all-blank grid whose save would be a no-op.
  const canSave = dirtyCount > 0 || (isNewYear && bankedCount > 0);
  // The save reconciles creates, updates and deletes in one call, so it needs all three
  const mayWrite = canCreate('RESORTS_SETUP') && canEdit('RESORTS_SETUP') && canDelete('RESORTS_SETUP');

  // What is actually on the server, as opposed to what the grid is showing - the year
  // delete only makes sense when there is something stored to remove.
  const storedCount = banked?.length ?? 0;

  const deleteMut = useMutation({
    mutationFn: () => rciBulkBankApi.deleteYear({ resortCode, unitNo, weekYear: year }),
    onSuccess: (r) => {
      const { deleted, clamped } = r.data.data;
      qc.invalidateQueries({ queryKey: ['rci-bulk-bank'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      setEdits({});
      setDeleteOpen(false);
      setResult(
        `${resortCode} unit ${unitNo}, ${year} cleared — ${deleted} banked week(s) removed. `
        + `Availability for ${selectedUnit?.apartmentType ?? 'this apartment type'} rises by one `
        + 'per day over those weeks. The year can now be re-keyed from scratch.'
        + (clamped ? ' Some days were already at their limit and were left unchanged.' : ''),
      );
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const saveMut = useMutation({
    mutationFn: () => rciBulkBankApi.saveYear({
      resortCode, unitNo, weekYear: year,
      weeks: rows.map(r => ({ weekNo: r.weekNo, season: r.season === NONE ? null : r.season })),
    }),
    onSuccess: (r) => {
      const { created, updated, deleted, clamped } = r.data.data;
      qc.invalidateQueries({ queryKey: ['rci-bulk-bank'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      setEdits({});
      setResult(
        `${resortCode} unit ${unitNo}, ${year} saved — ${created} week(s) banked, `
        + `${updated} regraded, ${deleted} cleared.`
        + (created || deleted
          ? ` Availability for ${selectedUnit?.apartmentType ?? 'this apartment type'} moves by one per day over the affected weeks.`
          : '')
        + (clamped ? ' Some days were already at their limit and were left unchanged.' : ''),
      );
    },
    onError: (err) => setSaveErr(apiError(err)),
  });

  return (
    <div className="space-y-4">
      <div>
        <Link to="/rci" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> RCI
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">3. RCI Bulk Bank</h1>
        <p className="mt-1 text-sm text-gray-500">
          Weeks deposited into the RCI exchange network, one year of one unit at a time. Set
          the season on each week, then save the year.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-end gap-2">
          <div className="w-56">
            <Select label="Resort" value={resortCode} onChange={e => setParams({ resort: e.target.value })}>
              <option value="">Select resort…</option>
              {resorts.map(r => (
                <option key={r.id} value={r.resortCode}>{r.resortCode} — {r.shortName || r.resortName}</option>
              ))}
            </Select>
          </div>
          <div className="w-56">
            <Select
              label="Unit"
              value={unitNo}
              onChange={e => setParams({ unit: e.target.value })}
              disabled={!resortCode}
            >
              <option value="">{resortCode ? 'Select unit…' : 'Select a resort first'}</option>
              {units?.map(u => (
                <option key={u.unitNo} value={u.unitNo} disabled={u.blocks.length === 0}>
                  {u.unitNo} — {u.apartmentType}
                  {!u.bankable ? ' (not RCI-qualified)' : ''}
                  {u.blocks.length === 0 ? ' (no availability set up)' : ''}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-28">
            <Select label="Year" value={year || ''} onChange={e => setParams({ year: e.target.value })}>
              <option value="">Year…</option>
              {weekYears?.map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          {canDelete('RESORTS_SETUP') && ready && storedCount > 0 && (
            <Button size="sm" variant="secondary" className="ml-auto"
              onClick={() => { setDelErr(''); setDeleteOpen(true); }}>
              <Trash2 className="h-4 w-4" /> Delete year
            </Button>
          )}
        </CardHeader>

        {!!resortCode && units && units.length === 0 && (
          <p className="px-4 pt-3 text-xs text-amber-600">
            No bankable RCI-qualified units at this resort. Tick RCI Reserved in Apartment&apos;s
            Unit No. Maintenance and Setup (fn 4) first.
          </p>
        )}

        {!!splitTypes?.length && (
          <p className="px-4 pt-3 text-xs text-gray-500">
            {resortCode} has the lock-on/lock-off feature, so only whole units can be banked —
            the split halves ({splitTypes.join(', ')}) are not listed. Banking a half as well as
            the whole apartment would promise the same room to RCI twice.
          </p>
        )}

        {!weekYears?.length && (
          <p className="px-4 pt-3 text-xs text-amber-600">
            No RCI weeks set up yet. Generate a year in RCI Weekly Interval (fn 2) first — this
            grid draws one row per RCI week.
          </p>
        )}

        {!ready ? (
          <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
            <Landmark className="h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">Select a resort, unit and year to view its RCI weeks.</p>
          </div>
        ) : isLoading ? <PageSpinner /> : (
          <div className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-mono text-sm font-semibold text-gray-800">
                {resortCode} · {unitNo}
                {selectedUnit?.apartmentType ? ` (${selectedUnit.apartmentType})` : ''} · {year}
              </h2>
              <span className="text-xs text-gray-500">
                {bankedCount} of {rows.length} week(s) banked
                {dirtyCount > 0 && <span className="ml-2 font-medium text-amber-700">· {dirtyCount} unsaved change(s)</span>}
              </span>
            </div>

            {isNewYear && selectedUnit?.bankable && (
              <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                No weeks banked for this unit in {year} yet — every bankable week defaults to{' '}
                {SEASON_LABELS[DEFAULT_SEASON]}. Adjust the ones that differ, clear any you are not
                banking, then save.
              </p>
            )}

            {selectedUnit && !selectedUnit.bankable && (
              <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-700">
                Unit {unitNo} is no longer RCI-qualified, so no new weeks can be banked. Its{' '}
                {selectedUnit.bankedCount} existing record(s) stay editable and can be cleared —
                to bank again, tick RCI Reserved in Apartment&apos;s Unit No. Maintenance and Setup (fn 4).
              </p>
            )}

            <div className="overflow-x-auto">
              <table className="font-mono text-sm">
                <thead>
                  <tr className="text-gray-500">
                    {Array.from({ length: COLS }, (_, i) => (
                      <Fragment key={i}>
                        <th className="px-3 py-1 text-left font-normal">Wk</th>
                        <th className="px-3 py-1 text-left font-normal">Check-in</th>
                        <th className="px-3 py-1 text-left font-normal">Check-out</th>
                        <th className="px-3 py-1 text-left font-normal">Season</th>
                      </Fragment>
                    ))}
                  </tr>
                  <tr className="select-none text-gray-300">
                    {Array.from({ length: COLS }, (_, i) => (
                      <Fragment key={i}>
                        <th className="px-3 pb-1 text-left font-normal">----</th>
                        <th className="px-3 pb-1 text-left font-normal">------------</th>
                        <th className="px-3 pb-1 text-left font-normal">------------</th>
                        <th className="px-3 pb-1 text-left font-normal">------</th>
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.map((row, ri) => (
                    <tr key={ri}>
                      {Array.from({ length: COLS }, (_, ci) => {
                        const cell = row[ci];
                        if (!cell) {
                          return (
                            <Fragment key={ci}>
                              <td className="px-3 py-0.5" /><td className="px-3 py-0.5" />
                              <td className="px-3 py-0.5" /><td className="px-3 py-0.5" />
                            </Fragment>
                          );
                        }
                        return (
                          <Fragment key={ci}>
                            <td className={`px-3 py-0.5 text-right ${cell.banked ? 'text-gray-800' : 'text-gray-400'}`}>
                              {cell.weekNo}
                            </td>
                            <td className={`whitespace-nowrap px-3 py-0.5 ${cell.banked ? 'text-gray-800' : 'text-gray-400'}`}>
                              [{fmtDate(cell.start)}]
                            </td>
                            <td className={`whitespace-nowrap px-3 py-0.5 ${cell.banked ? 'text-gray-800' : 'text-gray-400'}`}>
                              [{fmtDate(cell.end)}]
                            </td>
                            <td className="whitespace-nowrap px-3 py-0.5">
                              <span className="text-gray-400">[</span>
                              <select
                                value={cell.season}
                                disabled={!mayWrite || !!cell.blocked}
                                title={cell.blocked
                                  ? `Cannot be banked — ${cell.blocked}`
                                  : (SEASON_LABELS[cell.season] ?? 'Not banked')}
                                onChange={e => setEdits(prev => ({ ...prev, [cell.weekNo]: e.target.value }))}
                                className={`mx-0.5 w-10 rounded px-1 text-center font-mono text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:text-gray-300 ${
                                  SEASON_BG[cell.season] ?? NONE_BG
                                } ${cell.dirty ? 'font-semibold ring-2 ring-amber-500' : ''}`}
                              >
                                {/* Options are tinted too, so the open list reads as colours as
                                    well. Only Chromium honours this; elsewhere it degrades to
                                    plain text, which is why the letter is still shown. */}
                                <option value={NONE} className={NONE_BG}>{NONE_LABEL}</option>
                                {SEASONS.map(v => (
                                  <option key={v} value={v} className={`${SEASON_BG[v]} text-gray-900`}>{v}</option>
                                ))}
                              </select>
                              <span className="text-gray-400">]</span>
                              {mayWrite && cell.weekNo === lastBankedWeek && (
                                <button
                                  type="button"
                                  onClick={() => setEdits(prev => ({ ...prev, [cell.weekNo]: NONE }))}
                                  title={`Clear week ${cell.weekNo} - weeks are cleared from the last one backwards`}
                                  className="ml-1 rounded p-0.5 align-middle text-gray-400 hover:bg-red-50 hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              {cell.blocked && (
                                <span className="ml-1 text-xs text-gray-400">{cell.blocked}</span>
                              )}
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {rows.length === 0 && (
              <p className="text-sm text-gray-500">
                {year} has no RCI weeks. Generate the year in RCI Weekly Interval (fn 2) first.
              </p>
            )}

            {saveErr && <p className="mt-3 text-sm text-red-600">{saveErr}</p>}

            {mayWrite && rows.length > 0 && (
              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={() => { setSaveErr(''); saveMut.mutate(); }}
                  loading={saveMut.isPending}
                  disabled={!canSave}
                >
                  <Save className="h-4 w-4" /> Save year
                </Button>
                {dirtyCount > 0 && (
                  <Button variant="secondary" onClick={() => setEdits({})}>Cancel changes</Button>
                )}
                <span className="text-xs text-gray-400">
                  R Red · B Blue · W White · {NONE_LABEL} not banked. The bin clears the last banked
                  week. Saving banks, regrades and clears weeks in one go, and nothing is written if
                  any week is refused.
                </span>
              </div>
            )}
          </div>
        )}
      </Card>

      <ConfirmDeleteModal
        open={deleteOpen}
        title="Clear this whole year?"
        description={
          `This removes every week ${unitNo} has banked to RCI in ${year} and gives each night back to `
          + 'the availability grid, so the year can be keyed again from scratch. It is unconditional — '
          + 'weeks the normal save would refuse to recreate are removed too. This cannot be undone.'
        }
        rows={[
          { label: 'Resort', value: <span className="font-mono">{resortCode}</span> },
          { label: 'Unit', value: <span className="font-mono">{unitNo}{selectedUnit?.apartmentType ? ` (${selectedUnit.apartmentType})` : ''}</span> },
          { label: 'Year', value: <span className="font-mono">{year}</span> },
          { label: 'Weeks banked', value: <span className="font-mono">{storedCount}</span> },
        ]}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Clear year"
        onConfirm={() => deleteMut.mutate()}
        onClose={() => setDeleteOpen(false)}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />
    </div>
  );
}
