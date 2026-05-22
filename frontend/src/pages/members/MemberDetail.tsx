import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { membersApi } from '../../api/members';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { PageSpinner } from '../../components/ui/Spinner';
import { AgreementStatusBadge } from '../../components/AgreementStatusBadge';
import { ProductBadge } from '../../components/ProductBadge';
import type { Member, MemberStatus } from '../../types';
import { format } from 'date-fns';

const statusColor: Record<MemberStatus, 'green' | 'yellow' | 'gray' | 'red' | 'purple'> = {
  ACTIVE: 'green', SUSPENDED: 'yellow', CLOSED: 'gray', DECEASED: 'red', TRANSFERRED: 'purple',
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-800">{value || '—'}</dd>
    </div>
  );
}

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState<MemberStatus>('ACTIVE');
  const [expandedAgmt, setExpandedAgmt] = useState<string | null>(null);

  const { data: member, isLoading } = useQuery<Member>({
    queryKey: ['member', id],
    queryFn: () => membersApi.get(id!).then(r => r.data.data),
  });

  useEffect(() => {
    if (member) setNewStatus(member.status);
  }, [member]);

  const statusMut = useMutation({
    mutationFn: (s: MemberStatus) => membersApi.changeStatus(id!, s),
    onSuccess: () => { setStatusModal(false); qc.invalidateQueries({ queryKey: ['member', id] }); },
  });

  if (isLoading) return <PageSpinner />;
  if (!member) return <p className="text-gray-500">Member not found.</p>;

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
          <h2 className="text-xl font-bold text-gray-900">{member.fullName}</h2>
          <p className="font-mono text-sm text-gray-500">{member.membershipNo}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={statusColor[member.status]}>{member.status}</Badge>
          <Badge color={member.memberType === 'INDIVIDUAL' ? 'blue' : 'purple'}>{member.memberType}</Badge>
          {canEdit('MEMBERS') && <Button variant="secondary" size="sm" onClick={() => setStatusModal(true)}>Change status</Button>}
          {canEdit('MEMBERS') && (
            <Button size="sm" onClick={() => navigate(`/members/${id}/edit`, { replace: true })}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
      </div>

      {/* ── Personal / Company Info ──────────────────────────────── */}
      {member.memberType === 'INDIVIDUAL' ? (
        <Card>
          <CardHeader><p className="font-semibold text-gray-700">Personal Information</p></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Full name"     value={member.fullName} />
              <InfoRow label="Salutation"    value={member.salutation} />
              <InfoRow label="IC (New)"      value={member.icNew} />
              <InfoRow label="IC (Old)"      value={member.icOld} />
              <InfoRow label="Date of birth" value={member.dateOfBirth ? format(new Date(member.dateOfBirth), 'dd/MM/yyyy') : null} />
              <InfoRow label="Gender"        value={member.gender === 'M' ? 'Male' : member.gender === 'F' ? 'Female' : member.gender} />
              <InfoRow label="Nationality"   value={member.nationality} />
              <InfoRow label="Race"          value={member.race === 'M' ? 'Malay' : member.race === 'C' ? 'Chinese' : member.race === 'I' ? 'Indian' : member.race === 'O' ? 'Other' : member.race} />
              <InfoRow label="Marital status" value={member.maritalStatus === 'M' ? 'Married' : member.maritalStatus === 'S' ? 'Single' : member.maritalStatus === 'D' ? 'Divorced' : member.maritalStatus === 'W' ? 'Widowed' : member.maritalStatus} />
              <InfoRow label="Email"         value={member.email} />
              <InfoRow label="Mobile"        value={member.telMobile} />
              <InfoRow label="Home tel."     value={member.telHome} />
              <InfoRow label="Branch"        value={member.branchCode} />
              <InfoRow label="TIN"           value={member.tinNumber} />
            </dl>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardHeader><p className="font-semibold text-gray-700">Company Information</p></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Company name"        value={member.fullName} />
              <InfoRow label="Registration no."    value={member.registrationNo} />
              <InfoRow label="Incorporation date"  value={member.incorporationDate ? format(new Date(member.incorporationDate), 'dd/MM/yyyy') : null} />
              <InfoRow label="Business nature"     value={member.businessNature} />
              <InfoRow label="Email"               value={member.email} />
              <InfoRow label="Tel. 1"              value={member.telHome} />
              <InfoRow label="Tel. 2"              value={member.telMobile} />
              <InfoRow label="Fax"                 value={member.faxNo} />
              <InfoRow label="Branch"              value={member.branchCode} />
              <InfoRow label="TIN"                 value={member.tinNumber} />
            </dl>
          </CardBody>
        </Card>
      )}

      {/* ── Address ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader><p className="font-semibold text-gray-700">Address</p></CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold uppercase text-gray-400 mb-2">
                {member.memberType === 'INDIVIDUAL' ? 'Residential' : 'Registered'}
              </p>
              <dl className="space-y-2">
                <InfoRow label="Address" value={[member.resAdd1, member.resAdd2, member.resAdd3].filter(Boolean).join(', ')} />
                <InfoRow label="City / State" value={member.resCityState} />
                <InfoRow label="Postcode" value={member.resPostcode} />
              </dl>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Mailing</p>
              <dl className="space-y-2">
                <InfoRow label="Address" value={[member.mailAdd1, member.mailAdd2, member.mailAdd3].filter(Boolean).join(', ')} />
                <InfoRow label="City / State" value={member.mailCityState} />
                <InfoRow label="Postcode" value={member.mailPostcode} />
              </dl>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── Employment (individual only) ─────────────────────────── */}
      {member.memberType === 'INDIVIDUAL' && (member.companyName || member.designation || member.telOffice) && (
        <Card>
          <CardHeader><p className="font-semibold text-gray-700">Employment</p></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Company"        value={member.companyName} />
              <InfoRow label="Designation"    value={member.designation} />
              <InfoRow label="Office tel."    value={member.telOffice} />
              <InfoRow label="Office tel. 2"  value={member.telOffice2} />
              <InfoRow label="Office fax"     value={member.faxOffice} />
              <InfoRow label="Work nature"    value={member.workNature} />
              {(member.compAdd1 || member.compAdd2 || member.compAdd3) && (
                <div className="col-span-full">
                  <dt className="text-xs text-gray-500 uppercase tracking-wide">Company address</dt>
                  <dd className="mt-0.5 text-sm font-medium text-gray-800">
                    {[member.compAdd1, member.compAdd2, member.compAdd3, member.compCityState, member.compPostcode].filter(Boolean).join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>
      )}

      {/* ── Spouse (individual only) ─────────────────────────────── */}
      {member.memberType === 'INDIVIDUAL' && member.spouseName && (
        <Card>
          <CardHeader><p className="font-semibold text-gray-700">Spouse</p></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Name"    value={member.spouseName} />
              <InfoRow label="IC"      value={member.spouseIc} />
            </dl>
          </CardBody>
        </Card>
      )}

      {/* ── Joint Applicant (individual only) ───────────────────── */}
      {member.memberType === 'INDIVIDUAL' && member.jaName && (
        <Card>
          <CardHeader><p className="font-semibold text-gray-700">Joint Applicant</p></CardHeader>
          <CardBody>
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4">
              <InfoRow label="Name"         value={member.jaName} />
              <InfoRow label="Salutation"   value={member.jaSalutation} />
              <InfoRow label="Designation"  value={member.jaDesignation} />
              <InfoRow label="IC (Old)"     value={member.jaIc} />
              <InfoRow label="IC (New)"     value={member.jaIcNew} />
              <InfoRow label="Name card"    value={member.jaNameCard} />
              <InfoRow label="Mobile"       value={member.jaMobile} />
              <InfoRow label="Home tel."    value={member.jaTelHome} />
              <InfoRow label="Office tel."  value={member.jaTelOffice} />
              <InfoRow label="Email"        value={member.jaEmail} />
              {(member.jaAdd1 || member.jaAdd2 || member.jaAdd3) && (
                <div className="col-span-full">
                  <dt className="text-xs text-gray-500 uppercase tracking-wide">Address</dt>
                  <dd className="mt-0.5 text-sm font-medium text-gray-800">
                    {[member.jaAdd1, member.jaAdd2, member.jaAdd3, member.jaCity, member.jaPostcode, member.jaState].filter(Boolean).join(', ')}
                  </dd>
                </div>
              )}
            </dl>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader><p className="font-semibold text-gray-700">Agreements</p></CardHeader>
        <div className="divide-y">
          {member.agreements?.length === 0 && <p className="px-5 py-4 text-sm text-gray-400">No agreements.</p>}
          {member.agreements?.map(agmt => (
            <div key={agmt.id}>
              <button
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 text-left"
                onClick={() => setExpandedAgmt(expandedAgmt === agmt.id ? null : agmt.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-medium text-sm">{agmt.agreementNo}</span>
                  <ProductBadge coCode={agmt.coCode} />
                  <AgreementStatusBadge status={agmt.acctClassify} />
                  {(agmt.totalPoints ?? 0) > 0 && <span className="text-xs text-gray-500">{agmt.totalPoints} pts</span>}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>{format(new Date(agmt.agreementDate), 'dd/MM/yyyy')}</span>
                  <Link to={`/agreements/${agmt.id}`} className="text-blue-600 hover:underline" onClick={e => e.stopPropagation()}>View</Link>
                  {expandedAgmt === agmt.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>
              {expandedAgmt === agmt.id && agmt.nominees && agmt.nominees.length > 0 && (
                <div className="px-5 pb-3 bg-gray-50">
                  <p className="text-xs font-semibold uppercase text-gray-400 mb-2">Nominees</p>
                  {agmt.nominees.map(n => (
                    <div key={n.id} className="text-sm text-gray-700">
                      {n.nomineeSeq}. {n.fullName || '—'} {n.icNew && `(${n.icNew})`}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Modal open={statusModal} title="Change Member Status" onClose={() => setStatusModal(false)}>
        <div className="space-y-4">
          <Select label="New status" value={newStatus} onChange={e => setNewStatus(e.target.value as MemberStatus)}>
            {(['ACTIVE', 'SUSPENDED', 'CLOSED', 'DECEASED', 'TRANSFERRED'] as MemberStatus[]).map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
          <div className="flex gap-3">
            <Button onClick={() => statusMut.mutate(newStatus)} loading={statusMut.isPending}>Save</Button>
            <Button variant="secondary" onClick={() => setStatusModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
