import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { resortsApi } from '../../api/resorts';
import { useActiveProducts, productOptions } from '../../hooks/useActiveProducts';
import { apiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import type { Resort } from '../../types';

const EMPTY_FORM = {
  resortCode: '', coCode: '03', shortName: '', resortName: '',
  rciCode: '', rciAffiliate: 'N', mar: 'N', lockOnOff: 'N', paymt: 'N',
  resortMgmt: '', contactPerson: '',
  add1: '', add2: '', add3: '', city: '', state: '', country: '',
  telNo: '', faxNo: '',
  checkInTime: '', checkOutTime: '',
};

interface Props {
  open: boolean;
  resort: Resort | null;   // null = add mode
  onClose: () => void;
  onSaved?: (saved: Resort, mode: 'add' | 'edit') => void;
}

export function ResortFormModal({ open, resort, onClose, onSaved }: Props) {
  const qc = useQueryClient();
  // The Product list used to be hardcoded to 03/15/02, which could not even represent
  // existing data -- the partner/LVC `V-*` resorts sit on coCodes 01/20/24/26 and so on.
  // Offer the ACTIVE products; `productOptions` keeps a resort's own product in the list
  // when it has since been deactivated, so editing one can't silently rewrite its coCode.
  const { products, allProducts } = useActiveProducts();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(resort ? {
      resortCode: resort.resortCode,
      coCode: resort.coCode,
      shortName: resort.shortName ?? '',
      resortName: resort.resortName,
      rciCode: resort.rciCode ?? '',
      rciAffiliate: resort.rciAffiliate ?? 'N',
      mar: resort.mar ?? 'N',
      lockOnOff: resort.lockOnOff ?? 'N',
      paymt: resort.paymt ?? 'N',
      resortMgmt: resort.resortMgmt ?? '',
      contactPerson: resort.contactPerson ?? '',
      add1: resort.add1 ?? '', add2: resort.add2 ?? '', add3: resort.add3 ?? '',
      city: resort.city ?? '', state: resort.state ?? '', country: resort.country ?? '',
      telNo: resort.telNo ?? '', faxNo: resort.faxNo ?? '',
      checkInTime: resort.checkInTime ?? '', checkOutTime: resort.checkOutTime ?? '',
    } : { ...EMPTY_FORM });
  }, [open, resort]);

  const saveMut = useMutation({
    mutationFn: () => {
      const { resortCode, ...rest } = form;
      // empty string -> null so cleared fields are stored as NULL
      const payload = Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k, v === '' ? null : v]),
      );
      return resort
        ? resortsApi.update(resort.id, payload)
        : resortsApi.create({ resortCode, ...payload });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['resorts'] });
      if (resort) qc.invalidateQueries({ queryKey: ['resort', resort.id] });
      onSaved?.(r.data.data, resort ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  // auto-uppercase text inputs (project convention)
  const setU = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value.toUpperCase() }));
  const setV = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const setYN = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.checked ? 'Y' : 'N' }));

  return (
    <Modal open={open} title={resort ? 'Edit Resort' : 'Add Resort'} onClose={onClose} size="lg">
      <div className="grid grid-cols-3 gap-3">
        {resort ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Resort code</label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">
              {form.resortCode}
            </div>
          </div>
        ) : (
          <Input label="Resort code" value={form.resortCode} onChange={setU('resortCode')} maxLength={8} required />
        )}
        <Select label="Product" value={form.coCode} onChange={setV('coCode')}>
          {productOptions(products, allProducts, form.coCode).map(p => (
            <option key={p.coCode} value={p.coCode}>{p.coCode} — {p.coName}</option>
          ))}
        </Select>
        <Input label="Short name" value={form.shortName} onChange={setU('shortName')} maxLength={5} />
        <div className="col-span-3">
          <Input label="Resort name" value={form.resortName} onChange={setU('resortName')} maxLength={40} required />
        </div>
        <Input label="RCI code" value={form.rciCode} onChange={setU('rciCode')} maxLength={8} />
        <Input label="Resort management" value={form.resortMgmt} onChange={setU('resortMgmt')} maxLength={25} />
        <Input label="Contact person" value={form.contactPerson} onChange={setU('contactPerson')} maxLength={30} />
        <Input label="Address 1" value={form.add1} onChange={setU('add1')} maxLength={30} />
        <Input label="Address 2" value={form.add2} onChange={setU('add2')} maxLength={30} />
        <Input label="Address 3" value={form.add3} onChange={setU('add3')} maxLength={30} />
        <Input label="City" value={form.city} onChange={setU('city')} maxLength={30} />
        <Input label="State" value={form.state} onChange={setU('state')} maxLength={30} />
        <Input label="Country" value={form.country} onChange={setU('country')} maxLength={30} />
        <Input label="Telephone" value={form.telNo} onChange={setV('telNo')} maxLength={18} />
        <Input label="Fax" value={form.faxNo} onChange={setV('faxNo')} maxLength={18} />
        <Input label="Check-in time" value={form.checkInTime} onChange={setU('checkInTime')} maxLength={20} placeholder="e.g. 2PM - 10PM" />
        <Input label="Check-out time" value={form.checkOutTime} onChange={setU('checkOutTime')} maxLength={20} placeholder="e.g. 12PM" />
        <div className="col-span-3 flex items-center gap-6 pt-1">
          <label className="flex items-center gap-1.5 text-sm text-gray-700 whitespace-nowrap">
            <input type="checkbox" checked={form.rciAffiliate === 'Y'} onChange={setYN('rciAffiliate')} className="rounded border-gray-300" />
            RCI Affiliate
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input type="checkbox" checked={form.mar === 'Y'} onChange={setYN('mar')} className="rounded border-gray-300" />
            MAR
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input type="checkbox" checked={form.lockOnOff === 'Y'} onChange={setYN('lockOnOff')} className="rounded border-gray-300" />
            Lock
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-700">
            <input type="checkbox" checked={form.paymt === 'Y'} onChange={setYN('paymt')} className="rounded border-gray-300" />
            Payment
          </label>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending}>
          {resort ? 'Save changes' : 'Add resort'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
