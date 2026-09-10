import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Trash2, Search, Eye, CalendarRange, Layers } from 'lucide-react';
import { apartmentTypesApi, aptBlocksApi, resortUnitsApi } from '../../api/resorts';
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
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { RecordCount } from '../../components/ui/RecordCount';
import { Pagination } from '../../components/ui/Pagination';
import { ResortAvailabilityChart } from '../../components/ResortAvailabilityChart';
import type { ApartmentType, AptBlock, MarBatchResult, Resort } from '../../types';

const PAGE_SIZE = 50;

const EMPTY_FORM = { resortCode: '', apartmentType: '', unitNo: '', startDate: '', endDate: '' };

// Our own products. Their resorts have real, individually-numbered apartments, so they are set up
// one unit at a time through Add availability. MAR (Make Available Resorts) resorts allocate N
// interchangeable units of a sleep type for a period, numbered "N-occupancy", and go through the
// batch form instead. The server enforces the same split.
//
// MAR is identified by `Resort.mar === 'Y'` (the fn 2 flag), NOT by "not one of our coCodes" —
// see marResorts below. OWN_CO_CODES still gates the own-product half.
const OWN_CO_CODES = ['03', '15', '02'];

const MAR_MAX_UNITS = 200;
const MAR_EMPTY_FORM = { resortCode: '', apartmentType: '', unitCount: '', occupancy: '', startDate: '', endDate: '' };

// Stored dates are UTC midnight — show the calendar date, and feed <input type="date"> a YYYY-MM-DD value
const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : '');

// One-line record description, shared by every confirmation message on this page
const describe = (b: AptBlock) =>
  `${b.resortCode} unit ${b.unitNo}${b.apartmentType ? ` (${b.apartmentType})` : ''}, ` +
  `${dateOnly(b.startDate)} to ${dateOnly(b.endDate)}`;

// Availability is ADD-ONLY (2026-08-14, business decision). A record cannot be edited —
// correcting one means deleting it and adding it again, so the grid deltas and the fn 6
// maintenance guards only ever see whole records appear or disappear.
interface ModalProps {
  open: boolean;
  resorts: Resort[];
  apartmentTypes: ApartmentType[];
  onClose: () => void;
  onSaved: (saved: AptBlock) => void;
}

