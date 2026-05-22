import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { amcApi } from '../../api/amc';
import { useAuth } from '../../contexts/AuthContext';
import { apiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import type { AmcPrice, AmcPricePoints } from '../../types';
import { format } from 'date-fns';

// ── Amount-in-words helpers ───────────────────────────────────────
const ONES = ['', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE',
  'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN', 'FIFTEEN', 'SIXTEEN',
  'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];

function chunkToWords(n: number): string {
  if (n === 0) return '';
  if (n < 20)  return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
  return ONES[Math.floor(n / 100)] + ' HUNDRED' + (n % 100 ? ' ' + chunkToWords(n % 100) : '');
}

function numToWords(n: number): string {
  if (n === 0) return 'ZERO';
  const parts: string[] = [];
  const millions  = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;
  if (millions)  parts.push(chunkToWords(millions)  + ' MILLION');
  if (thousands) parts.push(chunkToWords(thousands) + ' THOUSAND');
  if (remainder) parts.push(chunkToWords(remainder));
  return parts.join(' ');
}

function toAmountInWords(total: number): string {
  if (!total || isNaN(total)) return '';
  const whole = Math.floor(total);
  const cents = Math.round((total - whole) * 100);
  let result = 'RINGGIT MALAYSIA ' + numToWords(whole);
  if (cents > 0) result += ' AND CENTS ' + numToWords(cents);
  return result + ' ONLY';
}

const EMPTY_LHC = { coCode: '03', effectiveDate: '', priceCode: 'M', currencyCode: 'RM', amcAmount: '', sinkingFund: '', serviceTax: '', totalAmount: '', amountInWords: '', rate: '1' };
const EMPTY_CP  = { effectiveDate: '', minPoints: '', maxPoints: '', amcRatePerPoint: '', sinkingFundPct: '10', gstPct: '8', unitPrice: '', rciPoints: '' };

export function Rates() {
  const { isIT, user } = useAuth();
  const canAdd = isIT || user?.department.name === 'Finance';
  const qc = useQueryClient();

  // LHC modal state
  const [lhcModal, setLhcModal]   = useState(false);
  const [editLhcId, setEditLhcId] = useState<string | null>(null);
  const [lhcForm, setLhcForm]     = useState({ ...EMPTY_LHC });

  // CP modal state
  const [cpModal, setCpModal]   = useState(false);
  const [editCpId, setEditCpId] = useState<string | null>(null);
  const [cpForm, setCpForm]     = useState({ ...EMPTY_CP });

  const [error, setError] = useState('');

  const { data: lhcRates, isLoading: lhcLoading } = useQuery({ queryKey: ['lhc-rates'], queryFn: () => amcApi.listLhcRates().then(r => r.data.data) });
  const { data: cpRates,  isLoading: cpLoading  } = useQuery({ queryKey: ['cp-rates'],  queryFn: () => amcApi.listCpRates().then(r => r.data.data) });

  // ── LHC mutations ────────────────────────────────────────────────
  const lhcSaveMut = useMutation({
    mutationFn: () => {
      const payload = {
        ...lhcForm,
        effectiveDate: new Date(lhcForm.effectiveDate).toISOString(),
        amcAmount:    parseFloat(lhcForm.amcAmount),
        sinkingFund:  parseFloat(lhcForm.sinkingFund),
        serviceTax:   parseFloat(lhcForm.serviceTax),
        totalAmount:  parseFloat(lhcForm.totalAmount),
        rate:         parseFloat(lhcForm.rate),
        amountInWords: lhcForm.amountInWords || undefined,
      };
      return editLhcId
        ? amcApi.updateLhcRate(editLhcId, payload)
        : amcApi.createLhcRate(payload);
    },
    onSuccess: () => { setLhcModal(false); qc.invalidateQueries({ queryKey: ['lhc-rates'] }); },
    onError: (err) => setError(apiError(err)),
  });

  const lhcToggleMut = useMutation({
    mutationFn: (id: string) => amcApi.toggleLhcRate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lhc-rates'] }),
  });

  const lhcDeleteMut = useMutation({
    mutationFn: (id: string) => amcApi.deleteLhcRate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lhc-rates'] }),
  });

  // ── CP mutations ─────────────────────────────────────────────────
  const cpSaveMut = useMutation({
    mutationFn: () => {
      const payload = {
        ...cpForm,
        effectiveDate:   new Date(cpForm.effectiveDate).toISOString(),
        minPoints:       parseInt(cpForm.minPoints),
        maxPoints:       parseInt(cpForm.maxPoints),
        amcRatePerPoint: parseFloat(cpForm.amcRatePerPoint),
        sinkingFundPct:  parseFloat(cpForm.sinkingFundPct),
        gstPct:          parseFloat(cpForm.gstPct),
        unitPrice:  cpForm.unitPrice  ? parseFloat(cpForm.unitPrice)  : null,
        rciPoints:  cpForm.rciPoints  ? parseInt(cpForm.rciPoints)    : null,
      };
      return editCpId
        ? amcApi.updateCpRate(editCpId, payload)
        : amcApi.createCpRate(payload);
    },
    onSuccess: () => { setCpModal(false); qc.invalidateQueries({ queryKey: ['cp-rates'] }); },
    onError: (err) => setError(apiError(err)),
  });

  const cpToggleMut = useMutation({
    mutationFn: (id: string) => amcApi.toggleCpRate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cp-rates'] }),
  });

  const cpDeleteMut = useMutation({
    mutationFn: (id: string) => amcApi.deleteCpRate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cp-rates'] }),
  });

  // ── Helpers ──────────────────────────────────────────────────────
  const openAddLhc = () => {
    setEditLhcId(null); setLhcForm({ ...EMPTY_LHC }); setError(''); setLhcModal(true);
  };
  const openEditLhc = (r: AmcPrice) => {
    setEditLhcId(r.id);
    setLhcForm({
      coCode: r.coCode, priceCode: r.priceCode,
      currencyCode: r.currencyCode ?? 'RM',
      effectiveDate: r.effectiveDate.slice(0, 10),
      amcAmount: r.amcAmount, sinkingFund: r.sinkingFund,
      serviceTax: r.serviceTax, totalAmount: r.totalAmount,
      amountInWords: r.amountInWords ?? '', rate: r.rate,
    });
    setError(''); setLhcModal(true);
  };

  const openAddCp = () => {
    setEditCpId(null); setCpForm({ ...EMPTY_CP }); setError(''); setCpModal(true);
  };
  const openEditCp = (r: AmcPricePoints) => {
    setEditCpId(r.id);
    setCpForm({
      effectiveDate:   r.effectiveDate.slice(0, 10),
      minPoints:       String(r.minPoints),
      maxPoints:       String(r.maxPoints),
      amcRatePerPoint: r.amcRatePerPoint,
      sinkingFundPct:  r.sinkingFundPct,
      gstPct:          r.gstPct,
      unitPrice:  r.unitPrice  ?? '',
      rciPoints:  r.rciPoints  != null ? String(r.rciPoints) : '',
    });
    setError(''); setCpModal(true);
  };

  const setL = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setLhcForm(f => {
      const updated = { ...f, [k]: e.target.value };
      if (k === 'amcAmount' || k === 'sinkingFund' || k === 'serviceTax') {
        const amc  = parseFloat(k === 'amcAmount'   ? e.target.value : f.amcAmount)   || 0;
        const sf   = parseFloat(k === 'sinkingFund' ? e.target.value : f.sinkingFund) || 0;
        const tax  = parseFloat(k === 'serviceTax'  ? e.target.value : f.serviceTax)  || 0;
        const total = Math.round((amc + sf + tax) * 100) / 100;
        updated.totalAmount   = total > 0 ? total.toFixed(2) : '';
        updated.amountInWords = total > 0 ? toAmountInWords(total) : '';
      }
      return updated;
    });
  };
  const setC = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setCpForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      {/* ── LHC Rates ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="font-semibold text-gray-700">LHC Rate Master (coCode 03 &amp; 15)</p>
          {canAdd && <Button size="sm" onClick={openAddLhc}><Plus className="h-4 w-4" /> Add rate</Button>}
        </CardHeader>
        {lhcLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">CoCode</th>
                  <th className="px-4 py-3 text-left">Price Code</th>
                  <th className="px-4 py-3 text-left">Currency</th>
                  <th className="px-4 py-3 text-right">AMC</th>
                  <th className="px-4 py-3 text-right">Sinking Fund</th>
                  <th className="px-4 py-3 text-right">Service Tax</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Rate</th>
                  <th className="px-4 py-3 text-left">Effective</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  {canAdd && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lhcRates?.map(r => (
                  <tr key={r.id} className={`hover:bg-gray-50 ${!r.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 font-mono">{r.coCode}</td>
                    <td className="px-4 py-2.5 font-mono">{r.priceCode}</td>
                    <td className="px-4 py-2.5">{r.currencyCode}</td>
                    <td className="px-4 py-2.5 text-right">{parseFloat(r.amcAmount).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">{parseFloat(r.sinkingFund).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">{parseFloat(r.serviceTax).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{parseFloat(r.totalAmount).toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-right">{parseFloat(r.rate).toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{format(new Date(r.effectiveDate), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canAdd && (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEditLhc(r)} title="Edit" className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => lhcToggleMut.mutate(r.id)} title={r.isActive ? 'Deactivate' : 'Activate'}
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                            {r.isActive ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => { if (window.confirm(`Delete LHC rate ${r.coCode} / ${r.priceCode} (effective ${format(new Date(r.effectiveDate), 'dd/MM/yyyy')})?`)) lhcDeleteMut.mutate(r.id); }}
                            title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── CP Points Tiers ───────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="font-semibold text-gray-700">CP Points Rate Tiers (coCode 02)</p>
          {canAdd && <Button size="sm" onClick={openAddCp}><Plus className="h-4 w-4" /> Add tier</Button>}
        </CardHeader>
        {cpLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Points Range</th>
                  <th className="px-4 py-3 text-right">Rate/Point</th>
                  <th className="px-4 py-3 text-right">SF %</th>
                  <th className="px-4 py-3 text-right">GST %</th>
                  <th className="px-4 py-3 text-right">Unit Price</th>
                  <th className="px-4 py-3 text-right">RCI Pts</th>
                  <th className="px-4 py-3 text-left">Effective</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  {canAdd && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cpRates?.map(r => (
                  <tr key={r.id} className={`hover:bg-gray-50 ${!r.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 font-medium">{r.minPoints} – {r.maxPoints} pts</td>
                    <td className="px-4 py-2.5 text-right">{parseFloat(r.amcRatePerPoint).toFixed(4)}</td>
                    <td className="px-4 py-2.5 text-right">{parseFloat(r.sinkingFundPct).toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right">{parseFloat(r.gstPct).toFixed(1)}%</td>
                    <td className="px-4 py-2.5 text-right">{r.unitPrice ? parseFloat(r.unitPrice).toFixed(2) : '—'}</td>
                    <td className="px-4 py-2.5 text-right">{r.rciPoints ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{format(new Date(r.effectiveDate), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${r.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    {canAdd && (
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEditCp(r)} title="Edit" className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => cpToggleMut.mutate(r.id)} title={r.isActive ? 'Deactivate' : 'Activate'}
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                            {r.isActive ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                          <button
                            onClick={() => { if (window.confirm(`Delete CP tier ${r.minPoints}–${r.maxPoints} pts (effective ${format(new Date(r.effectiveDate), 'dd/MM/yyyy')})?`)) cpDeleteMut.mutate(r.id); }}
                            title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── LHC Modal (Add / Edit) ────────────────────────────────── */}
      <Modal open={lhcModal} title={editLhcId ? 'Edit LHC Rate' : 'Add LHC Rate'} onClose={() => setLhcModal(false)}>
        <div className="grid grid-cols-2 gap-3">
          <Select label="CoCode" value={lhcForm.coCode} onChange={setL('coCode')}>
            <option value="03">03 — LHC-A</option>
            <option value="15">15 — LHC-B</option>
          </Select>
          <Select label="Price code" value={lhcForm.priceCode} onChange={setL('priceCode')}>
            <option value="M">M — RM</option>
            <option value="S">S — S$</option>
            <option value="I">I — Other</option>
          </Select>
          <Input label="Currency" value={lhcForm.currencyCode} onChange={setL('currencyCode')} />
          <Input label="Effective date" type="date" value={lhcForm.effectiveDate} onChange={setL('effectiveDate')} required />
          <Input label="AMC amount" type="number" step="0.01" value={lhcForm.amcAmount} onChange={setL('amcAmount')} required />
          <Input label="Sinking fund" type="number" step="0.01" value={lhcForm.sinkingFund} onChange={setL('sinkingFund')} required />
          <Input label="Service tax" type="number" step="0.01" value={lhcForm.serviceTax} onChange={setL('serviceTax')} required />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total <span className="text-xs text-gray-400">(auto)</span></label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-semibold text-gray-800">
              {lhcForm.totalAmount || '—'}
            </div>
          </div>
          <Input label="Currency rate" type="number" step="0.0001" value={lhcForm.rate} onChange={setL('rate')} />
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount in words <span className="text-xs text-gray-400">(auto)</span></label>
            <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700 min-h-[2.5rem]">
              {lhcForm.amountInWords || '—'}
            </div>
          </div>
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex gap-3">
          <Button onClick={() => lhcSaveMut.mutate()} loading={lhcSaveMut.isPending}>
            {editLhcId ? 'Save changes' : 'Add rate'}
          </Button>
          <Button variant="secondary" onClick={() => setLhcModal(false)}>Cancel</Button>
        </div>
      </Modal>

      {/* ── CP Modal (Add / Edit) ─────────────────────────────────── */}
      <Modal open={cpModal} title={editCpId ? 'Edit CP Tier' : 'Add CP Points Tier'} onClose={() => setCpModal(false)}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Effective date" type="date" value={cpForm.effectiveDate} onChange={setC('effectiveDate')} required />
          <div />
          <Input label="Min points" type="number" value={cpForm.minPoints} onChange={setC('minPoints')} required />
          <Input label="Max points" type="number" value={cpForm.maxPoints} onChange={setC('maxPoints')} required />
          <Input label="AMC rate / point" type="number" step="0.0001" value={cpForm.amcRatePerPoint} onChange={setC('amcRatePerPoint')} required />
          <Input label="Unit price" type="number" step="0.01" value={cpForm.unitPrice} onChange={setC('unitPrice')} />
          <Input label="Sinking fund %" type="number" step="0.01" value={cpForm.sinkingFundPct} onChange={setC('sinkingFundPct')} required />
          <Input label="GST %" type="number" step="0.01" value={cpForm.gstPct} onChange={setC('gstPct')} required />
          <Input label="RCI points" type="number" value={cpForm.rciPoints} onChange={setC('rciPoints')} />
        </div>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        <div className="mt-4 flex gap-3">
          <Button onClick={() => cpSaveMut.mutate()} loading={cpSaveMut.isPending}>
            {editCpId ? 'Save changes' : 'Add tier'}
          </Button>
          <Button variant="secondary" onClick={() => setCpModal(false)}>Cancel</Button>
        </div>
      </Modal>
    </div>
  );
}
