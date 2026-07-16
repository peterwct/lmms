import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { format } from 'date-fns';
import { amcApi } from '../../api/amc';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import type { CancellableInvoice } from '../../types';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import { ProductBadge } from '../../components/ProductBadge';
import { RecordCount } from '../../components/ui/RecordCount';

export function InvoiceCancellation() {
  const { canEdit } = useAuth();
  const canCancel = canEdit('AMC_BILLING'); // cancellation requires AMC Billing Edit permission

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['amc-cancellable', debouncedQ],
    queryFn: () => amcApi.listCancellableInvoices({ q: debouncedQ || undefined }).then(r => r.data),
  });

  // Cancel confirmation modal
  const [target, setTarget] = useState<CancellableInvoice | null>(null);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');

  const cancelMut = useMutation({
    mutationFn: () => amcApi.cancelInvoice(target!.id, { reason: reason.trim() || undefined }),
    onSuccess: (res) => { setResult(res.data.message); setTarget(null); setReason(''); refetch(); },
    onError: (err) => setError(apiError(err)),
  });

  const rows = data?.data ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-gray-900">Invoice Cancellation</h1>
        <p className="text-sm text-gray-500">Cancel an unprocessed AMC invoice. Processed invoices cannot be cancelled.</p>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <Input type="text" value={q} onChange={e => setQ(e.target.value.toUpperCase())}
               className="w-72" placeholder="Search membership / agreement / invoice no" />
        {q && <Button variant="secondary" size="sm" onClick={() => setQ('')}>Clear</Button>}
      </div>

      {result && <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{result}</p>}

      <RecordCount total={rows.length} loading={isLoading} />

      <Card>
        {isLoading ? <PageSpinner /> : rows.length === 0 ? (
          <p className="text-sm text-gray-500 px-4 py-6 text-center">No unprocessed invoices found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Invoice No.</th>
                <th className="px-4 py-3 text-left">Member</th>
                <th className="px-4 py-3 text-left">Agreement</th>
                <th className="px-4 py-3 text-left">Product</th>
                <th className="px-4 py-3 text-left">Invoice Date</th>
                <th className="px-4 py-3 text-right">Year</th>
                <th className="px-4 py-3 text-right">Total (RM)</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono">{inv.invNo}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{inv.memberName}</div>
                    <div className="text-xs text-gray-500">{inv.membershipNo}</div>
                  </td>
                  <td className="px-4 py-3">{inv.agreementNo}</td>
                  <td className="px-4 py-3"><ProductBadge coCode={inv.coCode} /></td>
                  <td className="px-4 py-3">{format(new Date(inv.invDate), 'dd/MM/yyyy')}</td>
                  <td className="px-4 py-3 text-right">{inv.invoiceYearSeq ?? '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">{inv.totalAmount}</td>
                  <td className="px-4 py-3 text-right">
                    {canCancel ? (
                      <Button variant="danger" size="sm"
                              onClick={() => { setTarget(inv); setReason(''); setError(''); setResult(''); }}>
                        <Ban className="h-4 w-4" /> Cancel
                      </Button>
                    ) : <span className="text-xs text-gray-400">No access</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Confirm cancellation modal */}
      <Modal open={!!target} title="Cancel Invoice" onClose={() => { setTarget(null); cancelMut.reset(); }}>
        {target && (
          <div className="space-y-4">
            <p className="text-sm text-gray-700">
              Cancel invoice <span className="font-mono font-medium">{target.invNo}</span> for{' '}
              <span className="font-medium">{target.memberName}</span> ({target.membershipNo}),
              agreement {target.agreementNo} — total <span className="font-mono">RM {target.totalAmount}</span>?
            </p>
            <div className="text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2 text-amber-700">
              This deletes all {target.invNos.length} line(s) ({target.invNos.join(', ')}) and rolls back the
              billing schedule so the agreement can be re-billed. This cannot be undone.
            </div>
            <Input label="Reason (optional)" type="text" value={reason}
                   onChange={e => setReason(e.target.value)} placeholder="e.g. wrong amount" />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-3">
              <Button variant="danger" onClick={() => cancelMut.mutate()} loading={cancelMut.isPending}>
                <Ban className="h-4 w-4" /> Confirm Cancel
              </Button>
              <Button variant="secondary" onClick={() => { setTarget(null); cancelMut.reset(); }}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
