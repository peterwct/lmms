import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Eye, Search, Landmark } from 'lucide-react';
import { rciBulkBankApi, rciWeeksApi } from '../../api/rci';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useActiveResorts } from '../../hooks/useActiveResorts';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { ResultDialog } from '../../components/ui/ResultDialog';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { Pagination } from '../../components/ui/Pagination';
import { RecordCount } from '../../components/ui/RecordCount';
import type { RciBulkBank as BulkBankRow } from '../../types';

// RCI Bulk Bank - RCI fn 3. One record = one RCI WEEK of one RCI-qualified unit
// (ResortUnit.rciReserved='Y') deposited into the RCI exchange network.
//
// The week is picked from fn 2's calendar and the server derives checkIn = friStart and
// checkOut = friStart + 6, so there is deliberately NO date input anywhere on this form -
// a non-Friday range simply cannot be keyed. Each save deducts one unit-night per day
// from the ResAvailMast grid's balNight.

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;
const MIN_YEAR = 2026; // mirrors the controller and fn 2

const SEASONS = ['R', 'B', 'W'] as const;
const SEASON_LABELS: Record<string, string> = { R: 'Red', B: 'Blue', W: 'White' };
const SEASON_BADGE: Record<string, string> = {
  R: 'bg-red-100 text-red-700',
  B: 'bg-blue-100 text-blue-700',
  W: 'bg-gray-100 text-gray-600 border border-gray-300',
};

// Stored dates are UTC midnight - slice the ISO string, never construct a local Date
const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : '');
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

// checkOut = friStart + 6 (= friEnd - 1). Pure UTC math on an ISO date string.
const weekCheckOut = (friStart: string) =>
  new Date(new Date(`${friStart.slice(0, 10)}T00:00:00Z`).getTime() + 6 * DAY_MS).toISOString().slice(0, 10);

