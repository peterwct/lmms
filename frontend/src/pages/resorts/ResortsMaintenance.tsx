import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search, Eye, CalendarRange, X } from 'lucide-react';
import { aptBlocksApi, resortMaintenanceApi, resortUnitsApi } from '../../api/resorts';
import { useActiveResorts } from '../../hooks/useActiveResorts';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { ResultDialog } from '../../components/ui/ResultDialog';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { DraggableWindow } from '../../components/ui/DraggableWindow';
import { DateRangeCalendar } from '../../components/ui/DateRangeCalendar';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { RecordCount } from '../../components/ui/RecordCount';
import { Pagination } from '../../components/ui/Pagination';
import { ResortAvailabilityChart } from '../../components/ResortAvailabilityChart';
import type { Resort, ResortMaintenance } from '../../types';

const PAGE_SIZE = 50;

// An Add keys up to 3 date ranges for the same unit, all sharing one reason; each range
// becomes its own record. Edit stays single-range - a record IS one range.
const MAX_RANGES = 3;

type RangeForm = { startDate: string; endDate: string };

const emptyForm = () => ({
  resortCode: '',
  unitNo: '',
  aptBlockId: '',
  remarks: '',
  ranges: Array.from({ length: MAX_RANGES }, (): RangeForm => ({ startDate: '', endDate: '' })),
});

const touched = (r: RangeForm) => r.startDate !== '' || r.endDate !== '';
const complete = (r: RangeForm) => r.startDate !== '' && r.endDate !== '' && r.startDate <= r.endDate;

// Same inclusive rule as the server: touching ranges share a day, which would be
// deducted from that day's availability twice. Safe string compare on YYYY-MM-DD.
const overlaps = (a: RangeForm, b: RangeForm) => a.startDate <= b.endDate && a.endDate >= b.startDate;

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Stored dates are UTC midnight — show the calendar date, and feed <input type="date"> a YYYY-MM-DD value
const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : '');

// The user's calendar date as YYYY-MM-DD, for string compares against dateOnly() values.
// Local parts, not toISOString(), so it flips at local midnight rather than 8am (UTC+8).
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// One-line record description, shared by every confirmation message on this page
const describe = (m: ResortMaintenance) =>
  `${m.resortCode} unit ${m.unitNo}${m.apartmentType ? ` (${m.apartmentType})` : ''}, ` +
  `${dateOnly(m.startDate)} to ${dateOnly(m.endDate)}`;

// Result text for a save. An add can create up to 3 records at once - all for the same
// unit and reason - so name the unit once and list the ranges. ResultDialog renders a
// plain <p>, so this has to stay a single line.
function savedMessage(saved: ResortMaintenance[], mode: 'add' | 'edit'): string {
  const first = saved[0];
  if (mode === 'edit') return `Maintenance record updated — ${describe(first)}.`;
  if (saved.length === 1) {
    return `Maintenance record added — ${describe(first)}. ` +
      'Availability for this apartment type drops by one per day over that range.';
  }
  const unit = `${first.resortCode} unit ${first.unitNo}${first.apartmentType ? ` (${first.apartmentType})` : ''}`;
  const ranges = saved.map(m => `${dateOnly(m.startDate)} to ${dateOnly(m.endDate)}`).join('; ');
  return `${saved.length} maintenance records added — ${unit}${first.remarks ? `, ${first.remarks}` : ''}: ${ranges}. ` +
    'Availability for this apartment type drops by one per day over those ranges.';
}

interface ModalProps {
  open: boolean;
  record: ResortMaintenance | null;   // null = add mode
  resorts: Resort[];
  onClose: () => void;
  onSaved: (saved: ResortMaintenance[], mode: 'add' | 'edit') => void;
}

