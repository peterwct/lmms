import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search, Eye, CalendarRange } from 'lucide-react';
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
import { Pagination } from '../../components/ui/Pagination';
import { ResortAvailabilityChart } from '../../components/ResortAvailabilityChart';
import type { ApartmentType, AptBlock, Resort } from '../../types';

const PAGE_SIZE = 50;

const EMPTY_FORM = { resortCode: '', apartmentType: '', unitNo: '', startDate: '', endDate: '' };

// Stored dates are UTC midnight — show the calendar date, and feed <input type="date"> a YYYY-MM-DD value
const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : '');

// One-line record description, shared by every confirmation message on this page
const describe = (b: AptBlock) =>
  `${b.resortCode} unit ${b.unitNo}${b.apartmentType ? ` (${b.apartmentType})` : ''}, ` +
  `${dateOnly(b.startDate)} to ${dateOnly(b.endDate)}`;

interface ModalProps {
  open: boolean;
  block: AptBlock | null;   // null = add mode
  resorts: Resort[];
  apartmentTypes: ApartmentType[];
  onClose: () => void;
  onSaved: (saved: AptBlock, mode: 'add' | 'edit') => void;
}

function AptBlockFormModal({ open, block, resorts, apartmentTypes, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(block ? {
      resortCode: block.resortCode,
      apartmentType: block.apartmentType ?? '',
      unitNo: block.unitNo,
      startDate: dateOnly(block.startDate),
      endDate: dateOnly(block.endDate),
    } : { ...EMPTY_FORM });
  }, [open, block]);

  // Apartment types set up for the chosen resort
  const typeOptions = apartmentTypes.filter(a => a.resortCode === form.resortCode);

  // Units for the chosen resort (add mode only) — filtered to the chosen apartment type
  const { data: units } = useQuery({
    queryKey: ['resort-units', 'for-block', form.resortCode],
    queryFn: () => resortUnitsApi.list({ resortCode: form.resortCode, pageSize: 200 }).then(r => r.data.data),
    enabled: open && !block && !!form.resortCode,
  });
  const unitOptions = (units ?? []).filter(u => u.apartmentType === form.apartmentType);

  const saveMut = useMutation({
    mutationFn: () => {
      if (block) {
        return aptBlocksApi.update(block.id, { startDate: form.startDate, endDate: form.endDate });
      }
      return aptBlocksApi.create({
        resortCode: form.resortCode,
        apartmentType: form.apartmentType,
        unitNo: form.unitNo,
        startDate: form.startDate,
        endDate: form.endDate,
      });
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['apt-blocks'] });
      qc.invalidateQueries({ queryKey: ['availability-chart'] });
      onSaved(res.data.data, block ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const datesValid = form.startDate !== '' && form.endDate !== '' && form.startDate <= form.endDate;
  const canSave = block
    ? datesValid
    : !!form.resortCode && !!form.apartmentType && !!form.unitNo && datesValid;

  return (
    <Modal open={open} title={block ? 'Edit Availability Block' : 'Add Availability Block'} onClose={onClose}>
      <div className="space-y-3">
        {block ? (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Resort</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">{block.resortCode}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apartment type</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-800">{block.apartmentType ?? '—'}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">{block.unitNo}</div>
            </div>
          </div>
        ) : (
          <>
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
        <p className="text-xs text-gray-500">
          Availability is generated one row per day from start to end date for this unit's apartment type.
        </p>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!canSave}>
          {block ? 'Save changes' : 'Add block'}
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
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const resortCode = searchParams.get('resort') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; block: AptBlock | null }>({ open: false, block: null });
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

  const { data: list, isLoading } = useQuery({
    queryKey: ['apt-blocks', q, resortCode, page],
    queryFn: () => aptBlocksApi.list({
      q: q || undefined,
      resortCode: resortCode || undefined,
      page,
      pageSize: PAGE_SIZE,
    }).then(r => r.data),
  });

  // Active resorts only (see useActiveResorts)
  const { resorts } = useActiveResorts();

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
      if (gone) setResult(`Availability block deleted — ${describe(gone)}. Its generated daily availability has been removed.`);
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
          <h1 className="text-xl font-semibold text-gray-900">Units Availability Maintenance and Setup by Dates</h1>
          <Button size="sm" onClick={() => setChartOpen(true)}>
            <CalendarRange className="h-4 w-4" /> Resorts Availability
          </Button>
        </div>
        <p className="mt-1 text-sm text-gray-500">Availability blocks per unit and date range.</p>
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
            <Button size="sm" onClick={() => setModal({ open: true, block: null })}><Plus className="h-4 w-4" /> Add block</Button>
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
                          {canEdit('RESORTS_SETUP') && (
                            <button onClick={() => setModal({ open: true, block: b })} title="Edit"
                              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
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
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No availability blocks found</td></tr>
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
        open={modal.open}
        block={modal.block}
        resorts={resorts ?? []}
        apartmentTypes={apartmentTypes ?? []}
        onClose={() => setModal({ open: false, block: null })}
        onSaved={(b, mode) => setResult(
          mode === 'add'
            ? `Availability block added — ${describe(b)}. Daily availability has been generated for that range.`
            : `Availability block updated — ${describe(b)}. Daily availability has been re-synced.`
        )}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <AvailabilityModal block={viewBlock} onClose={() => setViewBlock(null)} />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete availability block?"
        description="This permanently deletes the block and removes the daily availability it generated. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'Resort',      value: <><span className="font-mono font-medium">{deleteTarget.resortCode}</span> — {deleteTarget.resort.resortName}</> },
          { label: 'Unit / Type', value: <><span className="font-mono font-medium">{deleteTarget.unitNo}</span> · {deleteTarget.apartmentType ?? '—'}</> },
          { label: 'Dates',       value: <><span className="font-mono">{dateOnly(deleteTarget.startDate)}</span> to <span className="font-mono">{dateOnly(deleteTarget.endDate)}</span></> },
        ] : []}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete block"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />

      <DraggableWindow open={chartOpen} title="Resort Availability" onClose={() => setChartOpen(false)} width={960}>
        <ResortAvailabilityChart />
      </DraggableWindow>
    </div>
  );
}
