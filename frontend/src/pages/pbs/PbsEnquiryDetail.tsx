import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pbsApi } from '../../api/pbs';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { PageSpinner } from '../../components/ui/Spinner';
import { AgreementStatusBadge } from '../../components/AgreementStatusBadge';
import { ProductBadge } from '../../components/ProductBadge';
import type { PbsScheme, PbsClaim } from '../../types';
import { format } from 'date-fns';

const RELATION_LABEL: Record<string, string> = {
  '00': 'Self', '01': 'Spouse', '02': 'Children', '03': 'Siblings', '99': 'Others',
};

const CLAIM_TYPE_LABEL: Record<string, string> = {
  AD: 'Accidental Death', TPD: 'Total Permanent Disability',
  ND: 'Natural Death', PBS: 'Group Payback Scheme Rider',
};

function fmtRM(val: string | number | undefined | null) {
  const n = parseFloat(String(val ?? ''));
  return isNaN(n) || n === 0 ? '—' : `RM ${n.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string | undefined | null) {
  if (!d) return '—';
  return format(new Date(d), 'dd/MM/yyyy');
}

function toDateInput(d: string | undefined | null) {
  if (!d) return '';
  return format(new Date(d), 'yyyy-MM-dd');
}

const emptyClaim: Record<string, string> = {
  claimant: '', claimantIc: '', accNo: '', bankCode: '', relationCode: '',
  remark: '', lossDate: '', claimAmt: '', payMode: '', docNo: '', docDate: '',
  claimType: '', claimRemark: '', trustPaidDate: '',
};

export function PbsEnquiryDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit, canCreate, canDelete } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // PBS edit modal state
  const [editModal, setEditModal] = useState(false);
  const [editForm, setEditForm] = useState({
    certNo: '', schemeType: '', paybackDate: '',
    topUp: false, pbsIndc: false, claimIndc: false, remark: '',
  });

  // Claim modal state
  const [claimModal, setClaimModal] = useState(false);
  const [claimForm, setClaimForm] = useState<Record<string, string>>({ ...emptyClaim });
  const [editingClaimId, setEditingClaimId] = useState<string | null>(null);
  const [claimError, setClaimError] = useState('');

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: pbs, isLoading } = useQuery<PbsScheme>({
    queryKey: ['pbs-scheme', id],
    queryFn: () => pbsApi.get(id!).then(r => r.data.data),
  });

  useEffect(() => {
    if (pbs) {
      setEditForm({
        certNo: pbs.certNo ?? '',
        schemeType: pbs.schemeType ?? '',
        paybackDate: toDateInput(pbs.paybackDate),
        topUp: pbs.topUp,
        pbsIndc: pbs.pbsIndc,
        claimIndc: pbs.claimIndc,
        remark: pbs.remark ?? '',
      });
    }
  }, [pbs]);

  // ── Mutations ──────────────────────────────────────────────────

  const updateMut = useMutation({
    mutationFn: () => pbsApi.update(id!, {
      certNo: editForm.certNo || null,
      schemeType: editForm.schemeType || null,
      paybackDate: editForm.paybackDate ? new Date(editForm.paybackDate).toISOString() : null,
      topUp: editForm.topUp,
      pbsIndc: editForm.pbsIndc,
      claimIndc: editForm.claimIndc,
      remark: editForm.remark || null,
    }),
    onSuccess: () => { setEditModal(false); qc.invalidateQueries({ queryKey: ['pbs-scheme', id] }); },
  });

  const claimSaveMut = useMutation({
    mutationFn: () => {
      const amt = parseFloat(claimForm.claimAmt);
      if (isNaN(amt)) throw new Error('Claim amount is required.');
      const payload: Record<string, unknown> = {
        claimant: claimForm.claimant || null,
        claimantIc: claimForm.claimantIc || null,
        accNo: claimForm.accNo || null,
        bankCode: claimForm.bankCode || null,
        relationCode: claimForm.relationCode || null,
        remark: claimForm.remark || null,
        lossDate: claimForm.lossDate ? new Date(claimForm.lossDate).toISOString() : null,
        claimAmt: amt,
        payMode: claimForm.payMode || null,
        docNo: claimForm.docNo || null,
        docDate: claimForm.docDate ? new Date(claimForm.docDate).toISOString() : null,
        claimType: claimForm.claimType || null,
        claimRemark: claimForm.claimRemark || null,
        trustPaidDate: claimForm.trustPaidDate ? new Date(claimForm.trustPaidDate).toISOString() : null,
      };
      if (editingClaimId) return pbsApi.updateClaim(id!, editingClaimId, payload);
      return pbsApi.createClaim(id!, payload);
    },
    onSuccess: () => {
      setClaimModal(false); setClaimError(''); setEditingClaimId(null);
      qc.invalidateQueries({ queryKey: ['pbs-scheme', id] });
    },
    onError: (err: unknown) => {
      setClaimError(err instanceof Error ? err.message : 'Save failed.');
    },
  });

  const deleteMut = useMutation({
    mutationFn: (claimId: string) => pbsApi.deleteClaim(id!, claimId),
    onSuccess: () => { setDeleteId(null); qc.invalidateQueries({ queryKey: ['pbs-scheme', id] }); },
  });

  // ── Handlers ───────────────────────────────────────────────────

  const openAddClaim = () => {
    setEditingClaimId(null);
    setClaimForm({ ...emptyClaim });
    setClaimError('');
    setClaimModal(true);
  };

  const openEditClaim = (c: PbsClaim) => {
    setEditingClaimId(c.id);
    setClaimForm({
      claimant: c.claimant ?? '', claimantIc: c.claimantIc ?? '',
      accNo: c.accNo ?? '', bankCode: c.bankCode ?? '', relationCode: c.relationCode ?? '',
      remark: c.remark ?? '', lossDate: toDateInput(c.lossDate),
      claimAmt: String(c.claimAmt ?? ''), payMode: c.payMode ?? '',
      docNo: c.docNo ?? '', docDate: toDateInput(c.docDate),
      claimType: c.claimType ?? '', claimRemark: c.claimRemark ?? '',
      trustPaidDate: toDateInput(c.trustPaidDate),
    });
    setClaimError('');
    setClaimModal(true);
  };

  const setU = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setClaimForm(f => ({ ...f, [field]: e.target.value.toUpperCase() }));

  const setV = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setClaimForm(f => ({ ...f, [field]: e.target.value }));

  // ── Render ─────────────────────────────────────────────────────

  if (isLoading) return <PageSpinner />;
  if (!pbs) return <p className="text-gray-500">PBS scheme not found.</p>;

  const agmt = pbs.agreement;

  return (
    <div className="space-y-5 max-w-4xl">
      <button onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </button>

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold font-mono">{pbs.agreementNo}</h2>
            <ProductBadge coCode={pbs.coCode} />
            {agmt?.acctClassify && <AgreementStatusBadge status={agmt.acctClassify} />}
            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
              pbs.claimIndc ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
            }`}>
              {pbs.claimIndc ? 'Claimed' : 'Not Claimed'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            Member:{' '}
            {agmt?.member?.id ? (
              <Link to={`/members/${agmt.member.id}`} className="text-blue-600 hover:underline">
                {agmt.membershipNo} — {agmt.member.fullName}
              </Link>
            ) : (
              <span>{agmt?.membershipNo}</span>
            )}
          </p>
        </div>
      </div>

      {/* ── PBS Scheme Details ────────────────────────────────── */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="font-semibold text-gray-700">PBS Scheme Details</p>
          <div className="flex gap-2">
            {canCreate('PBS_SCHEME') && pbs.pbsIndc && !pbs.claimIndc && (
              <Button variant="primary" size="sm" onClick={openAddClaim}>Add claim</Button>
            )}
            {canEdit('PBS_SCHEME') && (
              <Button variant="secondary" size="sm" onClick={() => setEditModal(true)}>Edit</Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3 text-sm">
            {([
              ['Certificate No.', pbs.certNo || '—'],
              ['Scheme Type', pbs.schemeType || '—'],
              ['Payback Date', fmtDate(pbs.paybackDate)],
              ['Top Up', pbs.topUp ? 'Yes' : 'No'],
              ['PBS Indicator', pbs.pbsIndc ? 'Yes' : 'No'],
              ['Claim Indicator', pbs.claimIndc ? 'Yes' : 'No'],
            ] as [string, string][]).map(([k, v]) => (
              <div key={k}><dt className="text-xs text-gray-500 uppercase tracking-wide">{k}</dt><dd className="mt-0.5 font-medium">{v}</dd></div>
            ))}
            <div className="col-span-full">
              <dt className="text-xs text-gray-500 uppercase tracking-wide">Remark</dt>
              <dd className="mt-0.5 font-medium">{pbs.remark || '—'}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {/* ── Card 3: Claims ───────────────────────────────────── */}
      {(pbs.claimIndc || (pbs.claims && pbs.claims.length > 0)) && (
      <Card>
        <CardHeader>
          <p className="font-semibold text-gray-700">Claims</p>
        </CardHeader>
        {pbs.claims && pbs.claims.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {pbs.claims.map(c => (
              <div key={c.id} className="px-5 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold uppercase text-gray-400">Claim #{c.refNo}</p>
                  {(canEdit('PBS_SCHEME') || canDelete('PBS_SCHEME')) && (
                    <div className="flex gap-2">
                      {canEdit('PBS_SCHEME') && (
                        <Button variant="secondary" size="sm" onClick={() => openEditClaim(c)}>Edit</Button>
                      )}
                      {canDelete('PBS_SCHEME') && (
                        <Button variant="danger" size="sm" onClick={() => setDeleteId(c.id)}>Delete</Button>
                      )}
                    </div>
                  )}
                </div>
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Claimant</dt><dd className="mt-0.5 font-medium">{c.claimant || '—'}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Claimant IC</dt><dd className="mt-0.5 font-medium font-mono">{c.claimantIc || '—'}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Claim Type</dt><dd className="mt-0.5 font-medium">{c.claimType ? `${c.claimType} - ${CLAIM_TYPE_LABEL[c.claimType] ?? c.claimType}` : '—'}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Claim Amount</dt><dd className="mt-0.5 font-medium">{fmtRM(c.claimAmt)}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Loss Date</dt><dd className="mt-0.5 font-medium">{fmtDate(c.lossDate)}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Pay Mode</dt><dd className="mt-0.5 font-medium">{c.payMode || '—'}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Doc No</dt><dd className="mt-0.5 font-medium">{c.docNo || '—'}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Doc Date</dt><dd className="mt-0.5 font-medium">{fmtDate(c.docDate)}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Trust Paid Date</dt><dd className="mt-0.5 font-medium">{fmtDate(c.trustPaidDate)}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Account No</dt><dd className="mt-0.5 font-medium">{c.accNo || '—'}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Bank Code</dt><dd className="mt-0.5 font-medium">{c.bankCode || '—'}</dd></div>
                  <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Relation</dt><dd className="mt-0.5 font-medium">{c.relationCode ? `${c.relationCode} - ${RELATION_LABEL[c.relationCode] ?? c.relationCode}` : '—'}</dd></div>
                </dl>
                {(c.remark || c.claimRemark) && (
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm mt-3">
                    {c.remark && <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Remark</dt><dd className="mt-0.5 font-medium">{c.remark}</dd></div>}
                    {c.claimRemark && <div><dt className="text-xs text-gray-500 uppercase tracking-wide">Claim Remark</dt><dd className="mt-0.5 font-medium">{c.claimRemark}</dd></div>}
                  </dl>
                )}
              </div>
            ))}
          </div>
        ) : (
          <CardBody>
            <p className="text-sm text-gray-400">No claims on record.</p>
          </CardBody>
        )}
      </Card>
      )}

      {/* ── Edit PBS Modal ──────────────────────────────────── */}
      <Modal open={editModal} title="Edit PBS Scheme" onClose={() => setEditModal(false)}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Certificate No." value={editForm.certNo}
              onChange={e => setEditForm(f => ({ ...f, certNo: e.target.value.toUpperCase() }))} />
            <Select label="Scheme Type" value={editForm.schemeType}
              onChange={e => setEditForm(f => ({ ...f, schemeType: e.target.value }))}>
              <option value="">—</option>
              <option value="19K">19K</option>
              <option value="21K">21K</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
            <textarea rows={2} value={editForm.remark}
              onChange={e => setEditForm(f => ({ ...f, remark: e.target.value }))}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex gap-3">
            <Button onClick={() => updateMut.mutate()} loading={updateMut.isPending}>Save</Button>
            <Button variant="secondary" onClick={() => setEditModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Add/Edit Claim Modal ────────────────────────────── */}
      <Modal open={claimModal} title={editingClaimId ? 'Edit Claim' : 'Add Claim'} onClose={() => { setClaimModal(false); setClaimError(''); }} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="Claimant" value={claimForm.claimant} onChange={setU('claimant')} />
            <Input label="Claimant IC" value={claimForm.claimantIc} onChange={setU('claimantIc')} />
            <Input label="Account No." value={claimForm.accNo} onChange={setU('accNo')} />
            <Input label="Bank Code" value={claimForm.bankCode} onChange={setU('bankCode')} />
            <Select label="Relation Code" value={claimForm.relationCode} onChange={e => setClaimForm(f => ({ ...f, relationCode: e.target.value }))}>
              <option value="">--</option>
              <option value="00">00 - Self</option>
              <option value="01">01 - Spouse</option>
              <option value="02">02 - Children</option>
              <option value="03">03 - Siblings</option>
              <option value="99">99 - Others</option>
            </Select>
            <Select label="Claim Type" value={claimForm.claimType} onChange={e => {
              const ct = e.target.value;
              const amt = ['AD', 'TPD', 'PBS'].includes(ct)
                ? (pbs.schemeType === '19K' ? '19000' : pbs.schemeType === '21K' ? '21000' : '')
                : ct === 'ND' ? '500' : '';
              const claimRemark = ct ? (CLAIM_TYPE_LABEL[ct] ?? '') : '';
              setClaimForm(f => ({ ...f, claimType: ct, claimAmt: amt, claimRemark }));
            }}>
              <option value="">--</option>
              <option value="AD">AD - Accidental Death</option>
              <option value="TPD">TPD - Total Permanent Disability</option>
              <option value="ND">ND - Natural Death</option>
              <option value="PBS">PBS - Group Payback Scheme Rider</option>
            </Select>
            <Input label="Loss Date" type="date" value={claimForm.lossDate} onChange={setV('lossDate')} />
            <Input label="Claim Amount (RM)" type="number" step="0.01" value={claimForm.claimAmt}
              onChange={setV('claimAmt')}
              readOnly={['AD', 'TPD', 'PBS'].includes(claimForm.claimType)} />
            <Select label="Pay Mode" value={claimForm.payMode} onChange={e => setClaimForm(f => ({ ...f, payMode: e.target.value }))}>
              <option value="">--</option>
              <option value="CSH">CSH - Cash</option>
              <option value="CHQ">CHQ - Cheque</option>
              <option value="CC">CC - Credit Card</option>
              <option value="ONLINE">ONLINE - Online Transfer</option>
            </Select>
            <Input label="Doc No." value={claimForm.docNo} onChange={setU('docNo')} />
            <Input label="Doc Date" type="date" value={claimForm.docDate} onChange={setV('docDate')} />
            <Input label="Trust Paid Date" type="date" value={claimForm.trustPaidDate} onChange={setV('trustPaidDate')} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
            <textarea rows={2} value={claimForm.remark} onChange={setV('remark')}
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Claim Remark</label>
            <textarea rows={2} value={claimForm.claimRemark} readOnly
              className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 bg-gray-50 text-gray-500" />
          </div>
          {claimError && <p className="text-sm text-red-600">{claimError}</p>}
          <div className="flex gap-3">
            <Button onClick={() => claimSaveMut.mutate()} loading={claimSaveMut.isPending}>
              {editingClaimId ? 'Save' : 'Add Claim'}
            </Button>
            <Button variant="secondary" onClick={() => { setClaimModal(false); setClaimError(''); }}>Cancel</Button>
          </div>
        </div>
      </Modal>

      {/* ── Delete Confirm Modal ────────────────────────────── */}
      <Modal open={!!deleteId} title="Delete Claim" onClose={() => setDeleteId(null)}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Are you sure you want to delete this claim? This action cannot be undone.</p>
          <div className="flex gap-3">
            <Button variant="danger" onClick={() => deleteId && deleteMut.mutate(deleteId)} loading={deleteMut.isPending}>Delete</Button>
            <Button variant="secondary" onClick={() => setDeleteId(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