function SeasonBadge({ season }: { season: string }) {
  return (
    <span className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ${SEASON_BADGE[season] ?? 'bg-gray-100 text-gray-600'}`}>
      {SEASON_LABELS[season] ?? season}
    </span>
  );
}

// ---------------------------------------------------------------------------------
// Add / edit form
// ---------------------------------------------------------------------------------

interface FormModalProps {
  open: boolean;
  row: BulkBankRow | null;
  onClose: () => void;
  onSaved: (saved: BulkBankRow, mode: 'add' | 'edit') => void;
}

const EMPTY_FORM = { resortCode: '', unitNo: '', weekYear: '', weekNo: '', season: '' };

function BulkBankFormModal({ open, row, onClose, onSaved }: FormModalProps) {
  const qc = useQueryClient();
  const { resorts } = useActiveResorts();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(row
      ? {
          resortCode: row.resortCode,
          unitNo: row.unitNo,
          weekYear: row.weekYear ? String(row.weekYear) : '',
          weekNo: row.weekNo ? String(row.weekNo) : '',
          season: row.season,
        }
      : EMPTY_FORM);
  }, [open, row]);

  const isEdit = !!row;
  const set = (k: string) => (v: string) => setForm(f => ({ ...f, [k]: v }));

  // RCI-qualified units at this resort, each carrying its fn 5 availability ranges
  const { data: unitsResp } = useQuery({
    queryKey: ['rci-bulk-bank', 'units', form.resortCode],
    queryFn: () => rciBulkBankApi.units(form.resortCode).then(r => r.data),
    enabled: open && !!form.resortCode && !isEdit,
  });
  const units = unitsResp?.data;
  // Non-empty only at a lock-on/lock-off resort: the half types the server filtered out.
  const splitTypes = unitsResp?.splitTypes ?? null;

  // Year list comes straight from fn 2 and shares its cache key, so generating a year
  // there refreshes this picker with no extra endpoint.
  const { data: weekYears } = useQuery({
    queryKey: ['rci-week-years'],
    queryFn: () => rciWeeksApi.years().then(r => r.data.data),
    enabled: open,
  });

  const year = parseInt(form.weekYear, 10);
  const { data: weeks } = useQuery({
    queryKey: ['rci-weeks', year],
    queryFn: () => rciWeeksApi.list({ year }).then(r => r.data.data),
    enabled: open && year >= MIN_YEAR,
  });

  // Advisory greying only - the server checks are authoritative.
  const { data: banked } = useQuery({
    queryKey: ['rci-bulk-bank', 'taken', form.resortCode, form.unitNo, form.weekYear],
    queryFn: () => rciBulkBankApi
      .list({ resortCode: form.resortCode, unitNo: form.unitNo, weekYear: year, pageSize: 200 })
      .then(r => r.data.data),
    enabled: open && !!form.resortCode && !!form.unitNo && year >= MIN_YEAR,
  });

  const selectedUnit = units?.find(u => u.unitNo === form.unitNo);

  // Week options, each annotated with why it can't be picked
  const weekOptions = useMemo(() => {
    if (!weeks) return [];
    const takenIso = new Set(
      (banked ?? []).filter(b => b.id !== row?.id).map(b => dateOnly(b.checkIn)),
    );
    return weeks.map(w => {
      const start = dateOnly(w.friStart);
      const end = weekCheckOut(w.friStart);
      let reason = '';
      if (takenIso.has(start)) reason = 'already banked';
      else if (selectedUnit) {
        // Mirror the server's rule exactly: EVERY day of the week must be covered by the
        // UNION of the unit's fn 5 blocks, so a week spanning two consecutive yearly
        // blocks still passes. Advisory only - checkAvailability() is authoritative.
        const days: string[] = [];
        for (let ms = Date.parse(`${start}T00:00:00Z`); ms <= Date.parse(`${end}T00:00:00Z`); ms += DAY_MS) {
          days.push(new Date(ms).toISOString().slice(0, 10));
        }
        const covered = days.every(d =>
          selectedUnit.blocks.some(b => dateOnly(b.startDate) <= d && dateOnly(b.endDate) >= d));
        if (!covered) reason = 'no availability';
      }
      return { weekNo: w.weekNo, start, end, reason };
    });
  }, [weeks, banked, selectedUnit, row?.id]);

  const chosenWeek = weekOptions.find(w => String(w.weekNo) === form.weekNo);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        weekYear: parseInt(form.weekYear, 10),
        weekNo: parseInt(form.weekNo, 10),
        season: form.season,
      };
      return isEdit
        ? rciBulkBankApi.update(row!.id, payload)
        : rciBulkBankApi.create({ resortCode: form.resortCode, unitNo: form.unitNo, ...payload });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rci-bulk-bank'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      onSaved(r.data.data, isEdit ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const canSave = !!form.resortCode && !!form.unitNo && !!form.weekYear && !!form.weekNo && !!form.season;

  return (
    <Modal open={open} title={isEdit ? 'Edit Bulk Bank Week' : 'Add Bulk Bank Week'} onClose={onClose} size="lg">
      <div className="space-y-3">
        {isEdit ? (
          // resortCode / unitNo / apartmentType are immutable (move = delete + re-add,
          // the ResortMaintenance rule); serialNo is the RCI-facing identity.
          <div className="grid grid-cols-4 gap-3 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <div><span className="block text-xs text-gray-500">Resort</span><span className="font-mono font-medium">{row!.resortCode}</span></div>
            <div><span className="block text-xs text-gray-500">Unit</span><span className="font-mono font-medium">{row!.unitNo}</span></div>
            <div><span className="block text-xs text-gray-500">Type</span><span className="font-medium">{row!.apartmentType ?? '—'}</span></div>
            <div><span className="block text-xs text-gray-500">Serial no.</span><span className="font-mono font-medium">{row!.serialNo}</span></div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Resort"
              value={form.resortCode}
              onChange={e => setForm(f => ({ ...f, resortCode: e.target.value, unitNo: '' }))}
              required
            >
              <option value="">Select resort…</option>
              {resorts.map(r => (
                <option key={r.id} value={r.resortCode}>{r.resortCode} — {r.shortName || r.resortName}</option>
              ))}
            </Select>

            <Select
              label="Unit (RCI-qualified only)"
              value={form.unitNo}
              onChange={e => set('unitNo')(e.target.value)}
              disabled={!form.resortCode}
              required
            >
              <option value="">{form.resortCode ? 'Select unit…' : 'Select a resort first'}</option>
              {units?.map(u => (
                <option key={u.unitNo} value={u.unitNo} disabled={u.blocks.length === 0}>
                  {u.unitNo} — {u.apartmentType}{u.blocks.length === 0 ? ' (no availability set up)' : ''}
                </option>
              ))}
            </Select>
          </div>
        )}

        {!isEdit && form.resortCode && units && units.length === 0 && (
          <p className="text-xs text-amber-600">
            No bankable RCI-qualified units at this resort. Tick RCI Reserved in Apartment&apos;s
            Unit No. Maintenance and Setup (fn 4) first.
          </p>
        )}

        {!isEdit && !!splitTypes?.length && (
          <p className="text-xs text-gray-500">
            {form.resortCode} has the lock-on/lock-off feature, so only whole units can be banked —
            the split halves ({splitTypes.join(', ')}) are not listed. Banking a half as well as the
            whole apartment would promise the same room to RCI twice.
          </p>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Select
            label="Year"
            value={form.weekYear}
            onChange={e => setForm(f => ({ ...f, weekYear: e.target.value, weekNo: '' }))}
            required
          >
            <option value="">Select year…</option>
            {weekYears?.map(y => <option key={y} value={y}>{y}</option>)}
          </Select>

          <Select
            label="Week no."
            value={form.weekNo}
            onChange={e => set('weekNo')(e.target.value)}
            disabled={!form.weekYear || (!isEdit && !form.unitNo)}
            required
          >
            <option value="">{form.weekYear ? 'Select week…' : 'Select a year first'}</option>
            {weekOptions.map(w => (
              <option key={w.weekNo} value={w.weekNo} disabled={!!w.reason}>
                {w.weekNo} — {fmtDate(w.start)} to {fmtDate(w.end)}{w.reason ? ` (${w.reason})` : ''}
              </option>
            ))}
          </Select>

          <Select label="Season" value={form.season} onChange={e => set('season')(e.target.value)} required>
            <option value="">Select season…</option>
            {SEASONS.map(s => <option key={s} value={s}>{SEASON_LABELS[s]}</option>)}
          </Select>
        </div>

        {!weekYears?.length && (
          <p className="text-xs text-amber-600">
            No RCI weeks set up yet. Add a year in RCI Weekly Interval (fn 2) first.
          </p>
        )}

        {isEdit && !row!.weekYear && (
          <p className="text-xs text-amber-600">
            This record&apos;s dates ({fmtDate(row!.checkIn)} to {fmtDate(row!.checkOut)}) don&apos;t match
            any RCI week — pick one to correct it.
          </p>
        )}

        {chosenWeek && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            Check-in <span className="font-mono font-medium">Fri {fmtDate(chosenWeek.start)}</span>
            {' · '}Check-out <span className="font-mono font-medium">{fmtDate(chosenWeek.end)}</span>
            {' · '}7 nights
            <p className="mt-1 text-xs text-gray-500">
              Availability for this apartment type drops by one per day over the week.
            </p>
          </div>
        )}

        <p className="text-xs text-gray-400">
          The week comes from the RCI week calendar (fn 2), so check-in is always a Friday and
          check-out is always six days later — there is nothing else to key.
        </p>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!canSave}>
          {isEdit ? 'Save changes' : 'Add bulk bank week'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------
// Per-day grid for one banked week
// ---------------------------------------------------------------------------------

function AvailabilityModal({ record, onClose }: { record: BulkBankRow | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['rci-bulk-bank-availability', record?.id],
    queryFn: () => rciBulkBankApi.availability(record!.id).then(r => r.data),
    enabled: !!record,
  });

  return (
    <Modal open={!!record} title="Availability During Banked Week" onClose={onClose} size="lg">
      {record && (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            <span className="font-mono font-medium text-gray-800">{record.resortCode}</span>
            {' · unit '}<span className="font-mono font-medium text-gray-800">{record.unitNo}</span>
            {' · type '}<span className="font-medium text-gray-800">{record.apartmentType ?? '—'}</span>
            {record.weekYear && record.weekNo && <>{' · '}{record.weekYear} wk {record.weekNo}</>}
            {' · '}{dateOnly(record.checkIn)} to {dateOnly(record.checkOut)}
            {' · '}{SEASON_LABELS[record.season] ?? record.season}
          </div>
          <p className="text-xs text-gray-500">
            Availability is tracked per apartment type (aggregated across all units of that type).
            Act = units of this type registered that day; Bal = act minus bulk bank minus maintenance minus bookings.
          </p>
          {isLoading ? <PageSpinner /> : (
            data && data.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                {data.apartmentType ? 'No availability rows for this week.' : 'This unit has no apartment type mapped.'}
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-md">
                <table className="min-w-full text-xs">
                  <thead className="bg-blue-600 text-white sticky top-0">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium">Date</th>
                      <th className="px-3 py-1.5 text-right font-medium">Act</th>
                      <th className="px-3 py-1.5 text-right font-medium">Bal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.data.map((d, i) => (
                      <tr key={d.date} className={i % 2 ? 'bg-blue-50/40' : 'bg-white'}>
                        <td className="px-3 py-1 font-mono">{dateOnly(d.date)}</td>
                        <td className="px-3 py-1 text-right font-mono">{d.actNight}</td>
                        <td className="px-3 py-1 text-right font-mono">{d.balNight}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          {data && data.data.length > 0 && (
            <p className="text-xs text-gray-400">{data.data.length} day(s)</p>
          )}
        </div>
      )}
      <div className="mt-4">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------------

export function RciBulkBank() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { resorts } = useActiveResorts();

  const q = searchParams.get('q') ?? '';
  const resortCode = searchParams.get('resort') ?? '';
  const yearFilter = searchParams.get('year') ?? '';
  const seasonFilter = searchParams.get('season') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [searchInput, setSearchInput] = useState(q);
  useEffect(() => { setSearchInput(q); }, [q]);

  const [formOpen, setFormOpen] = useState(false);
  const [editRow, setEditRow] = useState<BulkBankRow | null>(null);
  const [viewRow, setViewRow] = useState<BulkBankRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BulkBankRow | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  // Filters live in the URL so Back restores the whole view; any change resets to page 1
  const setParams = (next: { q?: string; resort?: string; year?: string; season?: string; page?: number }) => {
    const p: Record<string, string> = {};
    const nq = next.q ?? q;
    const nr = next.resort ?? resortCode;
    const ny = next.year ?? yearFilter;
    const ns = next.season ?? seasonFilter;
    const np = next.page ?? 1;
    if (nq) p.q = nq;
    if (nr) p.resort = nr;
    if (ny) p.year = ny;
    if (ns) p.season = ns;
    if (np > 1) p.page = String(np);
    setSearchParams(p, { replace: true });
  };

  const { data: years } = useQuery({
    queryKey: ['rci-bulk-bank', 'years'],
    queryFn: () => rciBulkBankApi.years().then(r => r.data.data),
  });

  const { data: list, isLoading } = useQuery({
    queryKey: ['rci-bulk-bank', 'list', q, resortCode, yearFilter, seasonFilter, page],
    queryFn: () => rciBulkBankApi.list({
      q: q || undefined,
      resortCode: resortCode || undefined,
      weekYear: yearFilter ? parseInt(yearFilter, 10) : undefined,
      season: seasonFilter || undefined,
      page,
      pageSize: PAGE_SIZE,
    }).then(r => r.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => rciBulkBankApi.remove(id),
    onSuccess: (_r, id) => {
      // Name the record before invalidating, while it is still in the cached list
      const gone = list?.data.find(b => b.id === id);
      qc.invalidateQueries({ queryKey: ['rci-bulk-bank'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      setDeleteTarget(null);
      setResult(gone
        ? `Bulk bank week deleted — ${gone.resortCode} unit ${gone.unitNo} (${gone.apartmentType ?? '—'}), `
          + `${gone.weekYear ?? ''} week ${gone.weekNo ?? ''} (${fmtDate(gone.checkIn)} to ${fmtDate(gone.checkOut)}). `
          + 'Availability for this apartment type is restored by one per day over that week.'
        : 'Bulk bank week deleted.');
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const rows = list?.data ?? [];
  const pages = list ? Math.ceil(list.total / list.pageSize) : 0;

  const openAdd = () => { setEditRow(null); setFormOpen(true); };
  const openEdit = (r: BulkBankRow) => { setEditRow(r); setFormOpen(true); };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/rci" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> RCI
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">3. RCI Bulk Bank</h1>
        <p className="mt-1 text-sm text-gray-500">
          LHB inventory deposited into the RCI exchange network — one RCI week per qualifying unit,
          graded Red / Blue / White by RCI. Each week is deducted from the resort&apos;s availability.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="w-56">
              <Select label="Resort" value={resortCode} onChange={e => setParams({ resort: e.target.value })}>
                <option value="">All resorts</option>
                {resorts.map(r => (
                  <option key={r.id} value={r.resortCode}>{r.resortCode} — {r.shortName || r.resortName}</option>
                ))}
              </Select>
            </div>
            <div className="w-28">
              <Select label="Year" value={yearFilter} onChange={e => setParams({ year: e.target.value })}>
                <option value="">All years</option>
                {years?.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <div className="w-32">
              <Select label="Season" value={seasonFilter} onChange={e => setParams({ season: e.target.value })}>
                <option value="">All seasons</option>
                {SEASONS.map(s => <option key={s} value={s}>{SEASON_LABELS[s]}</option>)}
              </Select>
            </div>
            <div className="w-56">
              <Input
                label="Search"
                placeholder="Resort / unit / type"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') setParams({ q: searchInput }); }}
              />
            </div>
            <Button size="sm" variant="secondary" onClick={() => setParams({ q: searchInput })}>
              <Search className="h-4 w-4" /> Search
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setSearchInput(''); setSearchParams({}, { replace: true }); }}>
              Clear
            </Button>
          </div>
          {canCreate('RESORTS_SETUP') && (
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Add bulk bank week</Button>
          )}
        </CardHeader>

        <div className="px-6 py-2 border-b border-gray-100">
          <RecordCount total={list?.total} loading={isLoading} />
        </div>

        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Resort</th>
                  <th className="px-4 py-3 text-left">Unit</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-right w-20">Year</th>
                  <th className="px-4 py-3 text-right w-20">Week</th>
                  <th className="px-4 py-3 text-left">Check-in</th>
                  <th className="px-4 py-3 text-left">Check-out</th>
                  <th className="px-4 py-3 text-left w-24">Season</th>
                  <th className="px-4 py-3 text-right w-28">Actions</th>
                </tr>
              </thead>
              {/* No divide-y here: the row borders are drawn per row below, so the batch
                  rule can be heavier than the hairline without fighting divide-y's
                  higher-specificity `> * + *` selector. */}
              <tbody>
                {rows.map((b, i) => {
                  // The list is ordered resortCode -> weekYear -> unitNo -> checkIn, so a
                  // change in (resort, year, unit) starts a new batch of weeks for the next
                  // unit. Those get a heavier rule; rows inside a batch keep the hairline.
                  const prev = i > 0 ? rows[i - 1] : null;
                  const newBatch = !!prev && (
                    prev.resortCode !== b.resortCode ||
                    prev.weekYear !== b.weekYear ||
                    prev.unitNo !== b.unitNo
                  );
                  const rule = i === 0
                    ? ''
                    : newBatch ? 'border-t-2 border-gray-300' : 'border-t border-gray-100';
                  return (
                  <tr key={b.id} className={`hover:bg-gray-50 ${rule}`}>
                    <td className="px-4 py-2">
                      <span className="font-mono font-medium">{b.resortCode}</span>
                      <span className="ml-2 text-xs text-gray-500">{b.resort?.shortName || b.resort?.resortName}</span>
                    </td>
                    <td className="px-4 py-2 font-mono">{b.unitNo}</td>
                    <td className="px-4 py-2">{b.apartmentType ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{b.weekYear ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-mono">{b.weekNo ?? '—'}</td>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">{fmtDate(b.checkIn)}</td>
                    <td className="px-4 py-2 font-mono whitespace-nowrap">{fmtDate(b.checkOut)}</td>
                    <td className="px-4 py-2"><SeasonBadge season={b.season} /></td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setViewRow(b)} title="View availability" className="p-1 text-gray-400 hover:text-blue-600">
                          <Eye className="h-4 w-4" />
                        </button>
                        {canEdit('RESORTS_SETUP') && (
                          <button onClick={() => openEdit(b)} title="Edit" className="p-1 text-gray-400 hover:text-blue-600">
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                        {canDelete('RESORTS_SETUP') && (
                          <button onClick={() => { setDelErr(''); setDeleteTarget(b); }} title="Delete" className="p-1 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-16 text-center">
                      <Landmark className="mx-auto h-10 w-10 text-gray-300" />
                      <p className="mt-3 text-sm text-gray-500">No RCI bulk bank records found.</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {list && pages > 1 && (
          <Pagination
            page={page}
            pages={pages}
            total={list.total}
            limit={list.pageSize}
            onPage={p => setParams({ page: p })}
          />
        )}
      </Card>

      <BulkBankFormModal
        open={formOpen}
        row={editRow}
        onClose={() => setFormOpen(false)}
        onSaved={(saved, mode) => setResult(
          `Bulk bank week ${mode === 'add' ? 'added' : 'updated'} — ${saved.resortCode} unit ${saved.unitNo} `
          + `(${saved.apartmentType ?? '—'}), ${saved.weekYear} week ${saved.weekNo} `
          + `(${fmtDate(saved.checkIn)} to ${fmtDate(saved.checkOut)}), ${SEASON_LABELS[saved.season] ?? saved.season}`
          + (mode === 'add' ? `, serial ${saved.serialNo}. Availability for this apartment type drops by one per day over that week.` : '.'),
        )}
      />

      <AvailabilityModal record={viewRow} onClose={() => setViewRow(null)} />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete this bulk bank week?"
        description="This removes the week from the RCI bulk bank. Availability for this apartment type is given back — one unit-night per day over the week. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'Resort', value: <span className="font-mono font-medium">{deleteTarget.resortCode}</span> },
          { label: 'Unit',   value: <span className="font-mono font-medium">{deleteTarget.unitNo} ({deleteTarget.apartmentType ?? '—'})</span> },
          { label: 'Week',   value: deleteTarget.weekYear && deleteTarget.weekNo ? `${deleteTarget.weekYear} wk ${deleteTarget.weekNo}` : '—' },
          { label: 'Dates',  value: `${fmtDate(deleteTarget.checkIn)} to ${fmtDate(deleteTarget.checkOut)}` },
          { label: 'Season', value: SEASON_LABELS[deleteTarget.season] ?? deleteTarget.season },
          { label: 'Serial no.', value: <span className="font-mono">{deleteTarget.serialNo}</span> },
        ] : []}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete week"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
