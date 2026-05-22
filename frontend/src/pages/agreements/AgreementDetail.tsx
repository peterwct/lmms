import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agreementsApi } from '../../api/agreements';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { Input } from '../../components/ui/Input';
import { PageSpinner } from '../../components/ui/Spinner';
import { AgreementStatusBadge } from '../../components/AgreementStatusBadge';
import { ProductBadge } from '../../components/ProductBadge';
import type { Agreement, AgreementStatus } from '../../types';
import { format } from 'date-fns';

const INV_COMPONENT_LABEL: Record<string, string> = {
  MAIN_AMC: 'AMC', SINKING_FUND: 'Sinking Fund', SERVICE_TAX: 'Service Tax', ROUNDING: 'Rounding',
};

const LOAN_TYPE_LABEL: Record<string, string> = {
  I: 'In-House', L: 'Loan', C: 'Contra', F: 'Full Settlement',
};

function fmtRM(val: string | number | undefined | null) {
  const n = parseFloat(String(val ?? ''));
  return isNaN(n) || n === 0 ? '—' : `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function AgreementDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusModal, setStatusModal] = useState(false);
  const [nomModal, setNomModal] = useState(false);
  const [newStatus, setNewStatus] = useState<AgreementStatus>('NA');
  const [nominees, setNominees] = useState<Array<Record<string, string>>>([{}, {}]);

  const { data: agmt, isLoading } = useQuery<Agreement>({
    queryKey: ['agreement', id],
    queryFn: () => agreementsApi.get(id!).then(r => r.data.data),
  });

  useEffect(() => {
    if (agmt) {
      setNewStatus(agmt.acctClassify);
      // Always keep exactly 2 slots; find by nomineeSeq so seq-1 and seq-2 land in the right index
      const toStr = (n: object | undefined): Record<string, string> =>
        n ? Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])) : {};
      const n1 = agmt.nominees?.find(n => n.nomineeSeq === 1);
      const n2 = agmt.nominees?.find(n => n.nomineeSeq === 2);
      setNominees([toStr(n1), toStr(n2)]);
    }
  }, [agmt]);

  const statusMut = useMutation({
    mutationFn: (s: AgreementStatus) => agreementsApi.changeStatus(id!, s),
    onSuccess: () => { setStatusModal(false); qc.invalidateQueries({ queryKey: ['agreement', id] }); },
  });

  const [nomError, setNomError] = useState('');

  const nomMut = useMutation({
    mutationFn: () => {
      // Convert empty strings → null so backend email/optional validation passes
      const clean = (n: Record<string, string>) =>
        Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()]));

      const payload = nominees
        .map((n, i) => ({ ...clean(n), nomineeSeq: i + 1 }))
        .filter((_, i) => nominees[i]?.fullName?.trim());

      if (!payload.length) throw new Error('Please enter at least one nominee name.');
      return agreementsApi.updateNominees(id!, payload);
    },
    onSuccess: () => { setNomError(''); setNomModal(false); qc.invalidateQueries({ queryKey: ['agreement', id] }); },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Save failed. Please try again.';
      setNomError(msg);
    },
  });

  if (isLoading) return <PageSpinner />;
  if (!agmt) return <p className="text-gray-500">Agreement not found.</p>;

  const invoicesByYear = new Map<number, typeof agmt.amcInvoices>();
  agmt.amcInvoices?.forEach(inv => {
    const y = inv.invoiceYearSeq ?? 0;
    if (!invoicesByYear.has(y)) invoicesByYear.set(y, []);
    invoicesByYear.get(y)!.push(inv);
  });

  return (
    <div className="space-y-5 max-w-4xl">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold font-mono">{agmt.agreementNo}</h2>
            <ProductBadge coCode={agmt.coCode} />
            <AgreementStatusBadge status={agmt.acctClassify} />
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Member: <Link to={`/members/${agmt.memberId}`} className="text-blue-600 hover:underline">
              {agmt.member?.membershipNo} — {agmt.member?.fullName}
            </Link>
          </p>
        </div>
        {canEdit('AGREEMENTS') && (
          <Button variant="secondary" size="sm" onClick={() => setStatusModal(true)}>Change status</Button>
        )}
      </div>

      <Card>
        <CardHeader><p className="font-semibold text-gray-700">Agreement Details</p></CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {([
              ['Agreement date', format(new Date(agmt.agreementDate), 'dd/MM/yyyy')],
              ['End date', agmt.endDate ? format(new Date(agmt.endDate), 'dd/MM/yyyy') : '—'],
              ['Term', `${agmt.termYears} years`],
              ['Entitlement', agmt.entitlementType === 'W' ? 'Week-based' : 'Points-based'],
              ['Total points', agmt.totalPoints ?? '—'],
              ['Sales branch', agmt.salesBranch || '—'],
              ['Certificate No.', agmt.certificateNo || '—'],
              ['RCI Ref.', agmt.rciRefNo || '—'],
              ['Outstanding doc.', agmt.outstdDoc ? 'Yes' : 'No'],
            ] as [string, string | number | undefined][]).map(([k, v]) => (
              <div key={k}><dt className="text-xs text-gray-500 uppercase tracking-wide">{k}</dt><dd className="mt-0.5 font-medium">{String(v ?? '—')}</dd></div>
            ))}
            {agmt.cancellationReason && (
              <div className="col-span-full">
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Termination / Cancellation reason</dt>
                <dd className="mt-0.5 font-medium">
                  {agmt.canCode} — {agmt.cancellationReason.description}
                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded font-semibold ${
                    agmt.cancellationReason.category === 'CC'
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {agmt.cancellationReason.category === 'CC' ? 'Cancellation' : 'Termination'}
                  </span>
                </dd>
              </div>
            )}
            {/* ── Financial fields ── */}
            {(() => {
              const sellPrice = parseFloat(agmt.purchasePrice ?? '0') || 0;
              const subFees   = parseFloat(agmt.subFees       ?? '0') || 0;
              const sinkFund  = parseFloat(agmt.sinkFund      ?? '0') || 0;
              const govtTax   = parseFloat(agmt.govtTax       ?? '0') || 0;
              const netPrice  = sellPrice - subFees - sinkFund - govtTax;
              return (<>
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wide">Purchase Price</dt>
                  <dd className="mt-0.5 font-medium">{fmtRM(netPrice || null)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wide">Loan Type</dt>
                  <dd className="mt-0.5 font-medium">
                    {agmt.loanType ? `${agmt.loanType} — ${LOAN_TYPE_LABEL[agmt.loanType] ?? agmt.loanType}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500 uppercase tracking-wide">Loan Amount</dt>
                  <dd className="mt-0.5 font-medium">{fmtRM(agmt.loanAmount)}</dd>
                </div>
              </>);
            })()}
          </dl>
        </CardBody>
      </Card>

      {/* ── Nominees ────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="font-semibold text-gray-700">Nominees</p>
          {canEdit('AGREEMENTS') && <Button variant="secondary" size="sm" onClick={() => setNomModal(true)}>Edit nominees</Button>}
        </CardHeader>
        <CardBody>
          {agmt.nominees?.length ? (
            <div className="space-y-2">
              {agmt.nominees.map(n => (
                <div key={n.id} className="text-sm">
                  <span className="text-gray-500">Nominee {n.nomineeSeq}:</span>{' '}
                  <span className="font-medium">{n.fullName || '—'}</span>
                  {n.designation && <span className="text-gray-500 ml-2">· {n.designation}</span>}
                  {n.icNew && <span className="text-gray-500 ml-2">({n.icNew})</span>}
                  {n.email && <span className="text-gray-500 ml-2">· {n.email}</span>}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">No nominees on record.</p>}
        </CardBody>
      </Card>

      {/* ── AMC Summary ─────────────────────────────────────────── */}
      {agmt.amcSchedule && (
        <Card>
          <CardHeader><p className="font-semibold text-gray-700">Annual Maintenance Charges</p></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm">
              {([
                ['AMC Billed',   String(agmt.amcSchedule.invoicesIssued)],
                ['Total AMC',    String(agmt.amcSchedule.totalInvoices)],
                ['AMC Next Due', agmt.amcSchedule.nextDueDate ? format(new Date(agmt.amcSchedule.nextDueDate), 'dd/MM/yyyy') : '—'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-gray-500 uppercase tracking-wide">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
              ))}
            </dl>
          </CardBody>
        </Card>
      )}

      {/* ── Payback Scheme (PBS) ────────────────────────────────── */}
      {agmt.pbsScheme && (
        <Card>
          <CardHeader>
            <p className="font-semibold text-gray-700">
              Zurich Payback Scheme
              <span className={`ml-2 inline-block px-2 py-0.5 rounded text-xs font-bold ${
                agmt.pbsScheme.claimIndc
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {agmt.pbsScheme.claimIndc ? 'Claimed' : 'Not Claimed'}
              </span>
            </p>
          </CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
              {([
                ['Certificate No.',  agmt.pbsScheme.certNo   || '—'],
                ['Payback Scheme',   agmt.pbsScheme.schemeType || '—'],
                ['Payback Date',     agmt.pbsScheme.paybackDate ? format(new Date(agmt.pbsScheme.paybackDate), 'dd/MM/yyyy') : '—'],
                ['Top Up Case',      agmt.pbsScheme.topUp   ? 'Yes' : 'No'],
                ['PBS Indicator',    agmt.pbsScheme.pbsIndc ? 'Yes' : 'No'],
                ['Claimed',          agmt.pbsScheme.claimIndc ? 'Yes' : 'No'],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-gray-500 uppercase tracking-wide">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
              ))}
            </dl>
          </CardBody>
        </Card>
      )}

      {invoicesByYear.size > 0 && (
        <Card>
          <CardHeader><p className="font-semibold text-gray-700">Invoice History</p></CardHeader>
          <div className="divide-y">
            {[...invoicesByYear.entries()].sort(([a], [b]) => b - a).map(([yr, invs]) => {
              const total = invs!.reduce((s, i) => s + parseFloat(i.invAmount), 0);
              return (
                <div key={yr} className="px-5 py-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-500 uppercase">Year {yr}</span>
                    <span className="text-sm font-medium">RM {total.toFixed(2)}</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {invs!.map(inv => (
                      <div key={inv.id} className="rounded bg-gray-50 px-3 py-2 text-xs">
                        <p className="font-mono font-medium text-gray-700">{inv.invNo}</p>
                        <p className="text-gray-500">{INV_COMPONENT_LABEL[inv.invComponent]}</p>
                        <p className="font-semibold mt-0.5">RM {parseFloat(inv.invAmount).toFixed(2)}</p>
                        <Link to={`/amc/invoices/${inv.id}`} className="text-blue-600 hover:underline">View →</Link>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Modal open={statusModal} title="Change Agreement Status" onClose={() => setStatusModal(false)}>
        <div className="space-y-4">
          <Select label="New status" value={newStatus} onChange={e => setNewStatus(e.target.value as AgreementStatus)}>
            <option value="NA">NA — Active</option>
            <option value="SU">SU — Suspended</option>
            <option value="PT">PT — Pending Termination</option>
            <option value="TM">TM — Terminated</option>
          </Select>
          <p className="text-xs text-gray-500">SU/PT/TM stops AMC billing. Reverting to NA re-opens it.</p>
          <div className="flex gap-3">
            <Button onClick={() => statusMut.mutate(newStatus)} loading={statusMut.isPending}>Save</Button>
            <Button variant="secondary" onClick={() => setStatusModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal open={nomModal} title="Edit Nominees" onClose={() => { setNomModal(false); setNomError(''); }}>
        <div className="space-y-5">
          {[0, 1].map(i => (
            <div key={i} className="space-y-3">
              <p className="text-sm font-semibold text-gray-600">Nominee {i + 1}</p>
              <Input label="Full name" value={nominees[i]?.fullName ?? ''} onChange={e => setNominees(n => n.map((r, idx) => idx === i ? { ...r, fullName: e.target.value } : r))} />
              <Input label="IC (New)" value={nominees[i]?.icNew ?? ''} onChange={e => setNominees(n => n.map((r, idx) => idx === i ? { ...r, icNew: e.target.value } : r))} />
              <Input label="Email" type="email" value={nominees[i]?.email ?? ''} onChange={e => setNominees(n => n.map((r, idx) => idx === i ? { ...r, email: e.target.value } : r))} />
            </div>
          ))}
          {nomError && <p className="text-sm text-red-600">{nomError}</p>}
          <div className="flex gap-3">
            <Button onClick={() => nomMut.mutate()} loading={nomMut.isPending}>Save nominees</Button>
            <Button variant="secondary" onClick={() => { setNomModal(false); setNomError(''); }}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
