import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import { lvcCodesApi, productsApi } from '../../api/resorts';
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
import type { LvcCode, Product } from '../../types';

const STATUS_LABELS: Record<string, string> = { A: 'A — Active', U: 'U — Inactive' };

const EMPTY_FORM = { lvcCode: '', coCode: '', lvcName: '', status: 'A' };

interface ModalProps {
  open: boolean;
  lvc: LvcCode | null;   // null = add mode
  products: Product[];
  onClose: () => void;
  onSaved: (saved: LvcCode, mode: 'add' | 'edit') => void;
}

function LvcCodeFormModal({ open, lvc, products, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(lvc ? {
      lvcCode: lvc.lvcCode,
      coCode:  lvc.coCode ?? '',
      lvcName: lvc.lvcName,
      status:  lvc.status,
    } : { ...EMPTY_FORM });
  }, [open, lvc]);

  const saveMut = useMutation({
    mutationFn: () => {
      // incoming/outgoing/faxBatch are never sent — they belong to the exchange process
      const payload = {
        coCode:  form.coCode === '' ? null : form.coCode,
        lvcName: form.lvcName,
        status:  form.status,
      };
      return lvc
        ? lvcCodesApi.update(lvc.id, payload)
        : lvcCodesApi.create({ lvcCode: form.lvcCode, ...payload });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['lvc-codes'] });
      onSaved(r.data.data, lvc ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  // auto-uppercase text inputs (project convention)
  const setU = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value.toUpperCase() }));

  return (
    <Modal open={open} title={lvc ? 'Edit LVC Code' : 'Add LVC Code'} onClose={onClose}>
      <div className="space-y-3">
        {lvc ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">LVC code</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">
              {lvc.lvcCode}
            </div>
          </div>
        ) : (
          <Input label="LVC code" value={form.lvcCode} onChange={setU('lvcCode')} maxLength={7} required />
        )}
        <Input label="Exchange name" value={form.lvcName} onChange={setU('lvcName')} maxLength={40} required />
        <Select
          label="Product / company"
          value={form.coCode}
          onChange={e => setForm(f => ({ ...f, coCode: e.target.value }))}
        >
          <option value="">None</option>
          {products.map(p => (
            <option key={p.id} value={p.coCode}>{p.coCode} — {p.coName}</option>
          ))}
        </Select>
        <Select
          label="Status"
          value={form.status}
          onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
        >
          {Object.entries(STATUS_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button
          onClick={() => saveMut.mutate()}
          loading={saveMut.isPending}
          disabled={!form.lvcCode.trim() || !form.lvcName.trim()}
        >
          {lvc ? 'Save changes' : 'Add LVC code'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function LvcCodes() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; lvc: LvcCode | null }>({ open: false, lvc: null });
  const [deleteTarget, setDeleteTarget] = useState<LvcCode | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const { data: codes, isLoading } = useQuery({
    queryKey: ['lvc-codes', q],
    queryFn: () => lvcCodesApi.list(q || undefined).then(r => r.data.data),
  });

  // coCode references Product.coCode. There is no Prisma relation, so the product
  // name is resolved client-side — the same list also feeds the form dropdown.
  const { data: products } = useQuery({
    queryKey: ['products', ''],
    queryFn: () => productsApi.list().then(r => r.data.data),
  });
  const productName = (coCode: string | null) =>
    coCode ? products?.find(p => p.coCode === coCode)?.coName ?? null : null;

  // Status toggle gets no success dialog on purpose — the badge flips in place, which
  // is feedback enough. It DOES need an error surface (see ResortMaster).
  const toggleMut = useMutation({
    mutationFn: (id: string) => lvcCodesApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lvc-codes'] }),
    onError: (err) => setFailure(`Could not change the LVC code status. ${apiError(err)}`),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => lvcCodesApi.remove(id),
    onSuccess: (_res, id) => {
      const gone = codes?.find(c => c.id === id);
      qc.invalidateQueries({ queryKey: ['lvc-codes'] });
      setDeleteTarget(null);
      if (gone) setResult(`LVC code deleted — ${gone.lvcCode} (${gone.lvcName}).`);
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
        <h1 className="mt-1 text-xl font-semibold text-gray-900">Leisure Vacation Club (LVC) Code Maintenance and Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          Exchange programmes under which a member books outside their own product — LVC-CP between
          our own products (03/15 ↔ 02), or an external partner's MAR (Make Available Resorts) such
          as LVC-SGI and LVC-CLC.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={doSearch} className="flex items-center gap-2">
            <div className="w-72">
              <Input
                placeholder="Search LVC code / name / product code"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
            {q && <Button type="button" size="sm" variant="secondary" onClick={clearSearch}>Clear</Button>}
          </form>
          {canCreate('RESORTS_SETUP') && (
            <Button size="sm" onClick={() => setModal({ open: true, lvc: null })}><Plus className="h-4 w-4" /> Add LVC code</Button>
          )}
        </CardHeader>

        {!isLoading && (
          <div className="border-b bg-gray-50/60 px-4 py-2">
            <RecordCount total={codes?.length} />
          </div>
        )}

        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">LVC Code</th>
                  <th className="px-4 py-3 text-left">Exchange Name</th>
                  <th className="px-4 py-3 text-left">Co Code</th>
                  <th className="px-4 py-3 text-left">Product / Company</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {codes?.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono font-medium">{c.lvcCode}</td>
                    <td className="px-4 py-2.5">{c.lvcName}</td>
                    <td className="px-4 py-2.5 font-mono">{c.coCode ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{productName(c.coCode) ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        c.status === 'A' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {c.status === 'A' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {canEdit('RESORTS_SETUP') && (
                          <button onClick={() => toggleMut.mutate(c.id)} title={c.status === 'A' ? 'Deactivate' : 'Activate'}
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                            {c.status === 'A' ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                        )}
                        {canEdit('RESORTS_SETUP') && (
                          <button onClick={() => setModal({ open: true, lvc: c })} title="Edit"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete('RESORTS_SETUP') && (
                          <button
                            onClick={() => { setDelErr(''); setDeleteTarget(c); }}
                            title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {codes?.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No LVC codes found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <LvcCodeFormModal
        open={modal.open}
        lvc={modal.lvc}
        products={products ?? []}
        onClose={() => setModal({ open: false, lvc: null })}
        onSaved={(c, mode) => setResult(
          `LVC code ${mode === 'add' ? 'added' : 'updated'} — ${c.lvcCode} (${c.lvcName})` +
          `${c.coCode ? `, product ${c.coCode}` : ''}.`
        )}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />
      <ResultDialog message={failure} onClose={() => setFailure(null)} variant="error" />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete LVC code?"
        description="This permanently removes the exchange programme code. Deactivating it instead keeps it on record. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'LVC code', value: <span className="font-mono font-medium">{deleteTarget.lvcCode}</span> },
          { label: 'Name',     value: <span className="font-medium">{deleteTarget.lvcName}</span> },
          { label: 'Product',  value: deleteTarget.coCode
              ? <>{deleteTarget.coCode}{productName(deleteTarget.coCode) ? ` — ${productName(deleteTarget.coCode)}` : ''}</>
              : '—' },
          { label: 'Status',   value: deleteTarget.status === 'A' ? 'Active' : 'Inactive' },
        ] : []}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete LVC code"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
