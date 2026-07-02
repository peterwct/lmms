import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { agreementsApi } from '../../api/agreements';
import { cancellationReasonsApi } from '../../api/cancellationReasons';
import { suReasonsApi } from '../../api/suReasons';
import { apiError } from '../../api/client';
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
import { allowedNewStatuses, canEditNomineesRci } from '../../lib/agreementAuth';
import { format } from 'date-fns';

const STATUS_LABEL: Record<AgreementStatus, string> = {
  NA: 'NA — Active', SU: 'SU — Suspended', PT: 'PT — Pending Termination', TM: 'TM — Terminated',
};

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
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [statusModal, setStatusModal] = useState(false);
  const [nomModal, setNomModal] = useState(false);
  const [newStatus, setNewStatus] = useState<AgreementStatus>('NA');
  const [reasonCode, setReasonCode] = useState('');
  const [statusError, setStatusError] = useState('');
  const [nominees, setNominees] = useState<Array<Record<string, string>>>([{}, {}, {}]);
  const [rciModal, setRciModal] = useState(false);
  const [rciForm, setRciForm] = useState<Record<string, string>>({});

  const { data: agmt, isLoading } = useQuery<Agreement>({
    queryKey: ['agreement', id],
    queryFn: () => agreementsApi.get(id!).then(r => r.data.data),
  });

  const { data: cancellationReasons } = useQuery({
    queryKey: ['cancellation-reasons'],
    queryFn: () => cancellationReasonsApi.list().then(r => r.data.data),
    enabled: statusModal,
  });

  const { data: suReasons } = useQuery({
    queryKey: ['su-reasons'],
    queryFn: () => suReasonsApi.list().then(r => r.data.data),
    enabled: statusModal,
  });

  // New status -> which reason list applies (NA has none)
  const reasonOptions = newStatus === 'SU' ? suReasons : newStatus === 'PT' || newStatus === 'TM' ? cancellationReasons : undefined;

  function handleStatusChange(s: AgreementStatus) {
    setNewStatus(s);
    setStatusError('');
    // Pre-fill with the agreement's existing reason only if it still applies to the newly picked status
    if (s === 'SU') setReasonCode(s === agmt?.acctClassify ? (agmt?.suCode ?? '') : '');
    else if (s === 'PT' || s === 'TM') setReasonCode(s === agmt?.acctClassify ? (agmt?.canCode ?? '') : '');
    else setReasonCode('');
  }

  useEffect(() => {
    if (agmt) {
      setNewStatus(agmt.acctClassify);
      setReasonCode(agmt.acctClassify === 'SU' ? (agmt.suCode ?? '') : agmt.acctClassify === 'PT' || agmt.acctClassify === 'TM' ? (agmt.canCode ?? '') : '');
      // Always keep exactly 3 slots; find by nomineeSeq so seq-1/2/3 land in the right index
      const toStr = (n: object | undefined): Record<string, string> =>
        n ? Object.fromEntries(Object.entries(n).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)])) : {};
      const n1 = agmt.nominees?.find(n => n.nomineeSeq === 1);
      const n2 = agmt.nominees?.find(n => n.nomineeSeq === 2);
      const n3 = agmt.nominees?.find(n => n.nomineeSeq === 3);
      setNominees([toStr(n1), toStr(n2), toStr(n3)]);
      setRciForm({
        rciRefNo: agmt.rciRefNo ?? '',
        rciNominee: agmt.rciNominee ?? '',
        rciEnrolDate: agmt.rciEnrolDate ? agmt.rciEnrolDate.slice(0, 10) : '',
        rciExpiryDate: agmt.rciExpiryDate ? agmt.rciExpiryDate.slice(0, 10) : '',
      });
    }
  }, [agmt]);

  const statusMut = useMutation({
    mutationFn: () => agreementsApi.changeStatus(id!, newStatus, newStatus === 'NA' ? null : reasonCode),
    onSuccess: () => { setStatusModal(false); setStatusError(''); qc.invalidateQueries({ queryKey: ['agreement', id] }); },
    onError: (err: unknown) => setStatusError(apiError(err)),
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

  const [rciError, setRciError] = useState('');

  const rciMut = useMutation({
    mutationFn: () => {
      const DATE_FIELDS = new Set(['rciEnrolDate', 'rciExpiryDate']);
      const payload: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rciForm)) {
        if (DATE_FIELDS.has(k)) { payload[k] = v.trim() === '' ? null : `${v}T00:00:00.000Z`; continue; }
        payload[k] = v.trim() === '' ? null : v.trim();
      }
      return agreementsApi.update(id!, payload);
    },
    onSuccess: () => { setRciError(''); setRciModal(false); qc.invalidateQueries({ queryKey: ['agreement', id] }); },
    onError: (err: unknown) => setRciError(apiError(err)),
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
        {allowedNewStatuses(user, agmt.acctClassify).length > 0 && (
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
                ['Salesperson', agmt.salespersonName || '—'],
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
            {agmt.acctClassify === 'SU' && agmt.suReason && (
              <div className="col-span-full">
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Suspension Reason</dt>
                <dd className="mt-0.5 font-medium">
                  {agmt.suCode} — {agmt.suReason.description}
                </dd>
              </div>
            )}
            {agmt.acctClassify === 'PT' && agmt.cancellationReason && (
              <div className="col-span-full">
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Pending Termination Reason</dt>
                <dd className="mt-0.5 font-medium">
                  {agmt.canCode} — {agmt.cancellationReason.description}
                </dd>
              </div>
            )}
            {agmt.acctClassify === 'TM' && agmt.cancellationReason && (
              <div className="col-span-full">
                <dt className="text-xs text-gray-500 uppercase tracking-wide">Termination / Cancellation reason</dt>
                <dd className="mt-0.5 font-medium">
                  {agmt.canCode} — {agmt.cancellationReason.description}
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
          {canEditNomineesRci(user) && (
            <Button variant="secondary" size="sm" onClick={() => setNomModal(true)}>
              {agmt.nominees?.length ? 'Edit nominees' : 'Add nominees'}
            </Button>
          )}
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
      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="font-semibold text-gray-700">RCI Information</p>
          {canEditNomineesRci(user) && (
            <Button variant="secondary" size="sm" onClick={() => setRciModal(true)}>
              {(agmt.rciRefNo || agmt.rciNominee || agmt.rciEnrolDate || agmt.rciExpiryDate) ? 'Edit RCI info' : 'Add RCI info'}
            </Button>
          )}
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
            <div><dt className="text-xs text-gray-500 uppercase tracking-wide">RCI ID</dt><dd className="mt-0.5 font-medium">{agmt.rciRefNo || '—'}</dd></div>
            <div><dt className="text-xs text-gray-500 uppercase tracking-wide">RCI Nominee</dt><dd className="mt-0.5 font-medium">{agmt.rciNominee || '—'}</dd></div>
            <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Joint Date</dt><dd className="mt-0.5 font-medium">{agmt.rciEnrolDate ? format(new Date(agmt.rciEnrolDate), 'dd/MM/yyyy') : '—'}</dd></div>
            <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Expiry Date</dt><dd className="mt-0.5 font-medium">{agmt.rciExpiryDate ? format(new Date(agmt.rciExpiryDate), 'dd/MM/yyyy') : '—'}</dd></div>
          </dl>
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

      <Modal open={statusModal} title="Change Agreement Status" onClose={() => { setStatusModal(false); setStatusError(''); }}>
        <div className="space-y-4">
          <Select label="New status" value={newStatus} onChange={e => handleStatusChange(e.target.value as AgreementStatus)}>
            {allowedNewStatuses(user, agmt.acctClassify).map(s => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </Select>
          <p className="text-xs text-gray-500">SU/PT/TM stops AMC billing. Reverting to NA re-opens it.</p>
          {newStatus !== 'NA' && (
            <Select
              label={newStatus === 'SU' ? 'Suspension reason' : 'Termination / Cancellation reason'}
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
            >
              <option value="">— Select a reason —</option>
              {reasonOptions?.map(r => (
                <option key={r.code} value={r.code}>{r.code} — {r.description}</option>
              ))}
            </Select>
          )}
          {statusError && <p className="text-sm text-red-600">{statusError}</p>}
          <div className="flex gap-3">
            <Button
              onClick={() => {
                if (newStatus !== 'NA' && !reasonCode) { setStatusError('Please select a reason.'); return; }
                statusMut.mutate();
              }}
              loading={statusMut.isPending}
            >
              Save
            </Button>
            <Button variant="secondary" onClick={() => { setStatusModal(false); setStatusError(''); }}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal open={nomModal} title="Edit Nominees" size="xl" onClose={() => { setNomModal(false); setNomError(''); }}>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-6">
            {[0, 1, 2].map(i => {
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

      <Modal open={rciModal} title="Edit RCI Information" onClose={() => { setRciModal(false); setRciError(''); }}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="RCI ID" value={rciForm.rciRefNo ?? ''}
              onChange={e => setRciForm(f => ({ ...f, rciRefNo: e.target.value.toUpperCase() }))} />
            <Input label="RCI Nominee" value={rciForm.rciNominee ?? ''}
              onChange={e => setRciForm(f => ({ ...f, rciNominee: e.target.value.toUpperCase() }))} />
            <Input label="Joint Date" type="date" value={rciForm.rciEnrolDate ?? ''}
              onChange={e => setRciForm(f => ({ ...f, rciEnrolDate: e.target.value }))} />
            <Input label="Expiry Date" type="date" value={rciForm.rciExpiryDate ?? ''}
              onChange={e => setRciForm(f => ({ ...f, rciExpiryDate: e.target.value }))} />
          </div>
          {rciError && <p className="text-sm text-red-600">{rciError}</p>}
          <div className="flex gap-3">
            <Button onClick={() => rciMut.mutate()} loading={rciMut.isPending}>Save</Button>
            <Button variant="secondary" onClick={() => { setRciModal(false); setRciError(''); }}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