function AptBlockFormModal({ open, resorts, apartmentTypes, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({ ...EMPTY_FORM });
  }, [open]);

  // Apartment types set up for the chosen resort
  const typeOptions = apartmentTypes.filter(a => a.resortCode === form.resortCode);

  // Units for the chosen resort — filtered to the chosen apartment type
  const { data: units } = useQuery({
    queryKey: ['resort-units', 'for-block', form.resortCode],
    queryFn: () => resortUnitsApi.list({ resortCode: form.resortCode, pageSize: 200 }).then(r => r.data.data),
    enabled: open && !!form.resortCode,
  });
  const unitOptions = (units ?? []).filter(u => u.apartmentType === form.apartmentType);

  const saveMut = useMutation({
    mutationFn: () => aptBlocksApi.create({
      resortCode: form.resortCode,
      apartmentType: form.apartmentType,
      unitNo: form.unitNo,
      startDate: form.startDate,
      endDate: form.endDate,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['apt-blocks'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      onSaved(res.data.data);
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const datesValid = form.startDate !== '' && form.endDate !== '' && form.startDate <= form.endDate;
  const canSave = !!form.resortCode && !!form.apartmentType && !!form.unitNo && datesValid;

  return (
    <Modal open={open} title="Add Availability Record" onClose={onClose}>
      <div className="space-y-3">
        <Select
          label="Resort"
          value={form.resortCode}
          onChange={e => setForm(f => ({ ...f, resortCode: e.target.value, apartmentType: '', unitNo: '' }))}
          required
        >
          <option value="">Select resort...</option>
          {resorts.map(r => (
            <option key={r.id} value={r.resortCode}>{r.resortCode} — {r.resortName}</option>
          ))}
        </Select>
        <Select
          label="Apartment type"
          value={form.apartmentType}
          onChange={e => setForm(f => ({ ...f, apartmentType: e.target.value, unitNo: '' }))}
          disabled={!form.resortCode}
          required
        >
          <option value="">Select apartment type...</option>
          {typeOptions.map(a => (
            <option key={a.id} value={a.apartmentType}>
              {a.apartmentType}{a.description ? ` — ${a.description}` : ''}
            </option>
          ))}
        </Select>
        {form.resortCode && typeOptions.length === 0 && (
          <p className="text-xs text-amber-600 -mt-2">
            No apartment types set up for this resort — add them in Apartment Sleep Types Maintenance and Setup first.
          </p>
        )}
        <Select
          label="Unit no"
          value={form.unitNo}
          onChange={e => setForm(f => ({ ...f, unitNo: e.target.value }))}
          disabled={!form.apartmentType}
          required
        >
          <option value="">Select unit...</option>
          {unitOptions.map(u => (
            <option key={u.id} value={u.unitNo}>{u.unitNo}</option>
          ))}
        </Select>
        {form.apartmentType && unitOptions.length === 0 && (
          <p className="text-xs text-amber-600 -mt-2">
            No units of this type set up for this resort — add them in Apartment&apos;s Unit No. Maintenance and Setup first.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
            required
          />
          <Input
            label="End date"
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
            required
          />
        </div>
        {form.startDate !== '' && form.endDate !== '' && form.startDate > form.endDate && (
          <p className="text-xs text-red-600 -mt-1">End date must be on or after start date.</p>
        )}
        <p className="text-xs text-gray-500">
          Availability is generated one row per day from start to end date for this unit's apartment type.
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!canSave}>
          Add availability
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

// MAR batch: key the unit COUNT instead of picking units. The system generates the unit numbers
// "1-occupancy .. N-occupancy", creates the ones that don't exist yet, and gives every one of them
// an availability record over the same date range — all-or-nothing. Numbering restarts at 1 each
// run, so a second run for the same resort + type reuses the units already registered and only
// adds the new dates.
function MarBatchFormModal({
  open, resorts, apartmentTypes, onClose, onSaved,
}: {
  open: boolean;
  resorts: Resort[];
  apartmentTypes: ApartmentType[];
  onClose: () => void;
  onSaved: (saved: MarBatchResult) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...MAR_EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({ ...MAR_EMPTY_FORM });
  }, [open]);

  const typeOptions = apartmentTypes.filter(a => a.resortCode === form.resortCode);

  const unitCount = parseInt(form.unitCount, 10);
  const occupancy = parseInt(form.occupancy, 10);
  const countValid = Number.isInteger(unitCount) && unitCount >= 1 && unitCount <= MAR_MAX_UNITS;
  const occValid = Number.isInteger(occupancy) && occupancy >= 1 && occupancy <= 20;

  // Show staff the generated numbers before they save
  const preview = countValid && occValid
    ? (unitCount <= 4
        ? Array.from({ length: unitCount }, (_, i) => `${i + 1}-${occupancy}`).join(', ')
        : `1-${occupancy}, 2-${occupancy}, ... ${unitCount}-${occupancy}`)
    : '';

  const saveMut = useMutation({
    mutationFn: () => aptBlocksApi.batch({
      resortCode: form.resortCode,
      apartmentType: form.apartmentType,
      unitCount,
      occupancy,
      startDate: form.startDate,
      endDate: form.endDate,
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['apt-blocks'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      qc.invalidateQueries({ queryKey: ['resort-units'] }); // units may have been created
      onSaved(res.data.data);
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const datesValid = form.startDate !== '' && form.endDate !== '' && form.startDate <= form.endDate;
  const canSave = !!form.resortCode && !!form.apartmentType && countValid && occValid && datesValid;

  return (
    <Modal open={open} title="Add MAR Availability (batch)" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          For Make Available Resorts (exchange partners). Units are generated as
          {' '}<span className="font-mono">1-occupancy</span>, <span className="font-mono">2-occupancy</span>, ...
          {' '}and each gets one availability record over the dates below.
        </p>
        <Select
          label="Resort"
          value={form.resortCode}
          onChange={e => setForm(f => ({ ...f, resortCode: e.target.value, apartmentType: '' }))}
          required
        >
          <option value="">Select resort...</option>
          {resorts.map(r => (
            <option key={r.id} value={r.resortCode}>{r.resortCode} — {r.resortName}</option>
          ))}
        </Select>
        <Select
          label="Apartment type"
          value={form.apartmentType}
          onChange={e => setForm(f => ({ ...f, apartmentType: e.target.value }))}
          disabled={!form.resortCode}
          required
        >
          <option value="">Select apartment type...</option>
          {typeOptions.map(a => (
            <option key={a.id} value={a.apartmentType}>
              {a.apartmentType}{a.description ? ` — ${a.description}` : ''}
            </option>
          ))}
        </Select>
        {form.resortCode && typeOptions.length === 0 && (
          <p className="text-xs text-amber-600 -mt-2">
            No apartment types set up for this resort — add them in Apartment Sleep Types Maintenance and Setup first.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Number of units required"
            type="number"
            min={1}
            max={MAR_MAX_UNITS}
            value={form.unitCount}
            onChange={e => setForm(f => ({ ...f, unitCount: e.target.value }))}
            required
          />
          <Input
            label="Occupancy"
            type="number"
            min={1}
            max={20}
            value={form.occupancy}
            onChange={e => setForm(f => ({ ...f, occupancy: e.target.value }))}
            required
          />
        </div>
        {preview && (
          <p className="text-xs text-gray-600 -mt-1">
            Units to set up: <span className="font-mono font-medium">{preview}</span> ({unitCount} unit{unitCount === 1 ? '' : 's'})
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Start date"
            type="date"
            value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
            required
          />
          <Input
            label="End date"
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
            required
          />
        </div>
        {form.startDate !== '' && form.endDate !== '' && form.startDate > form.endDate && (
          <p className="text-xs text-red-600 -mt-1">End date must be on or after start date.</p>
        )}
        <p className="text-xs text-gray-500">
          Unit numbers already registered for this apartment type are reused — only their availability
          is added. The whole batch is saved together, or not at all.
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!canSave}>
          Add MAR availability
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

function AvailabilityModal({ block, onClose }: { block: AptBlock | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['apt-block-availability', block?.id],
    queryFn: () => aptBlocksApi.availability(block!.id).then(r => r.data),
    enabled: !!block,
  });

  return (
    <Modal open={!!block} title="Generated Availability" onClose={onClose} size="lg">
      {block && (
        <div className="space-y-3">
          <div className="text-sm text-gray-600">
            <span className="font-mono font-medium text-gray-800">{block.resortCode}</span>
            {' · unit '}<span className="font-mono font-medium text-gray-800">{block.unitNo}</span>
            {' · type '}<span className="font-medium text-gray-800">{block.apartmentType ?? '—'}</span>
            {' · '}{dateOnly(block.startDate)} to {dateOnly(block.endDate)}
          </div>
          <p className="text-xs text-gray-500">
            Availability is tracked per apartment type (aggregated across all units of that type).
            Act = units of this type available that day; Bal = act minus bookings.
          </p>
          {isLoading ? <PageSpinner /> : (
            data && data.data.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-400">
                {data.apartmentType ? 'No availability rows for this range.' : 'This block has no apartment type mapped.'}
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

export function UnitsAvailability() {
  const { canCreate, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const resortCode = searchParams.get('resort') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const [searchInput, setSearchInput] = useState(q);

  const [addOpen, setAddOpen] = useState(false);
  const [marOpen, setMarOpen] = useState(false);
  const [viewBlock, setViewBlock] = useState<AptBlock | null>(null);
  const [chartOpen, setChartOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AptBlock | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const setParams = (next: { q?: string; resort?: string; page?: number }) => {
    const p: Record<string, string> = {};
    const nq = next.q ?? q;
    const nr = next.resort ?? resortCode;
    const np = next.page ?? 1;
    if (nq) p.q = nq;
    if (nr) p.resort = nr;
    if (np > 1) p.page = String(np);
    setSearchParams(p, { replace: true });
  };

  // The page lands EMPTY — 5,162 records across 12 resorts is not a useful first screen,
  // and staff always work one resort at a time. Nothing is fetched until a resort is picked.
  const { data: list, isLoading } = useQuery({
    queryKey: ['apt-blocks', q, resortCode, page],
    queryFn: () => aptBlocksApi.list({
      q: q || undefined,
      resortCode,
      page,
      pageSize: PAGE_SIZE,
    }).then(r => r.data),
    enabled: !!resortCode,
  });

  // Active resorts only (see useActiveResorts). The two Add forms take opposite halves of the
  // list; the filter above deliberately keeps the whole of it so MAR records stay viewable.
  const { resorts } = useActiveResorts();
  const ownResorts = useMemo(() => resorts.filter(r => OWN_CO_CODES.includes(r.coCode)), [resorts]);
  // MAR is now an explicit flag on the resort (fn 2), not "everything that isn't ours" —
  // being a partner resort no longer implies it is made available to our members.
  //
  // Own products are excluded even when flagged MAR: their resorts have real, individually
  // numbered apartments (A1, 3227/3228), so a generated "N-occupancy" batch is meaningless for
  // them and createAptBlockBatch rejects it 400. Without this the picker would offer a choice
  // that always fails — V-ABC1 (coCode 03) is flagged MAR today and would do exactly that.
  const marResorts = useMemo(
    () => resorts.filter(r => r.mar === 'Y' && !OWN_CO_CODES.includes(r.coCode)),
    [resorts],
  );

  const { data: apartmentTypes } = useQuery({
    queryKey: ['apartment-types', ''],
    queryFn: () => apartmentTypesApi.list().then(r => r.data.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => aptBlocksApi.remove(id),
    onSuccess: (_res, id) => {
      const gone = list?.data.find(b => b.id === id);
      qc.invalidateQueries({ queryKey: ['apt-blocks'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      setDeleteTarget(null);
      if (gone) setResult(`Availability deleted — ${describe(gone)}. Its generated daily availability has been removed.`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams({ q: searchInput.trim(), page: 1 });
  };

  const clearSearch = () => { setSearchInput(''); setParams({ q: '', resort: '', page: 1 }); };

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <div className="mt-1 flex items-center gap-8">
          <h1 className="text-xl font-semibold text-gray-900">5. Resorts Unit Availability/Inventory Setup</h1>
          <Button size="sm" onClick={() => setChartOpen(true)}>
            <CalendarRange className="h-4 w-4" /> Resorts Availability
          </Button>
        </div>
        <p className="mt-1 text-sm text-gray-500">
          Availability records per unit and date range. Records are add-only — to correct one, delete it
          and add it again.
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
            <div className="w-64">
              <Input
                placeholder="Search unit no / resort / type"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
            {(q || resortCode) && <Button type="button" size="sm" variant="secondary" onClick={clearSearch}>Clear</Button>}
          </form>
          {canCreate('RESORTS_SETUP') && (
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add availability</Button>
              {marResorts.length > 0 && (
                <Button size="sm" variant="secondary" onClick={() => setMarOpen(true)}>
                  <Layers className="h-4 w-4" /> Add MAR availability
                </Button>
              )}
            </div>
          )}
        </CardHeader>

        {resortCode && !isLoading && (
          <div className="border-b bg-gray-50/60 px-4 py-2">
            <RecordCount total={list?.total} />
          </div>
        )}

        {!resortCode ? (
          <p className="px-4 py-12 text-center text-sm text-gray-400">
            Select a resort to view its availability records.
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
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list?.data.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono">{b.resortCode}</td>
                      <td className="px-4 py-2.5">{b.resort.resortName}</td>
                      <td className="px-4 py-2.5">{b.apartmentType ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono font-medium">{b.unitNo}</td>
                      <td className="px-4 py-2.5 font-mono">{dateOnly(b.startDate)}</td>
                      <td className="px-4 py-2.5 font-mono">{dateOnly(b.endDate)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setViewBlock(b)} title="View generated availability"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {canDelete('RESORTS_SETUP') && (
                            <button
                              onClick={() => { setDelErr(''); setDeleteTarget(b); }}
                              title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {list?.data.length === 0 && (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No availability records found</td></tr>
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

      <AptBlockFormModal
        open={addOpen}
        resorts={ownResorts}
        apartmentTypes={apartmentTypes ?? []}
        onClose={() => setAddOpen(false)}
        onSaved={b => setResult(
          `Availability added — ${describe(b)}. Daily availability has been generated for that range.`
        )}
      />

      <MarBatchFormModal
        open={marOpen}
        resorts={marResorts}
        apartmentTypes={apartmentTypes ?? []}
        onClose={() => setMarOpen(false)}
        onSaved={r => setResult(
          `MAR availability added — ${r.resortCode} ${r.apartmentType}, ${r.blocksCreated} unit(s) ` +
          `(${r.unitNos[0]} to ${r.unitNos[r.unitNos.length - 1]}; ${r.unitsCreated} new, ${r.unitsReused} existing), ` +
          `${r.startDate} to ${r.endDate}. Daily availability has been generated for ${r.days} day(s).`
        )}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <AvailabilityModal block={viewBlock} onClose={() => setViewBlock(null)} />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete availability record?"
        description="This permanently deletes the record and removes the daily availability it generated. It is refused if the unit has any maintenance record within these dates. Records cannot be edited, so correcting one means deleting and re-adding it. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'Resort',      value: <><span className="font-mono font-medium">{deleteTarget.resortCode}</span> — {deleteTarget.resort.resortName}</> },
          { label: 'Unit / Type', value: <><span className="font-mono font-medium">{deleteTarget.unitNo}</span> · {deleteTarget.apartmentType ?? '—'}</> },
          { label: 'Dates',       value: <><span className="font-mono">{dateOnly(deleteTarget.startDate)}</span> to <span className="font-mono">{dateOnly(deleteTarget.endDate)}</span></> },
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