function MaintenanceFormModal({ open, record, resorts, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState(emptyForm());
  const [error, setError] = useState('');
  const [openRow, setOpenRow] = useState<number | null>(null);   // which row's calendar is showing

  useEffect(() => {
    if (!open) return;
    setError('');
    setOpenRow(null);
    setForm(record ? {
      resortCode: record.resortCode,
      unitNo: record.unitNo,
      aptBlockId: '',   // filled in once the availability records load, below
      remarks: record.remarks ?? '',
      ranges: [{ startDate: dateOnly(record.startDate), endDate: dateOnly(record.endDate) }],
    } : emptyForm());
  }, [open, record]);

  const setRange = (i: number, patch: Partial<RangeForm>) =>
    setForm(f => ({ ...f, ranges: f.ranges.map((r, n) => (n === i ? { ...r, ...patch } : r)) }));

  // Units registered for the chosen resort (add mode only) — the apartment type
  // is derived server-side from the picked unit, so it is shown but not chosen.
  const { data: units } = useQuery({
    queryKey: ['resort-units', 'for-maintenance', form.resortCode],
    queryFn: () => resortUnitsApi.list({ resortCode: form.resortCode, pageSize: 200 }).then(r => r.data.data),
    enabled: open && !record && !!form.resortCode,
  });
  const unitOptions = units ?? [];

  // The unit's availability records from fn 5. Maintenance withdraws availability, so the
  // user picks the record to withdraw from and every range must sit inside it — a unit
  // with no record at all can't go under maintenance. Needed in EDIT mode too, hence no
  // `!record`. The 'apt-blocks' key prefix means fn 5's own invalidate refreshes it.
  const { data: unitsWithAvailability } = useQuery({
    queryKey: ['apt-blocks', 'units', form.resortCode],
    queryFn: () => aptBlocksApi.units(form.resortCode).then(r => r.data.data),
    enabled: open && !!form.resortCode,
  });
  const availabilityLoaded = unitsWithAvailability !== undefined;
  const blocksByUnit = useMemo(
    () => new Map((unitsWithAvailability ?? []).map(u => [u.unitNo, u.blocks])),
    [unitsWithAvailability],
  );
  // Treat everything as available until the list arrives, so nothing flickers disabled
  const hasAvailability = (unitNo: string) => !availabilityLoaded || blocksByUnit.has(unitNo);
  const unitBlocks = blocksByUnit.get(form.unitNo) ?? [];
  const selectedBlock = unitBlocks.find(b => b.id === form.aptBlockId);

  // Clamp every picker to the chosen availability record
  const blockFrom = selectedBlock ? dateOnly(selectedBlock.startDate) : '';
  const blockTo = selectedBlock ? dateOnly(selectedBlock.endDate) : '';

  // Only availability that hasn't lapsed is worth putting a unit under maintenance for.
  // The selected record is always kept, so editing an old row whose availability is in
  // the past still shows what it is bound to instead of a blank dropdown.
  const blockOptions = useMemo(() => {
    const today = todayStr();
    return unitBlocks.filter(b => dateOnly(b.endDate) >= today || b.id === form.aptBlockId);
  }, [unitBlocks, form.aptBlockId]);

  // Days this unit is already withdrawn on, within the selected availability — the
  // calendar greys them out. The record being edited is excluded: its own days must stay
  // pickable. Scoped server-side by unit + the availability window, so 200 is ample.
  const { data: takenRecords } = useQuery({
    queryKey: ['resort-maintenance', 'taken', form.resortCode, form.unitNo, blockFrom, blockTo],
    queryFn: () => resortMaintenanceApi.list({
      resortCode: form.resortCode, unitNo: form.unitNo,
      from: blockFrom, to: blockTo, pageSize: 200,
    }).then(r => r.data.data),
    enabled: open && !!form.unitNo && !!blockFrom,
  });
  const blockedRanges = useMemo(() => (takenRecords ?? [])
    .filter(m => m.id !== record?.id)
    .map(m => ({ start: dateOnly(m.startDate), end: dateOnly(m.endDate) })),
  [takenRecords, record]);

  // Edit opens on an existing range — preselect the record covering it. Left blank when
  // none does (legacy rows predate the rule), which blocks Save until the user picks one.
  useEffect(() => {
    if (!open || !record || form.aptBlockId || unitBlocks.length === 0) return;
    const start = dateOnly(record.startDate);
    const end = dateOnly(record.endDate);
    const covering = unitBlocks.find(b => dateOnly(b.startDate) <= start && dateOnly(b.endDate) >= end);
    if (covering) setForm(f => ({ ...f, aptBlockId: covering.id }));
  }, [open, record, form.aptBlockId, unitBlocks]);

  const filled = form.ranges.filter(touched);

  const saveMut = useMutation({
    // Add returns the whole batch it wrote, edit a single record - normalise to an array
    mutationFn: async (): Promise<ResortMaintenance[]> => {
      const remarks = form.remarks.trim();
      if (record) {
        const r = form.ranges[0];
        const res = await resortMaintenanceApi.update(record.id, {
          aptBlockId: form.aptBlockId, startDate: r.startDate, endDate: r.endDate, remarks,
        });
        return [res.data.data];
      }
      const res = await resortMaintenanceApi.create({
        resortCode: form.resortCode,
        unitNo: form.unitNo,
        aptBlockId: form.aptBlockId,
        remarks,
        ranges: filled.map(r => ({ startDate: r.startDate, endDate: r.endDate })),
      });
      return res.data.data;
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ['resort-maintenance'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      qc.invalidateQueries({ queryKey: ['resort-maintenance-years'] });
      onSaved(saved, record ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  // First problem with a row, or '' when it is fine (or still blank). Rows are compared
  // against the earlier ones only, so a clash is reported once, on the later row.
  const rowError = (i: number): string => {
    const r = form.ranges[i];
    if (!touched(r)) return '';
    if (!r.startDate || !r.endDate) return 'Both dates are required.';
    if (r.startDate > r.endDate) return 'End date must be on or after start date.';
    for (let j = 0; j < i; j++) {
      if (complete(form.ranges[j]) && overlaps(r, form.ranges[j])) return `Overlaps range ${j + 1}.`;
    }
    // Backstop for the calendar, which already refuses to select these days
    if (blockedRanges.some(b => b.start <= r.endDate && b.end >= r.startDate)) {
      return 'This unit is already under maintenance on those dates.';
    }
    // Every range must sit inside the availability record the user picked
    if (selectedBlock) {
      const from = dateOnly(selectedBlock.startDate);
      const to = dateOnly(selectedBlock.endDate);
      if (r.startDate < from || r.endDate > to) return `Outside the selected availability (${from} to ${to}).`;
    }
    return '';
  };

  // What the calendar must grey out for a row: days already under maintenance, plus the
  // days the OTHER rows of this form have claimed.
  const blockedFor = (i: number) => [
    ...blockedRanges,
    ...form.ranges
      .map((r, n) => ({ r, n }))
      .filter(({ r, n }) => n !== i && complete(r))
      .map(({ r }) => ({ start: r.startDate, end: r.endDate })),
  ];

  // One range row: its number (add mode), the range as a button opening the calendar,
  // and a clear button once anything is picked.
  const rangeField = (i: number) => {
    const r = form.ranges[i];
    const label = r.startDate && r.endDate
      ? `${r.startDate} to ${r.endDate}`
      : r.startDate ? `${r.startDate} to …` : 'Select dates…';
    const cols = record ? 'grid-cols-[1fr_1.5rem]' : 'grid-cols-[1.25rem_1fr_1.5rem]';
    return (
      <div className={`grid ${cols} gap-2 items-center`}>
        {!record && <span className="text-sm text-gray-500">{i + 1}.</span>}
        <button
          type="button"
          disabled={!selectedBlock}
          onClick={() => setOpenRow(openRow === i ? null : i)}
          className={'flex items-center gap-2 rounded-md border px-3 py-2 text-left text-sm shadow-sm '
            + (openRow === i ? 'border-blue-500 ring-2 ring-blue-500 ' : 'border-gray-300 ')
            + (selectedBlock ? 'bg-white hover:bg-gray-50 ' : 'bg-gray-50 text-gray-400 cursor-not-allowed ')
            + (touched(r) ? 'text-gray-800' : 'text-gray-400')}
        >
          <CalendarRange className="h-4 w-4 shrink-0 text-gray-400" />
          {label}
        </button>
        {touched(r) ? (
          <button
            type="button"
            title={`Clear range ${i + 1}`}
            onClick={() => { setRange(i, { startDate: '', endDate: '' }); setOpenRow(null); }}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <span />
        )}
      </div>
    );
  };

  const rangesValid = filled.length > 0 && form.ranges.every((_, i) => rowError(i) === '');
  const canSave = form.remarks.trim() !== '' && rangesValid && !!selectedBlock
    && (!!record || (!!form.resortCode && !!form.unitNo));

  return (
    <Modal open={open} title={record ? 'Edit Maintenance Record' : 'Add Maintenance Record'} onClose={onClose}>
      <div className="space-y-3">
        {record ? (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resort</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">{record.resortCode}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">{record.unitNo}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apartment type</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-800">{record.apartmentType ?? '—'}</div>
            </div>
          </div>
        ) : (
          <>
            <Select
              label="Resort"
              value={form.resortCode}
              onChange={e => setForm(f => ({ ...f, resortCode: e.target.value, unitNo: '', aptBlockId: '' }))}
              required
            >
              <option value="">Select resort...</option>
              {resorts.map(r => (
                <option key={r.id} value={r.resortCode}>{r.resortCode} — {r.resortName}</option>
              ))}
            </Select>
            <Select
              label="Unit no"
              value={form.unitNo}
              onChange={e => setForm(f => ({ ...f, unitNo: e.target.value, aptBlockId: '' }))}
              disabled={!form.resortCode}
              required
            >
              <option value="">Select unit...</option>
              {unitOptions.map(u => (
                <option key={u.id} value={u.unitNo} disabled={!hasAvailability(u.unitNo)}>
                  {u.unitNo} — {u.apartmentType}{hasAvailability(u.unitNo) ? '' : ' (no availability set up)'}
                </option>
              ))}
            </Select>
            {form.resortCode && unitOptions.length === 0 && (
              <p className="text-xs text-amber-600 -mt-2">
                No units set up for this resort — add them in Apartment&apos;s Unit No. Maintenance and Setup first.
              </p>
            )}
            {form.resortCode && unitOptions.length > 0 && availabilityLoaded && blocksByUnit.size === 0 && (
              <p className="text-xs text-amber-600 -mt-2">
                No units at this resort have availability set up yet — add it in Resorts Unit
                Availability/Inventory Setup first.
              </p>
            )}
          </>
        )}
        {/* The record the maintenance is withdrawn from — every range must sit inside it */}
        <Select
          label="Availability"
          value={form.aptBlockId}
          onChange={e => { setOpenRow(null); setForm(f => ({ ...f, aptBlockId: e.target.value })); }}
          disabled={!form.unitNo}
          required
        >
          <option value="">Select availability...</option>
          {blockOptions.map(b => (
            <option key={b.id} value={b.id}>{dateOnly(b.startDate)} to {dateOnly(b.endDate)}</option>
          ))}
        </Select>
        {form.unitNo && availabilityLoaded && unitBlocks.length === 0 && (
          <p className="text-xs text-amber-600 -mt-2">
            This unit has no availability set up — add it in Resorts Unit Availability/Inventory
            Setup first.
          </p>
        )}
        {form.unitNo && availabilityLoaded && unitBlocks.length > 0 && blockOptions.length === 0 && (
          <p className="text-xs text-amber-600 -mt-2">
            This unit&apos;s availability has all lapsed — extend it in Resorts Unit
            Availability/Inventory Setup first.
          </p>
        )}
        {record ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Dates</label>
            {rangeField(0)}
            {rowError(0) && <p className="text-xs text-red-600">{rowError(0)}</p>}
            {openRow === 0 && selectedBlock && (
              <DateRangeCalendar
                value={{ start: form.ranges[0].startDate, end: form.ranges[0].endDate }}
                min={blockFrom}
                max={blockTo}
                blocked={blockedFor(0)}
                onChange={v => setRange(0, { startDate: v.start, endDate: v.end })}
                onDone={() => setOpenRow(null)}
              />
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Date ranges</label>
            {form.ranges.map((r, i) => (
              <div key={i}>
                {rangeField(i)}
                {rowError(i) && <p className="mt-1 ml-7 text-xs text-red-600">{rowError(i)}</p>}
                {openRow === i && selectedBlock && (
                  <div className="mt-2 ml-7">
                    <DateRangeCalendar
                      value={{ start: r.startDate, end: r.endDate }}
                      min={blockFrom}
                      max={blockTo}
                      blocked={blockedFor(i)}
                      onChange={v => setRange(i, { startDate: v.start, endDate: v.end })}
                      onDone={() => setOpenRow(null)}
                    />
                  </div>
                )}
              </div>
            ))}
            <p className="text-xs text-gray-500">
              Range 1 is required; ranges 2 and 3 are optional. Crossed-out days are already under
              maintenance, taken by another range here, or outside the selected availability. Each
              range is saved as its own record.
            </p>
          </div>
        )}
        <Input
          label="Reason / remarks"
          placeholder="e.g. HOUSEKEEPING, BUFFER, UPGRADING"
          maxLength={40}
          value={form.remarks}
          onChange={e => setForm(f => ({ ...f, remarks: e.target.value.toUpperCase() }))}
          required
        />
        <p className="text-xs text-gray-500">
          {record
            ? 'The unit is withdrawn from the booking pool for every day in this range — availability for its apartment type drops by one per day.'
            : 'The reason applies to every range above. The unit is withdrawn from the booking pool for every day in those ranges — availability for its apartment type drops by one per day.'}
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!canSave}>
          {record ? 'Save changes' : 'Add maintenance'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

function AvailabilityModal({ record, onClose }: { record: ResortMaintenance | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['resort-maintenance-availability', record?.id],
    queryFn: () => resortMaintenanceApi.availability(record!.id).then(r => r.data),
    enabled: !!record,
  });

  return (
    <Modal open={!!record} title="Availability During Maintenance" onClose={onClose} size="lg">
      {record && (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            <span className="font-mono font-medium text-gray-800">{record.resortCode}</span>
            {' · unit '}<span className="font-mono font-medium text-gray-800">{record.unitNo}</span>
            {' · type '}<span className="font-medium text-gray-800">{record.apartmentType ?? '—'}</span>
            {' · '}{dateOnly(record.startDate)} to {dateOnly(record.endDate)}
          </div>
          <p className="text-xs text-gray-500">
            Availability is tracked per apartment type (aggregated across all units of that type).
            Act = units of this type registered that day; Bal = act minus maintenance minus bookings.
          </p>
          {isLoading ? <PageSpinner /> : (
            data && data.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                {data.apartmentType ? 'No availability rows for this range.' : 'This unit has no apartment type mapped.'}
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

export function ResortsMaintenance() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const resortCode = searchParams.get('resort') ?? '';
  const year = searchParams.get('year') ?? '';
  const month = searchParams.get('month') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; record: ResortMaintenance | null }>({ open: false, record: null });
  const [viewRecord, setViewRecord] = useState<ResortMaintenance | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResortMaintenance | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const setParams = (next: { q?: string; resort?: string; year?: string; month?: string; page?: number }) => {
    const p: Record<string, string> = {};
    const nq = next.q ?? q;
    const nr = next.resort ?? resortCode;
    const ny = next.year ?? year;
    // Month is only meaningful with a year — drop it when the year is cleared
    const nm = ny ? (next.month ?? month) : '';
    const np = next.page ?? 1;
    if (nq) p.q = nq;
    if (nr) p.resort = nr;
    if (ny) p.year = ny;
    if (nm) p.month = nm;
    if (np > 1) p.page = String(np);
    setSearchParams(p, { replace: true });
  };

  // The page lands EMPTY, like fn 5 — 10,904 records is not a useful first screen and
  // staff work one resort at a time. Nothing is fetched until a resort is picked.
  const { data: list, isLoading } = useQuery({
    queryKey: ['resort-maintenance', q, resortCode, year, month, page],
    queryFn: () => resortMaintenanceApi.list({
      q: q || undefined,
      resortCode,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      page,
      pageSize: PAGE_SIZE,
    }).then(r => r.data),
    enabled: !!resortCode,
  });

  // Active resorts only (see useActiveResorts)
  const { resorts } = useActiveResorts();

  const { data: years } = useQuery({
    queryKey: ['resort-maintenance-years'],
    queryFn: () => resortMaintenanceApi.years().then(r => r.data.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => resortMaintenanceApi.remove(id),
    onSuccess: (_res, id) => {
      const gone = list?.data.find(m => m.id === id);
      qc.invalidateQueries({ queryKey: ['resort-maintenance'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      setDeleteTarget(null);
      if (gone) setResult(`Maintenance record deleted — ${describe(gone)}. The unit is back in the booking pool for those dates.`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams({ q: searchInput.trim(), page: 1 });
  };

  const clearSearch = () => { setSearchInput(''); setParams({ q: '', resort: '', year: '', month: '', page: 1 }); };

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <div className="mt-1 flex items-center gap-8">
          <h1 className="text-xl font-semibold text-gray-900">6. Resorts Unit Under Maintenance</h1>
          <Button size="sm" onClick={() => setChartOpen(true)}>
            <CalendarRange className="h-4 w-4" /> Resorts Availability
          </Button>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Units blocked for housekeeping, buffer or other reasons — not available for booking.
          {year && (
            <span className="text-gray-700">
              {' '}Showing units under maintenance at any point during{' '}
              <span className="font-medium">
                {month ? `${MONTHS[Number(month) - 1]} ` : ''}{year}
              </span>.
            </span>
          )}
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={doSearch} className="flex flex-wrap items-center gap-2">
            <div className="w-48">
              <Select value={resortCode} onChange={e => setParams({ resort: e.target.value, page: 1 })}>
                <option value="">Select resort...</option>
                {resorts?.map(r => (
                  <option key={r.id} value={r.resortCode}>{r.resortCode} — {r.shortName ?? r.resortName}</option>
                ))}
              </Select>
            </div>
            <div className="w-32">
              <Select value={year} onChange={e => setParams({ year: e.target.value, page: 1 })} title="Under maintenance in this year">
                <option value="">All years</option>
                {years?.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <div className="w-36">
              <Select
                value={month}
                onChange={e => setParams({ month: e.target.value, page: 1 })}
                disabled={!year}
                title={year ? 'Under maintenance in this month' : 'Pick a year first'}
              >
                <option value="">All months</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </Select>
            </div>
            <div className="w-56">
              <Input
                placeholder="Search unit no / resort / type / reason"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
            {(q || resortCode || year) && <Button type="button" size="sm" variant="secondary" onClick={clearSearch}>Clear</Button>}
          </form>
          {canCreate('RESORTS_SETUP') && (
            <Button size="sm" onClick={() => setModal({ open: true, record: null })}><Plus className="h-4 w-4" /> Add maintenance</Button>
          )}
        </CardHeader>

        {resortCode && !isLoading && (
          <div className="border-b bg-gray-50/60 px-4 py-2">
            <RecordCount total={list?.total} />
          </div>
        )}

        {!resortCode ? (
          <p className="px-4 py-12 text-center text-sm text-gray-400">
            Select a resort to view its maintenance records.
          </p>
        ) : isLoading ? <PageSpinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Resort</th>
                    <th className="px-4 py-3 text-left">Resort Name</th>
                    <th className="px-4 py-3 text-left">Apartment Type</th>
                    <th className="px-4 py-3 text-left">Unit No</th>
                    <th className="px-4 py-3 text-left">Start Date</th>
                    <th className="px-4 py-3 text-left">End Date</th>
                    <th className="px-4 py-3 text-left">Reason</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list?.data.map(m => (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono">{m.resortCode}</td>
                      <td className="px-4 py-2.5">{m.resort.resortName}</td>
                      <td className="px-4 py-2.5">{m.apartmentType ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-medium">{m.unitNo}</td>
                      <td className="px-4 py-2.5 font-mono">{dateOnly(m.startDate)}</td>
                      <td className="px-4 py-2.5 font-mono">{dateOnly(m.endDate)}</td>
                      <td className="px-4 py-2.5 text-gray-600">{m.remarks ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setViewRecord(m)} title="View availability for this range"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {canEdit('RESORTS_SETUP') && (
                            <button onClick={() => setModal({ open: true, record: m })} title="Edit"
                              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete('RESORTS_SETUP') && (
                            <button
                              onClick={() => { setDelErr(''); setDeleteTarget(m); }}
                              title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {list?.data.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No maintenance records found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {list && (
              <Pagination
                page={list.page}
                pages={pages}
                total={list.total}
                limit={list.pageSize}
                onPage={p => setParams({ page: p })}
              />
            )}
          </>
        )}
      </Card>

      <MaintenanceFormModal
        open={modal.open}
        record={modal.record}
        resorts={resorts ?? []}
        onClose={() => setModal({ open: false, record: null })}
        onSaved={(saved, mode) => setResult(savedMessage(saved, mode))}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <AvailabilityModal record={viewRecord} onClose={() => setViewRecord(null)} />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete maintenance record?"
        description="This permanently deletes the record and returns the unit to the booking pool for those dates. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'Resort',      value: <><span className="font-mono font-medium">{deleteTarget.resortCode}</span> — {deleteTarget.resort.resortName}</> },
          { label: 'Unit / Type', value: <><span className="font-mono font-medium">{deleteTarget.unitNo}</span> · {deleteTarget.apartmentType ?? '—'}</> },
          { label: 'Dates',       value: <><span className="font-mono">{dateOnly(deleteTarget.startDate)}</span> to <span className="font-mono">{dateOnly(deleteTarget.endDate)}</span></> },
          { label: 'Reason',      value: deleteTarget.remarks ?? '—' },
        ] : []}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete record"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />

      <DraggableWindow open={chartOpen} title="Resort Availability" onClose={() => setChartOpen(false)} width={960}>
        <ResortAvailabilityChart />
      </DraggableWindow>
    </div>
  );
}
