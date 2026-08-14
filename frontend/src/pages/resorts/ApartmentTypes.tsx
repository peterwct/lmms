import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { apartmentTypesApi } from '../../api/resorts';
import { useActiveResorts } from '../../hooks/useActiveResorts';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { ResultDialog } from '../../components/ui/ResultDialog';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { RecordCount } from '../../components/ui/RecordCount';
import { ProductBadge } from '../../components/ProductBadge';
import type { ApartmentType, Resort } from '../../types';

const LOCK_TYPE_LABELS: Record<string, string> = {
  LM: 'LM — Master Unit',
  LS: 'LS — Split Unit',
  LN: 'LN — Normal Unit',
};

const EMPTY_FORM = { resortCode: '', apartmentType: '', description: '', lockType: 'LN' };

interface ModalProps {
  open: boolean;
  apt: ApartmentType | null;   // null = add mode
  resorts: Resort[];
  onClose: () => void;
  onSaved: (saved: ApartmentType, mode: 'add' | 'edit') => void;
}

function ApartmentTypeFormModal({ open, apt, resorts, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(apt ? {
      resortCode: apt.resortCode,
      apartmentType: apt.apartmentType,
      description: apt.description ?? '',
      lockType: apt.lockType,
    } : { ...EMPTY_FORM });
  }, [open, apt]);

  const selectedResort = resorts.find(r => r.resortCode === form.resortCode);
  // Lock type is only editable for lock-on/lock-off resorts (Resort.lockOnOff = 'Y')
  const lockEditable = selectedResort?.lockOnOff === 'Y';

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        apartmentType: form.apartmentType,
        description: form.description === '' ? null : form.description,
        lockType: form.lockType,
      };
      return apt
        ? apartmentTypesApi.update(apt.id, payload)
        : apartmentTypesApi.create({ resortCode: form.resortCode, ...payload });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['apartment-types'] });
      onSaved(r.data.data, apt ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  // auto-uppercase text inputs (project convention)
  const setU = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value.toUpperCase() }));

  const onResortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const resortCode = e.target.value;
    const resort = resorts.find(r => r.resortCode === resortCode);
    // Non lock-on/lock-off resorts are fixed to LN
    setForm(f => ({ ...f, resortCode, lockType: resort?.lockOnOff === 'Y' ? f.lockType : 'LN' }));
  };

  return (
    <Modal open={open} title={apt ? 'Edit Apartment Type' : 'Add Apartment Type'} onClose={onClose}>
      <div className="space-y-3">
        {apt ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resort</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">
              {apt.resortCode} — {apt.resort.resortName}
            </div>
          </div>
        ) : (
          <Select label="Resort" value={form.resortCode} onChange={onResortChange} required>
            <option value="">Select resort...</option>
            {resorts.map(r => (
              <option key={r.id} value={r.resortCode}>{r.resortCode} — {r.resortName}</option>
            ))}
          </Select>
        )}
        <Input label="Apartment type" value={form.apartmentType} onChange={setU('apartmentType')} maxLength={10} required />
        <Input label="Description" value={form.description} onChange={setU('description')} maxLength={40} />
        <Select
          label="Lock type"
          value={form.lockType}
          onChange={e => setForm(f => ({ ...f, lockType: e.target.value }))}
          disabled={!lockEditable}
        >
          {Object.entries(LOCK_TYPE_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>
        {!lockEditable && (
          <p className="text-xs text-gray-500 -mt-2">
            Lock type is only editable for lock-on/lock-off resorts.
          </p>
        )}
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button
          onClick={() => saveMut.mutate()}
          loading={saveMut.isPending}
          disabled={!form.resortCode || !form.apartmentType.trim()}
        >
          {apt ? 'Save changes' : 'Add apartment type'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function ApartmentTypes() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; apt: ApartmentType | null }>({ open: false, apt: null });
  const [deleteTarget, setDeleteTarget] = useState<ApartmentType | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const { data: types, isLoading } = useQuery({
    queryKey: ['apartment-types', q],
    queryFn: () => apartmentTypesApi.list(q || undefined).then(r => r.data.data),
  });

  // Active resorts only (see useActiveResorts)
  const { resorts } = useActiveResorts();

  const deleteMut = useMutation({
    mutationFn: (id: string) => apartmentTypesApi.remove(id),
    onSuccess: (_res, id) => {
      const gone = types?.find(t => t.id === id);
      qc.invalidateQueries({ queryKey: ['apartment-types'] });
      setDeleteTarget(null);
      if (gone) setResult(`Apartment type deleted — ${gone.apartmentType} of ${gone.resortCode}.`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = searchInput.trim();
    setSearchParams(next ? { q: next } : {}, { replace: true });
  };

  const clearSearch = () => { setSearchInput(''); setSearchParams({}, { replace: true }); };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">3. Apartment Sleep Types Maintenance and Setup</h1>
        <p className="mt-1 text-sm text-gray-500">Apartment types per resort. Active resorts only.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={doSearch} className="flex items-center gap-2">
            <div className="w-72">
              <Input
                placeholder="Search resort code / name / type / description"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
            {q && <Button type="button" size="sm" variant="secondary" onClick={clearSearch}>Clear</Button>}
          </form>
          {canCreate('RESORTS_SETUP') && (
            <Button size="sm" onClick={() => setModal({ open: true, apt: null })}><Plus className="h-4 w-4" /> Add apartment type</Button>
          )}
        </CardHeader>

        {!isLoading && (
          <div className="border-b bg-gray-50/60 px-4 py-2">
            <RecordCount total={types?.length} />
          </div>
        )}

        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Resort</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Resort Name</th>
                  <th className="px-4 py-3 text-left">Apartment Type</th>
                  <th className="px-4 py-3 text-left">Description</th>
                  <th className="px-4 py-3 text-left">Lock Type</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {types?.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono">{t.resortCode}</td>
                    <td className="px-4 py-2.5"><ProductBadge coCode={t.resort.coCode} /></td>
                    <td className="px-4 py-2.5">{t.resort.resortName}</td>
                    <td className="px-4 py-2.5 font-mono font-medium">{t.apartmentType}</td>
                    <td className="px-4 py-2.5">{t.description ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        t.lockType === 'LM' ? 'bg-purple-100 text-purple-700'
                        : t.lockType === 'LS' ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-500'}`}>
                        {LOCK_TYPE_LABELS[t.lockType] ?? t.lockType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {canEdit('RESORTS_SETUP') && (
                          <button onClick={() => setModal({ open: true, apt: t })} title="Edit"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete('RESORTS_SETUP') && (
                          <button
                            onClick={() => { setDelErr(''); setDeleteTarget(t); }}
                            title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {types?.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No apartment types found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ApartmentTypeFormModal
        open={modal.open}
        apt={modal.apt}
        resorts={resorts ?? []}
        onClose={() => setModal({ open: false, apt: null })}
        onSaved={(t, mode) => setResult(
          `Apartment type ${mode === 'add' ? 'added' : 'updated'} — ${t.apartmentType} of ${t.resortCode}` +
          `${t.description ? ` (${t.description})` : ''}.`
        )}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete apartment type?"
        description="This permanently removes the apartment type from the resort. It is refused if any unit, availability record or season points row at this resort still uses it. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'Resort',      value: <><span className="font-mono font-medium">{deleteTarget.resortCode}</span> — {deleteTarget.resort.resortName}</> },
          { label: 'Type',        value: <span className="font-medium">{deleteTarget.apartmentType}</span> },
          { label: 'Description', value: deleteTarget.description ?? '—' },
        ] : []}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete type"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
