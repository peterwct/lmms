import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search, Eye, CalendarRange } from 'lucide-react';
import { resortMaintenanceApi, resortUnitsApi, resortsApi } from '../../api/resorts';
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
import { Pagination } from '../../components/ui/Pagination';
import { ResortAvailabilityChart } from '../../components/ResortAvailabilityChart';
import type { Resort, ResortMaintenance } from '../../types';

const PAGE_SIZE = 50;

const EMPTY_FORM = { resortCode: '', unitNo: '', startDate: '', endDate: '', remarks: '' };

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Stored dates are UTC midnight — show the calendar date, and feed <input type="date"> a YYYY-MM-DD value
const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : '');

// One-line record description, shared by every confirmation message on this page
const describe = (m: ResortMaintenance) =>
  `${m.resortCode} unit ${m.unitNo}${m.apartmentType ? ` (${m.apartmentType})` : ''}, ` +
  `${dateOnly(m.startDate)} to ${dateOnly(m.endDate)}`;

interface ModalProps {
  open: boolean;
  record: ResortMaintenance | null;   // null = add mode
  resorts: Resort[];
  onClose: () => void;
  onSaved: (saved: ResortMaintenance, mode: 'add' | 'edit') => void;
}

function MaintenanceFormModal({ open, record, resorts, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(record ? {
      resortCode: record.resortCode,
      unitNo: record.unitNo,
      startDate: dateOnly(record.startDate),
      endDate: dateOnly(record.endDate),
      remarks: record.remarks ?? '',
    } : { ...EMPTY_FORM });
  }, [open, record]);

  // Units registered for the chosen resort (add mode only) — the apartment type
  // is derived server-side from the picked unit, so it is shown but not chosen.
  const { data: units } = useQuery({
    queryKey: ['resort-units', 'for-maintenance', form.resortCode],
    queryFn: () => resortUnitsApi.list({ resortCode: form.resortCode, pageSize: 200 }).then(r => r.data.data),
    enabled: open && !record && !!form.resortCode,
  });
  const unitOptions = units ?? [];

  const saveMut = useMutation({
    mutationFn: () => {
      const dates = { startDate: form.startDate, endDate: form.endDate, remarks: form.remarks.trim() || null };
      if (record) return resortMaintenanceApi.update(record.id, dates);
      return resortMaintenanceApi.create({ resortCode: form.resortCode, unitNo: form.unitNo, ...dates });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['resort-maintenance'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      qc.invalidateQueries({ queryKey: ['resort-maintenance-years'] });
      onSaved(res.data.data, record ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const datesValid = form.startDate !== '' && form.endDate !== '' && form.startDate <= form.endDate;
  const canSave = record ? datesValid : !!form.resortCode && !!form.unitNo && datesValid;

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
              onChange={e => setForm(f => ({ ...f, resortCode: e.target.value, unitNo: '' }))}
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
              onChange={e => setForm(f => ({ ...f, unitNo: e.target.value }))}
              disabled={!form.resortCode}
              required
            >
              <option value="">Select unit...</option>
              {unitOptions.map(u => (
                <option key={u.id} value={u.unitNo}>{u.unitNo} — {u.apartmentType}</option>
              ))}
            </Select>
            {form.resortCode && unitOptions.length === 0 && (
              <p className="text-xs text-amber-600 -mt-2">
                No units set up for this resort — add them in Apartment's Unit Setup first.
              </p>
            )}
          </>
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
        <Input
          label="Reason / remarks"
          placeholder="e.g. HOUSEKEEPING, BUFFER, UPGRADING"
          maxLength={40}
          value={form.remarks}
          onChange={e => setForm(f => ({ ...f, remarks: e.target.value.toUpperCase() }))}
        />
        <p className="text-xs text-gray-500">
          The unit is withdrawn from the booking pool for every day in this range — availability for
          its apartment type drops by one per day.
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

  const { data: list, isLoading } = useQuery({
    queryKey: ['resort-maintenance', q, resortCode, year, month, page],
    queryFn: () => resortMaintenanceApi.list({
      q: q || undefined,
      resortCode: resortCode || undefined,
      year: year ? Number(year) : undefined,
      month: month ? Number(month) : undefined,
      page,
      pageSize: PAGE_SIZE,
    }).then(r => r.data),
  });

  const { data: resorts } = useQuery({
    queryKey: ['resorts', ''],
    queryFn: () => resortsApi.list().then(r => r.data.data),
  });

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
          <h1 className="text-xl font-semibold text-gray-900">Resorts Maintenance</h1>
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
                <option value="">All resorts</option>
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

        {isLoading ? <PageSpinner /> : (
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
        onSaved={(m, mode) => setResult(
          mode === 'add'
            ? `Maintenance record added — ${describe(m)}. Availability for this apartment type drops by one per day over that range.`
            : `Maintenance record updated — ${describe(m)}.`
        )}
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
