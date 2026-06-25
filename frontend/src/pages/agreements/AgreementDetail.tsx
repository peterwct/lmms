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
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold font-mono">{agmt.agreementNo}</h2>
            <ProductBadge coCode={agmt.coCode} />
            <AgreementStatusBadge status={agmt.acctClassify} />
            {agmt.acctClassify !== 'NA' && (agmt.statusChangeDate || agmt.statusChangeUser) && (
              <span className="text-xs text-gray-500">
                {agmt.statusChangeDate && format(new Date(agmt.statusChangeDate), 'dd/MM/yyyy')}
                {agmt.statusChangeUser && ` by ${agmt.statusChangeUser}`}
              </span>
            )}
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
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            {(() => {
              const sellPrice = parseFloat(agmt.purchasePrice ?? '0') || 0;
              const subFees   = parseFloat(agmt.subFees       ?? '0') || 0;
              const sinkFund  = parseFloat(agmt.sinkFund      ?? '0') || 0;
              const govtTax   = parseFloat(agmt.govtTax       ?? '0') || 0;
              const netPrice  = sellPrice - subFees - sinkFund - govtTax;
              return ([
                ['Agreement date', format(new Date(agmt.agreementDate), 'dd/MM/yyyy')],
                ['End date', agmt.endDate ? format(new Date(agmt.endDate), 'dd/MM/yyyy') : '—'],
                ['Term', `${agmt.termYears} years`],
                ['Total points', agmt.totalPoints ?? '—'],
                ['Certificate No.', agmt.certificateNo || '—'],
                ['Purchase Price', fmtRM(netPrice || null)],
                ['Loan Type', agmt.loanType ? `${agmt.loanType} — ${LOAN_TYPE_LABEL[agmt.loanType] ?? agmt.loanType}` : '—'],
                ['Loan Amount', fmtRM(agmt.loanAmount)],
                ['Sales branch', agmt.salesBranch || '—'],
                ['Salesperson', '—'],
              ] as [string, string | number | undefined][]).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-gray-500 uppercase tracking-wide">{k}</dt><dd className="mt-0.5 font-medium">{String(v ?? '—')}</dd></div>
              ));
            })()}
            {agmt.transferFlag === 'TT' && agmt.transferToMembership && (
              <div className="col-span-full">
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Transferred To</dt>
                <dd className="mt-0.5 font-medium">
                  {agmt.transferToMemberId ? (
                    <Link to={`/members/${agmt.transferToMemberId}`} className="text-blue-600 hover:underline">{agmt.transferToMembership}</Link>
                  ) : (
                    <span>{agmt.transferToMembership}</span>
                  )}
                  {agmt.transferToMemberName && ` — ${agmt.transferToMemberName}`}
                  {agmt.transferToDate && <span className="ml-3 text-sm text-gray-500">on {format(new Date(agmt.transferToDate), 'dd/MM/yyyy')}</span>}
                  {agmt.transferToUser && <span className="ml-2 text-sm text-gray-500">by {agmt.transferToUser}</span>}
                </dd>
              </div>
            )}
            {agmt.transferFromMembership && (
              <div className="col-span-full">
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Transferred From</dt>
                <dd className="mt-0.5 font-medium">
                  {agmt.transferFromMemberId ? (
                    <Link to={`/members/${agmt.transferFromMemberId}`} className="text-blue-600 hover:underline">{agmt.transferFromMembership}</Link>
                  ) : (
                    <span>{agmt.transferFromMembership}</span>
                  )}
                  {agmt.transferFromMemberName && ` — ${agmt.transferFromMemberName}`}
                  {agmt.transferDate && <span className="ml-3 text-sm text-gray-500">on {format(new Date(agmt.transferDate), 'dd/MM/yyyy')}</span>}
                  {agmt.transferUser && <span className="ml-2 text-sm text-gray-500">by {agmt.transferUser}</span>}
                </dd>
              </div>
            )}
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
            {agmt.acctClassify !== 'NA' && agmt.statusChangeDate && (
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Status change date</dt>
                <dd className="mt-0.5 font-medium">{format(new Date(agmt.statusChangeDate), 'dd/MM/yyyy')}</dd>
              </div>
            )}
            {agmt.acctClassify !== 'NA' && agmt.statusChangeUser && (
              <div>
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Status changed by</dt>
                <dd className="mt-0.5 font-medium">{agmt.statusChangeUser}</dd>
              </div>
            )}
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
            <div className="space-y-4">
              {agmt.nominees.map(n => (
                <div key={n.id}>
                  <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Nominee {n.nomineeSeq}</p>
                  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                    <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Salutation</dt><dd className="mt-0.5 font-medium">{n.salutation || '—'}</dd></div>
                    <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Full Name</dt><dd className="mt-0.5 font-medium">{n.fullName || '—'}</dd></div>
                    <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Name Card</dt><dd className="mt-0.5 font-medium">{n.nameCard || '—'}</dd></div>
                    <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Designation</dt><dd className="mt-0.5 font-medium">{n.designation || '—'}</dd></div>
                    <div><dt className="text-xs text-gray-500 uppercase tracking-wide">IC (New)</dt><dd className="mt-0.5 font-medium">{n.icNew || '—'}</dd></div>
                    <div><dt className="text-xs text-gray-500 uppercase tracking-wide">IC (Old)</dt><dd className="mt-0.5 font-medium">{n.icOld || '—'}</dd></div>
                    <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Home Tel.</dt><dd className="mt-0.5 font-medium">{n.telHome || '—'}</dd></div>
                    <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Mobile</dt><dd className="mt-0.5 font-medium">{n.telMobile || '—'}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-xs text-gray-500 uppercase tracking-wide">Email</dt><dd className="mt-0.5 font-medium">{n.email || '—'}</dd></div>
                    {(n.add1 || n.add2 || n.add3) && (
                      <div className="sm:col-span-4"><dt className="text-xs text-gray-500 uppercase tracking-wide">Address</dt><dd className="mt-0.5 font-medium">{[n.add1, n.add2, n.add3, n.cityState, n.postcode].filter(Boolean).join(', ')}</dd></div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-gray-400">No nominees on record.</p>}
        </CardBody>
      </Card>

      {/* ── RCI Info ───────────────────────────────────────────── */}
      {(agmt.rciRefNo || agmt.rciNominee || agmt.rciEnrolDate || agmt.rciExpiryDate) && (
        <Card>
          <CardHeader><p className="font-semibold text-gray-700">RCI Information</p></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              <div><dt className="text-xs text-gray-500 uppercase tracking-wide">RCI ID</dt><dd className="mt-0.5 font-medium">{agmt.rciRefNo || '—'}</dd></div>
              <div><dt className="text-xs text-gray-500 uppercase tracking-wide">RCI Nominee</dt><dd className="mt-0.5 font-medium">{agmt.rciNominee || '—'}</dd></div>
              <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Joint Date</dt><dd className="mt-0.5 font-medium">{agmt.rciEnrolDate ? format(new Date(agmt.rciEnrolDate), 'dd/MM/yyyy') : '—'}</dd></div>
              <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Expiry Date</dt><dd className="mt-0.5 font-medium">{agmt.rciExpiryDate ? format(new Date(agmt.rciExpiryDate), 'dd/MM/yyyy') : '—'}</dd></div>
            </dl>
          </CardBody>
        </Card>
      )}

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
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
              {([
                ['Certificate No.',  agmt.pbsScheme.certNo   || '—'],
                ['Payback Scheme',   agmt.pbsScheme.schemeType || '—'],
                ['Payback Date',     agmt.pbsScheme.paybackDate ? format(new Date(agmt.pbsScheme.paybackDate), 'dd/MM/yyyy') : '—'],
                ['Top Up Case',      agmt.pbsScheme.topUp   ? 'Yes' : 'No'],
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

      <Modal open={nomModal} title="Edit Nominees" size="xl" onClose={() => { setNomModal(false); setNomError(''); }}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            {[0, 1].map(i => {
              const setField = (field: string, upper = true) =>
                (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
                  setNominees(n => n.map((r, idx) => idx === i ? { ...r, [field]: upper ? e.target.value.toUpperCase() : e.target.value } : r));
              return (
                <div key={i} className="space-y-3">
                  <p className="text-sm font-semibold text-gray-600">Nominee {i + 1}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Salutation" value={nominees[i]?.salutation ?? ''} onChange={setField('salutation')}>
                      <option value="">—</option>
                      {['MR', 'MRS', 'MS', 'DR', 'DATO', "DATO'", 'TAN SRI', 'PUAN SRI', 'ENCIK', 'PUAN', 'CIK'].map(s => <option key={s}>{s}</option>)}
                    </Select>
                    <Input label="Full name" value={nominees[i]?.fullName ?? ''} onChange={setField('fullName')} />
                    <Input label="Name card" value={nominees[i]?.nameCard ?? ''} onChange={setField('nameCard')} />
                    <Input label="Designation" value={nominees[i]?.designation ?? ''} onChange={setField('designation')} />
                    <Input label="IC (New)" value={nominees[i]?.icNew ?? ''} onChange={setField('icNew')} />
                    <Input label="IC (Old)" value={nominees[i]?.icOld ?? ''} onChange={setField('icOld')} />
                    <Input label="Home tel." value={nominees[i]?.telHome ?? ''} onChange={setField('telHome')} />
                    <Input label="Mobile" value={nominees[i]?.telMobile ?? ''} onChange={setField('telMobile')} />
                    <Input label="Email" value={nominees[i]?.email ?? ''} onChange={setField('email', false)} />
                    <Input label="Address 1" value={nominees[i]?.add1 ?? ''} onChange={setField('add1')} />
                    <Input label="Address 2" value={nominees[i]?.add2 ?? ''} onChange={setField('add2')} />
                    <Input label="Address 3" value={nominees[i]?.add3 ?? ''} onChange={setField('add3')} />
                    <Input label="City / State" value={nominees[i]?.cityState ?? ''} onChange={setField('cityState')} />
                    <Input label="Postcode" value={nominees[i]?.postcode ?? ''} onChange={setField('postcode')} />
                  </div>
                </div>
              );
            })}
          </div>
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
