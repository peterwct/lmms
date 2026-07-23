import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { apartmentTypesApi, resortUnitsApi, resortsApi } from '../../api/resorts';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { Pagination } from '../../components/ui/Pagination';
import { ProductBadge } from '../../components/ProductBadge';
import type { ApartmentType, Resort, ResortUnit } from '../../types';

const PAGE_SIZE = 50;

const EMPTY_FORM = { resortCode: '', unitNo: '', apartmentType: '', occupancy: '', rciReserved: 'N' };

interface ModalProps {
  open: boolean;
  unit: ResortUnit | null;   // null = add mode
  resorts: Resort[];
  apartmentTypes: ApartmentType[];
  onClose: () => void;
  onCreated: (unit: ResortUnit) => void;   // add mode only — lets the list focus the new unit
}

function ResortUnitFormModal({ open, unit, resorts, apartmentTypes, onClose, onCreated }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(unit ? {
      resortCode: unit.resortCode,
      unitNo: unit.unitNo,
      apartmentType: unit.apartmentType,
      occupancy: unit.occupancy != null ? String(unit.occupancy) : '',
      rciReserved: unit.rciReserved,
    } : { ...EMPTY_FORM });
  }, [open, unit]);

  // Only apartment types set up for the selected resort are offered
  const typeOptions = apartmentTypes.filter(a => a.resortCode === form.resortCode);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        unitNo: form.unitNo,
        apartmentType: form.apartmentType,
        occupancy: form.occupancy === '' ? null : Number(form.occupancy),
        rciReserved: form.rciReserved,
      };
      return unit
        ? resortUnitsApi.update(unit.id, payload)
        : resortUnitsApi.create({ resortCode: form.resortCode, ...payload });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['resort-units'] });
      if (!unit) onCreated(r.data.data);
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  // auto-uppercase text inputs (project convention)
  const setU = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value.toUpperCase() }));

  return (
    <Modal open={open} title={unit ? 'Edit Unit' : 'Add Unit'} onClose={onClose}>
      <div className="space-y-3">
        {unit ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resort</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">
              {unit.resortCode} — {unit.resort.resortName}
            </div>
          </div>
        ) : (
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
        )}
        <Input label="Unit no" value={form.unitNo} onChange={setU('unitNo')} maxLength={10} required />
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
            No apartment types set up for this resort — add them in Apartment Types Setup first.
          </p>
        )}
        <Input
          label="Occupancy"
          type="number"
          min={1}
          max={20}
          value={form.occupancy}
          onChange={e => setForm(f => ({ ...f, occupancy: e.target.value }))}
        />
        <label className="flex items-center gap-1.5 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.rciReserved === 'Y'}
            onChange={e => setForm(f => ({ ...f, rciReserved: e.target.checked ? 'Y' : 'N' }))}
            className="rounded border-gray-300"
          />
          RCI Reserved
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button
          onClick={() => saveMut.mutate()}
          loading={saveMut.isPending}
          disabled={!form.resortCode || !form.unitNo.trim() || !form.apartmentType}
        >
          {unit ? 'Save changes' : 'Add unit'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function ResortUnits() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const resortCode = searchParams.get('resort') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; unit: ResortUnit | null }>({ open: false, unit: null });

  const setParams = (next: { q?: string; resort?: string; page?: number }) => {
    const p: Record<string, string> = {};
    const nq = next.q ?? q;
    const nr = next.resort ?? resortCode;
    const np = next.page ?? 1;   // any filter change resets to page 1
    if (nq) p.q = nq;
    if (nr) p.resort = nr;
    if (np > 1) p.page = String(np);
    setSearchParams(p, { replace: true });
  };

  const { data: list, isLoading } = useQuery({
    queryKey: ['resort-units', q, resortCode, page],
    queryFn: () => resortUnitsApi.list({
      q: q || undefined,
      resortCode: resortCode || undefined,
      page,
      pageSize: PAGE_SIZE,
    }).then(r => r.data),
  });

  const { data: resorts } = useQuery({
    queryKey: ['resorts', ''],
    queryFn: () => resortsApi.list().then(r => r.data.data),
  });

  const { data: apartmentTypes } = useQuery({
    queryKey: ['apartment-types', ''],
    queryFn: () => apartmentTypesApi.list().then(r => r.data.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => resortUnitsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resort-units'] }),
  });

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams({ q: searchInput.trim(), page: 1 });
  };

  const clearSearch = () => { setSearchInput(''); setParams({ q: '', resort: '', page: 1 }); };

  // After adding a unit, filter the list to its resort + unit no so it is visible
  // (a plain refetch could leave it on another page)
  const focusCreated = (u: ResortUnit) => {
    setSearchInput(u.unitNo);
    setParams({ q: u.unitNo, resort: u.resortCode, page: 1 });
  };

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">Apartments/Units Setup</h1>
        <p className="mt-1 text-sm text-gray-500">Unit numbers per resort.</p>
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
            <Button size="sm" onClick={() => setModal({ open: true, unit: null })}><Plus className="h-4 w-4" /> Add unit</Button>
          )}
        </CardHeader>

        {isLoading ? <PageSpinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Resort</th>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-left">Resort Name</th>
                    <th className="px-4 py-3 text-left">Unit No</th>
                    <th className="px-4 py-3 text-left">Apartment Type</th>
                    <th className="px-4 py-3 text-right">Occupancy</th>
                    <th className="px-4 py-3 text-left">RCI Reserved</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list?.data.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono">{u.resortCode}</td>
                      <td className="px-4 py-2.5"><ProductBadge coCode={u.resort.coCode} /></td>
                      <td className="px-4 py-2.5">{u.resort.resortName}</td>
                      <td className="px-4 py-2.5 font-mono font-medium">{u.unitNo}</td>
                      <td className="px-4 py-2.5">{u.apartmentType}</td>
                      <td className="px-4 py-2.5 text-right">{u.occupancy ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${u.rciReserved === 'Y' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                          {u.rciReserved === 'Y' ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          {canEdit('RESORTS_SETUP') && (
                            <button onClick={() => setModal({ open: true, unit: u })} title="Edit"
                              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete('RESORTS_SETUP') && (
                            <button
                              onClick={() => { if (window.confirm(`Delete unit ${u.unitNo} of ${u.resortCode}?`)) deleteMut.mutate(u.id); }}
                              title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {list?.data.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No units found</td></tr>
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

      <ResortUnitFormModal
        open={modal.open}
        unit={modal.unit}
        resorts={resorts ?? []}
        apartmentTypes={apartmentTypes ?? []}
        onClose={() => setModal({ open: false, unit: null })}
        onCreated={focusCreated}
      />
    </div>
  );
}
