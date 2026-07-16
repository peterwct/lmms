import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import type { AmcSchedule } from '../../types';
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
  const { canEdit } = useAuth();
  const canGenerate = canEdit('AMC_BILLING'); // generate requires AMC Billing Edit permission
  const [coCode, setCoCode] = useState('');
  const [billType, setBillType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  // Debounce the membership/agreement search so we don't fetch on every keystroke
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);
  const [genModal, setGenModal] = useState(false);
  const [genProductType, setGenProductType] = useState<'CP' | 'LHC'>('CP'); // CP billed monthly (default); LHC only Jan & July
  const [genPeriod, setGenPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM, current period
  const [genAgreementNo, setGenAgreementNo] = useState('');
  const [genResult, setGenResult] = useState('');
  const [genSkipped, setGenSkipped] = useState<{ agreementNo: string; membershipNo: string; reason: string }[]>([]);
  const [genError, setGenError] = useState('');
  const [confirmingBulk, setConfirmingBulk] = useState(false); // confirm step when generating for ALL (no agreement no)

  // Only query once the user has entered a search term or picked a filter — no records by default.
  const hasFilters = !!(debouncedQ || coCode || billType || from || to);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['amc-invoices', coCode, billType, from, to, debouncedQ, page],
    queryFn: () => amcApi.listInvoices({
      coCode: coCode || undefined, billType: billType || undefined,
      from: from || undefined, to: to || undefined, q: debouncedQ || undefined, page, limit: 20,
    }).then(r => r.data),
    enabled: hasFilters,
  });

  const genMut = useMutation({
    mutationFn: () => amcApi.generateInvoices({ productType: genProductType, period: genPeriod || undefined, agreementNo: genAgreementNo.trim() || undefined }),
    onSuccess: (res) => { setGenResult(res.data.message); setGenSkipped(res.data.skipped ?? []); setConfirmingBulk(false); refetch(); },
    onError: (err) => setGenError(apiError(err)),
  });

  // Verify a keyed-in Agreement No by showing its member name (debounced lookup)
  const [debouncedAgmtNo, setDebouncedAgmtNo] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAgmtNo(genAgreementNo.trim()), 400);
    return () => clearTimeout(t);
  }, [genAgreementNo]);

  const { data: agmtLookup, isFetching: agmtLoading } = useQuery({
    queryKey: ['amc-agmt-verify', debouncedAgmtNo],
    queryFn: () => amcApi.listSchedules({ q: debouncedAgmtNo, limit: 20 }).then(r => r.data),
    enabled: genModal && debouncedAgmtNo.length > 0,
  });

  const matchedAgmt = useMemo(() => {
    if (!debouncedAgmtNo) return null;
    const rows = (agmtLookup?.data ?? []) as AmcSchedule[];
    const exact = rows.filter(s => s.agreementNo?.toUpperCase() === debouncedAgmtNo.toUpperCase());
    if (!exact.length) return null;
    // Prefer the billable schedule (active + not yet completed) — the one that would actually be billed
    return exact.find(s => s.billingStatus === 'N' && s.agreement?.acctClassify === 'NA') ?? exact[0];
  }, [agmtLookup, debouncedAgmtNo]);

  const settled = debouncedAgmtNo === genAgreementNo.trim() && !agmtLoading;
  const agmtNotFound = !!debouncedAgmtNo && settled && !matchedAgmt && agmtLookup !== undefined;
  const matchedProduct = matchedAgmt ? (matchedAgmt.coCode === '02' ? 'CP' : 'LHC') : null;
  const productMismatch = !!matchedProduct && matchedProduct !== genProductType;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3">
          <Input type="text" value={q} onChange={e => setQ(e.target.value.toUpperCase())}
                 className="w-64" placeholder="Search membership / agreement no / name" />
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
          {(q || coCode || billType || from || to) && (
            <Button variant="secondary" size="sm"
                    onClick={() => { setQ(''); setCoCode(''); setBillType(''); setFrom(''); setTo(''); setPage(1); }}>
              Clear
            </Button>
          )}
        </div>
        {canGenerate && (
          <Button size="sm" onClick={() => { setGenModal(true); setGenResult(''); setGenSkipped([]); setGenError(''); setConfirmingBulk(false); }}>
            <Zap className="h-4 w-4" /> Generate invoices
          </Button>
        )}
      </div>

      {hasFilters && <RecordCount total={data?.meta?.total} loading={isLoading} />}

      {!hasFilters ? (
        <Card>
          <p className="px-4 py-8 text-center text-gray-400">Enter a search term or select a filter to view invoices.</p>
        </Card>
      ) : (
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
      )}

      {/* Generate modal */}
      <Modal open={genModal} title="Generate Invoices" onClose={() => setGenModal(false)}>
        <div className="space-y-4">
          <Select label="Product Type" value={genProductType} onChange={e => setGenProductType(e.target.value as 'CP' | 'LHC')}>
            <option value="CP">CP (billed monthly)</option>
            <option value="LHC">LHC (billed Jan &amp; July)</option>
          </Select>
          <Input label="Period" type="month" value={genPeriod} onChange={e => setGenPeriod(e.target.value)} />
          <div>
            <Input label="Agreement No (leave blank for all)" type="text" value={genAgreementNo}
                   onChange={e => { setGenAgreementNo(e.target.value.toUpperCase()); setConfirmingBulk(false); }} placeholder="All" />
            {genAgreementNo.trim() && (
              <div className="mt-1 text-xs">
                {!settled ? (
                  <span className="text-gray-500">Looking up…</span>
                ) : matchedAgmt ? (
                  <>
                    <span className="text-green-700">
                      Member: <span className="font-medium">{matchedAgmt.agreement?.member?.fullName ?? '—'}</span>
                      {' '}({matchedAgmt.membershipNo}) · {matchedProduct}
                    </span>
                    {productMismatch && (
                      <span className="block text-amber-600">
                        This is a {matchedProduct} agreement — set Product Type to {matchedProduct} to bill it.
                      </span>
                    )}
                  </>
                ) : agmtNotFound ? (
                  <span className="text-red-600">No agreement found for &quot;{genAgreementNo.trim()}&quot;.</span>
                ) : null}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">Bills schedules due on or before the end of the selected period. Invoice date = 1st of the period month.</p>
          {genResult && <p className="text-sm text-green-700 bg-green-50 rounded px-3 py-2">{genResult}</p>}
          {genSkipped.length > 0 && (
            <div className="text-xs bg-amber-50 border border-amber-200 rounded px-3 py-2">
              <p className="font-medium text-amber-800">Skipped {genSkipped.length} agreement(s):</p>
              <ul className="mt-1 max-h-40 overflow-y-auto space-y-0.5 text-amber-700">
                {genSkipped.map((s, i) => (
                  <li key={i}><span className="font-mono">{s.agreementNo}</span> ({s.membershipNo}) — {s.reason}</li>
                ))}
              </ul>
            </div>
          )}
          {genError && <p className="text-sm text-red-600">{genError}</p>}
          {confirmingBulk && !genResult && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              No agreement number entered — this will generate invoices for <span className="font-medium">ALL due {genProductType} agreements</span> for{' '}
              {genPeriod ? format(new Date(`${genPeriod}-01T00:00:00`), 'MMMM yyyy') : 'the current period'}. Are you sure?
            </p>
          )}
          <div className="flex gap-3">
            {confirmingBulk && !genResult ? (
              <>
                <Button onClick={() => genMut.mutate()} loading={genMut.isPending}>
                  <Zap className="h-4 w-4" /> Yes, generate all
                </Button>
                <Button variant="secondary" onClick={() => setConfirmingBulk(false)}>Back</Button>
              </>
            ) : (
              <>
            <Button
              onClick={() => { if (!genAgreementNo.trim()) { setConfirmingBulk(true); return; } genMut.mutate(); }}
              loading={genMut.isPending} disabled={!!genResult || agmtNotFound}>
              <Zap className="h-4 w-4" /> Generate
            </Button>
            <Button variant="secondary" onClick={() => setGenModal(false)}>Close</Button>
              </>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
