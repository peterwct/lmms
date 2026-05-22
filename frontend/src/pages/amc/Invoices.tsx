import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Zap } from 'lucide-react';
import { amcApi } from '../../api/amc';
import { useAuth } from '../../contexts/AuthContext';
import { apiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { PageSpinner } from '../../components/ui/Spinner';
import { ProductBadge } from '../../components/ProductBadge';
import { RecordCount } from '../../components/ui/RecordCount';
import { format } from 'date-fns';

const billTypeLabel: Record<string, string> = { N: 'Normal', A: 'Advance', H: 'Ad-hoc', F: 'Final' };
const compLabel: Record<string, string> = { MAIN_AMC: 'AMC', SINKING_FUND: 'SF', SERVICE_TAX: 'Tax', ROUNDING: 'Rnd' };
const compColor: Record<string, 'blue' | 'indigo' | 'amber' | 'gray'> = { MAIN_AMC: 'blue', SINKING_FUND: 'indigo', SERVICE_TAX: 'amber', ROUNDING: 'gray' };

export function Invoices() {
  const { isIT, user } = useAuth();
  const canGenerate = isIT || user?.department.name === 'Credit';
  const [coCode, setCoCode] = useState('');
  const [billType, setBillType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [genModal, setGenModal] = useState(false);
  const [genDate, setGenDate] = useState(new Date().toISOString().slice(0, 10));
  const [genCoCode, setGenCoCode] = useState('');
  const [genResult, setGenResult] = useState('');
  const [genError, setGenError] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['amc-invoices', coCode, billType, from, to, page],
    queryFn: () => amcApi.listInvoices({
      coCode: coCode || undefined, billType: billType || undefined,
      from: from || undefined, to: to || undefined, page, limit: 20,
    }).then(r => r.data),
  });

  const genMut = useMutation({
    mutationFn: () => amcApi.generateInvoices({ invDate: genDate ? new Date(genDate).toISOString() : undefined, coCode: genCoCode || undefined }),
    onSuccess: (res) => { setGenResult(res.data.message); refetch(); },
    onError: (err) => setGenError(apiError(err)),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <Select value={coCode} onChange={e => { setCoCode(e.target.value); setPage(1); }} className="w-36">
            <option value="">All products</option>
            <option value="03">LHC-03</option><option value="15">LHC-15</option><option value="02">CP</option>
          </Select>
          <Select value={billType} onChange={e => { setBillType(e.target.value); setPage(1); }} className="w-36">
            <option value="">All types</option>
            <option value="N">Normal</option><option value="A">Advance</option>
            <option value="H">Ad-hoc</option><option value="F">Final</option>
          </Select>
          <Input type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} className="w-36" placeholder="From" />
          <Input type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1); }} className="w-36" placeholder="To" />
        </div>
        {canGenerate && (
          <Button size="sm" onClick={() => { setGenModal(true); setGenResult(''); setGenError(''); }}>
            <Zap className="h-4 w-4" /> Generate invoices
          </Button>
        )}
      </div>

      <RecordCount total={data?.meta?.total} loading={isLoading} />

      <Card>
        {isLoading ? <PageSpinner /> : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Invoice No.</th>
                  <th className="px-4 py-3 text-left">Component</th>
                  <th className="px-4 py-3 text-left">Agreement</th>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Processed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.data.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5">
                      <Link to={`/amc/invoices/${inv.id}`} className="font-mono text-blue-600 hover:underline text-xs">{inv.invNo}</Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge color={compColor[inv.invComponent] ?? 'gray'}>{compLabel[inv.invComponent]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">{inv.agreementNo}</td>
                    <td className="px-4 py-2.5 text-xs">
                      <div className="font-mono">{inv.agreement?.member?.membershipNo}</div>
                      <div className="text-gray-500 truncate max-w-xs">{inv.agreement?.member?.fullName}</div>
                    </td>
                    <td className="px-4 py-2.5"><ProductBadge coCode={inv.coCode} /></td>
                    <td className="px-4 py-2.5 text-gray-500 text-xs">{format(new Date(inv.invDate), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-2.5 text-right font-medium">
                      {parseFloat(inv.invAmount).toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500">{billTypeLabel[inv.billType]}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={inv.isProcessed ? 'green' : 'gray'}>{inv.isProcessed ? 'Yes' : 'No'}</Badge>
                    </td>
                  </tr>
                ))}
                {data?.data.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No invoices found</td></tr>
                )}
              </tbody>
            </table>
            {data?.meta && <Pagination {...data.meta} onPage={setPage} />}
          </>
        )}
      </Card>

      {/* Generate modal */}
      <Modal open={genModal} title="Generate Invoices" onClose={() => setGenModal(false)}>
        <div className="space-y-4">
          <Input label="Invoice date" type="date" value={genDate} onChange={e => setGenDate(e.target.value)} />
          <Select label="Product (optional — leave blank for all)" value={genCoCode} onChange={e => setGenCoCode(e.target.value)}>
            <option value="">All products</option>
            <option value="03">LHC-03</option><option value="15">LHC-15</option><option value="02">CP</option>
          </Select>
          {genResult && <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{genResult}</p>}
          {genError && <p className="text-sm text-red-600">{genError}</p>}
          <div className="flex gap-3">
            <Button onClick={() => genMut.mutate()} loading={genMut.isPending} disabled={!!genResult}>
              <Zap className="h-4 w-4" /> Generate
            </Button>
            <Button variant="secondary" onClick={() => setGenModal(false)}>Close</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
