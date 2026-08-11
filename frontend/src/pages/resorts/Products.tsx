import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search } from 'lucide-react';
import { productsApi } from '../../api/resorts';
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
import type { Product } from '../../types';

const ENT_TYPE_LABELS: Record<string, string> = {
  W: 'W — Week',
  P: 'P — Points',
};

const EMPTY_FORM = {
  coCode: '', coName: '', entType: 'W',
  add1: '', add2: '', add3: '', telNo: '', faxNo: '', contactPerson: '',
};

interface ModalProps {
  open: boolean;
  product: Product | null;   // null = add mode
  onClose: () => void;
  onSaved: (saved: Product, mode: 'add' | 'edit') => void;
}

function ProductFormModal({ open, product, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(product ? {
      coCode:        product.coCode,
      coName:        product.coName,
      entType:       product.entType,
      add1:          product.add1 ?? '',
      add2:          product.add2 ?? '',
      add3:          product.add3 ?? '',
      telNo:         product.telNo ?? '',
      faxNo:         product.faxNo ?? '',
      contactPerson: product.contactPerson ?? '',
    } : { ...EMPTY_FORM });
  }, [open, product]);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        coName:        form.coName,
        entType:       form.entType,
        add1:          form.add1 === '' ? null : form.add1,
        add2:          form.add2 === '' ? null : form.add2,
        add3:          form.add3 === '' ? null : form.add3,
        telNo:         form.telNo === '' ? null : form.telNo,
        faxNo:         form.faxNo === '' ? null : form.faxNo,
        contactPerson: form.contactPerson === '' ? null : form.contactPerson,
      };
      return product
        ? productsApi.update(product.id, payload)
        : productsApi.create({ coCode: form.coCode, ...payload });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      onSaved(r.data.data, product ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  // auto-uppercase text inputs (project convention)
  const setU = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value.toUpperCase() }));

  return (
    <Modal open={open} title={product ? 'Edit Product' : 'Add Product'} onClose={onClose}>
      <div className="space-y-3">
        {product ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Product code</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">
              {product.coCode}
            </div>
          </div>
        ) : (
          <Input label="Product code" value={form.coCode} onChange={setU('coCode')} maxLength={2} required />
        )}
        <Input label="Product name" value={form.coName} onChange={setU('coName')} maxLength={40} required />
        <Select
          label="Entitlement type"
          value={form.entType}
          onChange={e => setForm(f => ({ ...f, entType: e.target.value }))}
        >
          {Object.entries(ENT_TYPE_LABELS).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </Select>
        <Input label="Address 1" value={form.add1} onChange={setU('add1')} maxLength={40} />
        <Input label="Address 2" value={form.add2} onChange={setU('add2')} maxLength={40} />
        <Input label="Address 3" value={form.add3} onChange={setU('add3')} maxLength={40} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tel no." value={form.telNo} onChange={setU('telNo')} maxLength={14} />
          <Input label="Fax no." value={form.faxNo} onChange={setU('faxNo')} maxLength={14} />
        </div>
        <Input label="Contact person" value={form.contactPerson} onChange={setU('contactPerson')} maxLength={40} />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button
          onClick={() => saveMut.mutate()}
          loading={saveMut.isPending}
          disabled={!form.coCode.trim() || !form.coName.trim()}
        >
          {product ? 'Save changes' : 'Add product'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function Products() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; product: Product | null }>({ open: false, product: null });
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', q],
    queryFn: () => productsApi.list(q || undefined).then(r => r.data.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => productsApi.remove(id),
    onSuccess: (_res, id) => {
      const gone = products?.find(p => p.id === id);
      qc.invalidateQueries({ queryKey: ['products'] });
      setDeleteTarget(null);
      if (gone) setResult(`Product deleted — ${gone.coCode} (${gone.coName}).`);
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
        <h1 className="mt-1 text-xl font-semibold text-gray-900">Company Master - New Company/Product Code</h1>
        <p className="mt-1 text-sm text-gray-500">
          Products / operating companies. The product code is the <span className="font-mono">coCode</span> carried
          by every agreement, AMC schedule and resort.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={doSearch} className="flex items-center gap-2">
            <div className="w-72">
              <Input
                placeholder="Search code / product name / contact"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
            {q && <Button type="button" size="sm" variant="secondary" onClick={clearSearch}>Clear</Button>}
          </form>
          {canCreate('RESORTS_SETUP') && (
            <Button size="sm" onClick={() => setModal({ open: true, product: null })}><Plus className="h-4 w-4" /> Add product</Button>
          )}
        </CardHeader>

        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Product Name</th>
                  <th className="px-4 py-3 text-left">Ent Type</th>
                  <th className="px-4 py-3 text-left">Contact Person</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products?.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono font-medium">{p.coCode}</td>
                    <td className="px-4 py-2.5">{p.coName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        p.entType === 'P' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {ENT_TYPE_LABELS[p.entType] ?? p.entType}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{p.contactPerson ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {canEdit('RESORTS_SETUP') && (
                          <button onClick={() => setModal({ open: true, product: p })} title="Edit"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete('RESORTS_SETUP') && (
                          <button
                            onClick={() => { setDelErr(''); setDeleteTarget(p); }}
                            title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {products?.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No products found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ProductFormModal
        open={modal.open}
        product={modal.product}
        onClose={() => setModal({ open: false, product: null })}
        onSaved={(p, mode) => setResult(
          `Product ${mode === 'add' ? 'added' : 'updated'} — ${p.coCode} (${p.coName}), ` +
          `${p.entType === 'P' ? 'Points' : 'Week'} entitlement.`
        )}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete product?"
        description="This permanently removes the product. It is refused if any agreement, AMC schedule or resort still carries this product code. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'Code',    value: <span className="font-mono font-medium">{deleteTarget.coCode}</span> },
          { label: 'Name',    value: <span className="font-medium">{deleteTarget.coName}</span> },
          { label: 'Type',    value: ENT_TYPE_LABELS[deleteTarget.entType] ?? deleteTarget.entType },
          { label: 'Contact', value: deleteTarget.contactPerson ?? '—' },
        ] : []}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete product"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
