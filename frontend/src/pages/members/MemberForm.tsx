import { useState, useEffect, FormEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { membersApi } from '../../api/members';
import { statesApi } from '../../api/states';
import { apiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import type { Member, State } from '../../types';

type Tab = 'personal' | 'address' | 'employment' | 'joint' | 'corporate';

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="col-span-2 border-b pb-1 mt-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">{children}</p>
    </div>
  );
}

// Read-only display row for locked fields
function ReadOnlyField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-700">
        {value || '—'}
      </div>
    </div>
  );
}

function StateSelect({ label, value, onChange, states, byName = false }: {
  label: string; value: string; states: State[];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  byName?: boolean; // true = option value is state.name; false (default) = state.code
}) {
  return (
    <Select label={label} value={value} onChange={onChange}>
      <option value="">— Select state —</option>
      {states.map(s => (
        <option key={s.code} value={byName ? s.name : s.code}>
          {s.code} — {s.name}
        </option>
      ))}
    </Select>
  );
}

export function MemberForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('personal');
  const [form, setForm] = useState<Record<string, string>>({ memberType: 'INDIVIDUAL', status: 'ACTIVE' });
  const [error, setError] = useState('');

  const { data: member, isLoading } = useQuery<Member>({
    queryKey: ['member', id],
    queryFn: () => membersApi.get(id!).then(r => r.data.data),
    enabled: isEdit,
  });

  const { data: statesData } = useQuery<State[]>({
    queryKey: ['states'],
    queryFn: () => statesApi.list().then(r => r.data.data),
    staleTime: Infinity,
  });
  const states = statesData ?? [];

  useEffect(() => {
    if (member) {
      const f: Record<string, string> = {};
      (Object.entries(member) as [string, unknown][]).forEach(([k, v]) => {
        if (v !== null && v !== undefined && typeof v !== 'object') f[k] = String(v);
      });
      setForm(f);
    }
  }, [member]);

  const buildPayload = (f: Record<string, string>): Record<string, unknown> => {
    const DATE_FIELDS    = new Set(['dateOfBirth', 'incorporationDate']);
    const BOOLEAN_FIELDS = new Set(['enrolRci', 'activeHcm']);
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(f)) {
      if (v === null || v === undefined) continue;
      if (BOOLEAN_FIELDS.has(k)) { result[k] = v === 'true'; continue; }
      if (DATE_FIELDS.has(k)) {
        result[k] = v.trim() === '' ? null : (v.includes('T') ? v : `${v}T00:00:00.000Z`);
        continue;
      }
      result[k] = v.trim() === '' ? null : v;
    }
    return result;
  };

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = buildPayload(form);
      return isEdit ? membersApi.update(id!, payload) : membersApi.create(payload);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['members'] });
      qc.invalidateQueries({ queryKey: ['member', id] });
      navigate(`/members/${res.data.data.id}`, { replace: true });
    },
    onError: (err) => setError(apiError(err)),
  });

  // Select / dropdown — value as-is
  const set = (k: string) =>
    (e: React.ChangeEvent<HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  // Text / textarea inputs — force uppercase
  const setU = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value.toUpperCase() }));

  // Email / free-text inputs — no uppercase
  const setEmail = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const setPlain = (k: string) =>
    (e: React.ChangeEvent<HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  // Date inputs — keep value as-is (browser date picker handles format)
  const setDate = (k: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  // State code dropdown: sets the code field AND auto-fills the city/state description field
  const handleStateChange = (codeField: string, cityStateField: string) =>
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const code  = e.target.value;
      const name  = states.find(s => s.code === code)?.name ?? '';
      setForm(f => ({ ...f, [codeField]: code, [cityStateField]: name }));
    };

  if (isEdit && isLoading) return <PageSpinner />;

  const isIndividual = (form.memberType ?? 'INDIVIDUAL') === 'INDIVIDUAL';

  const allTabs: { key: Tab; label: string; show: boolean }[] = [
    { key: 'personal',   label: 'Personal',       show: true },
    { key: 'address',    label: 'Address',         show: true },
    { key: 'employment', label: 'Employment',      show: isIndividual },
    { key: 'joint',      label: 'Joint Applicant', show: isIndividual },
    { key: 'corporate',  label: 'Company',         show: !isIndividual },
  ];
  const visibleTabs = allTabs.filter(t => t.show);

  useEffect(() => {
    if (!visibleTabs.find(t => t.key === tab)) setTab('personal');
  }, [isIndividual]);

  const memberTypeLabel = form.memberType === 'CORPORATE' ? 'Corporate' : 'Individual';

  return (
    <div className="max-w-3xl space-y-4">
      <Card>
        <CardHeader>
          <h2 className="font-semibold text-gray-800">{isEdit ? 'Edit Member' : 'New Member'}</h2>
        </CardHeader>
        <CardBody>
          <div className="flex gap-1 border-b mb-5 overflow-x-auto">
            {visibleTabs.map(t => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <form onSubmit={(e: FormEvent) => { e.preventDefault(); setError(''); saveMut.mutate(); }}>

            {/* ════ PERSONAL ════ */}
            {tab === 'personal' && (
              <div className="grid grid-cols-2 gap-4">
                {!isEdit && (
                  <Input label="Membership No." value={form.membershipNo ?? ''} onChange={setU('membershipNo')} required className="col-span-2" />
                )}

                {/* Member type and full name — read-only in edit mode */}
                {isEdit ? (
                  <>
                    <ReadOnlyField label="Member type" value={memberTypeLabel} />
                    <Select label="Salutation" value={form.salutation ?? ''} onChange={set('salutation')}>
                      <option value="">—</option>
                      {['MR', 'MRS', 'MS', 'DR', 'DATO', "DATO'", 'TAN SRI', 'PUAN SRI', 'ENCIK', 'PUAN', 'CIK'].map(s =>
                        <option key={s}>{s}</option>)}
                    </Select>
                    <div className="col-span-2">
                      <ReadOnlyField label="Full name" value={form.fullName} />
                    </div>
                  </>
                ) : (
                  <>
                    <Select label="Member type" value={form.memberType ?? 'INDIVIDUAL'} onChange={set('memberType')}>
                      <option value="INDIVIDUAL">Individual</option>
                      <option value="CORPORATE">Corporate</option>
                    </Select>
                    <Select label="Salutation" value={form.salutation ?? ''} onChange={set('salutation')}>
                      <option value="">—</option>
                      {['MR', 'MRS', 'MS', 'DR', 'DATO', "DATO'", 'TAN SRI', 'PUAN SRI', 'ENCIK', 'PUAN', 'CIK'].map(s =>
                        <option key={s}>{s}</option>)}
                    </Select>
                    <div className="col-span-2">
                      <Input label="Full name" value={form.fullName ?? ''} onChange={setU('fullName')} required />
                    </div>
                  </>
                )}

                <Input label="Name card"          value={form.nameCard    ?? ''} onChange={setU('nameCard')}    placeholder="Name as on name card" />
                <Input label="Nationality"         value={form.nationality  ?? ''} onChange={setU('nationality')} />
                <Input label="IC (New / MyKad)"   value={form.icNew        ?? ''} onChange={setU('icNew')} />
                <Input label="IC (Old)"            value={form.icOld        ?? ''} onChange={setU('icOld')} />
                <Input label="Date of birth" type="date" value={form.dateOfBirth?.slice(0, 10) ?? ''} onChange={setDate('dateOfBirth')} />
                <Select label="Gender" value={form.gender ?? ''} onChange={set('gender')}>
                  <option value="">—</option>
                  <option value="M">MALE</option>
                  <option value="F">FEMALE</option>
                </Select>
                <Select label="Race" value={form.race ?? ''} onChange={set('race')}>
                  <option value="">—</option>
                  <option value="M">MALAY</option>
                  <option value="C">CHINESE</option>
                  <option value="I">INDIAN</option>
                  <option value="O">OTHER</option>
                </Select>
                <Select label="Marital status" value={form.maritalStatus ?? ''} onChange={set('maritalStatus')}>
                  <option value="">—</option>
                  <option value="M">MARRIED</option>
                  <option value="S">SINGLE</option>
                  <option value="D">DIVORCED</option>
                  <option value="W">WIDOWED</option>
                </Select>

                <SectionHeading>Contact</SectionHeading>
                <Input label="Email"     type="email" value={form.email     ?? ''} onChange={setEmail('email')} />
                <Input label="Mobile"               value={form.telMobile  ?? ''} onChange={setU('telMobile')} />
                <Input label="Home tel."            value={form.telHome     ?? ''} onChange={setU('telHome')} />

                <SectionHeading>System</SectionHeading>
                <Input label="Branch code"            value={form.branchCode    ?? ''} onChange={setU('branchCode')} />
                <Input label="Subscription category"  value={form.subsCategory  ?? ''} onChange={setU('subsCategory')} />
                <Input label="TIN number"             value={form.tinNumber     ?? ''} onChange={setU('tinNumber')} placeholder="e.g. C1234567890" />
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Remarks</label>
                  <textarea className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2} value={form.remarks ?? ''} onChange={setPlain('remarks')} />
                </div>
              </div>
            )}

            {/* ════ ADDRESS ════ */}
            {tab === 'address' && (
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                    {isIndividual ? 'Residential' : 'Registered'}
                  </p>
                  <Input label="Address line 1" value={form.resAdd1       ?? ''} onChange={setU('resAdd1')} />
                  <Input label="Address line 2" value={form.resAdd2       ?? ''} onChange={setU('resAdd2')} />
                  <Input label="Address line 3" value={form.resAdd3       ?? ''} onChange={setU('resAdd3')} />
                  <Input label="City / State"   value={form.resCityState  ?? ''} onChange={setU('resCityState')} />
                  <Input label="Postcode"       value={form.resPostcode   ?? ''} onChange={setU('resPostcode')} />
                  <StateSelect label="State" value={form.resStateCode ?? ''} onChange={handleStateChange('resStateCode', 'resCityState')} states={states} />
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Mailing</p>
                  <Input label="Address line 1" value={form.mailAdd1      ?? ''} onChange={setU('mailAdd1')} />
                  <Input label="Address line 2" value={form.mailAdd2      ?? ''} onChange={setU('mailAdd2')} />
                  <Input label="Address line 3" value={form.mailAdd3      ?? ''} onChange={setU('mailAdd3')} />
                  <Input label="City / State"   value={form.mailCityState ?? ''} onChange={setU('mailCityState')} />
                  <Input label="Postcode"       value={form.mailPostcode  ?? ''} onChange={setU('mailPostcode')} />
                  <StateSelect label="State" value={form.mailStateCode ?? ''} onChange={handleStateChange('mailStateCode', 'mailCityState')} states={states} />
                </div>
              </div>
            )}

            {/* ════ EMPLOYMENT ════ */}
            {tab === 'employment' && (
              <div className="grid grid-cols-2 gap-4">
                <SectionHeading>Employment</SectionHeading>
                <div className="col-span-2">
                  <Input label="Company name" value={form.companyName ?? ''} onChange={setU('companyName')} />
                </div>
                <Input label="Designation"     value={form.designation ?? ''} onChange={setU('designation')} />
                <Select label="Nature of work" value={form.workNature ?? ''} onChange={set('workNature')}>
                  <option value="">—</option>
                  <option value="E">EMPLOYED</option>
                  <option value="O">OWN BUSINESS</option>
                </Select>
                <Input label="Office tel. 1" value={form.telOffice  ?? ''} onChange={setU('telOffice')} />
                <Input label="Office tel. 2" value={form.telOffice2 ?? ''} onChange={setU('telOffice2')} />
                <Input label="Office fax"    value={form.faxOffice  ?? ''} onChange={setU('faxOffice')} />

                <SectionHeading>Company address</SectionHeading>
                <div className="col-span-2">
                  <Input label="Address line 1" value={form.compAdd1     ?? ''} onChange={setU('compAdd1')} />
                </div>
                <Input label="Address line 2" value={form.compAdd2     ?? ''} onChange={setU('compAdd2')} />
                <Input label="Address line 3" value={form.compAdd3     ?? ''} onChange={setU('compAdd3')} />
                <Input label="City / State"   value={form.compCityState ?? ''} onChange={setU('compCityState')} />
                <Input label="Postcode"       value={form.compPostcode  ?? ''} onChange={setU('compPostcode')} />
                <StateSelect label="State" value={form.compStateCode ?? ''} onChange={handleStateChange('compStateCode', 'compCityState')} states={states} />

                <SectionHeading>Spouse</SectionHeading>
                <Input label="Spouse name" value={form.spouseName ?? ''} onChange={setU('spouseName')} />
                <Input label="Spouse IC"   value={form.spouseIc   ?? ''} onChange={setU('spouseIc')} />
              </div>
            )}

            {/* ════ JOINT APPLICANT ════ */}
            {tab === 'joint' && (
              <div className="grid grid-cols-2 gap-4">
                <Select label="Salutation" value={form.jaSalutation ?? ''} onChange={set('jaSalutation')}>
                  <option value="">—</option>
                  {['MR', 'MRS', 'MS', 'DR', 'DATO', "DATO'", 'TAN SRI', 'PUAN SRI', 'ENCIK', 'PUAN', 'CIK'].map(s =>
                    <option key={s}>{s}</option>)}
                </Select>
                <Input label="Full name"   value={form.jaName        ?? ''} onChange={setU('jaName')} />
                <Input label="IC (New)"    value={form.jaIcNew       ?? ''} onChange={setU('jaIcNew')} />
                <Input label="IC (Old)"    value={form.jaIc          ?? ''} onChange={setU('jaIc')} />
                <Input label="Designation" value={form.jaDesignation ?? ''} onChange={setU('jaDesignation')} />
                <Input label="Name card"   value={form.jaNameCard    ?? ''} onChange={setU('jaNameCard')} />

                <SectionHeading>Contact</SectionHeading>
                <Input label="Email"       type="email" value={form.jaEmail    ?? ''} onChange={setEmail('jaEmail')} />
                <Input label="Mobile"               value={form.jaMobile    ?? ''} onChange={setU('jaMobile')} />
                <Input label="Home tel."            value={form.jaTelHome   ?? ''} onChange={setU('jaTelHome')} />
                <Input label="Office tel."          value={form.jaTelOffice ?? ''} onChange={setU('jaTelOffice')} />

                <SectionHeading>Address</SectionHeading>
                <div className="col-span-2">
                  <Input label="Address line 1" value={form.jaAdd1    ?? ''} onChange={setU('jaAdd1')} />
                </div>
                <Input label="Address line 2" value={form.jaAdd2     ?? ''} onChange={setU('jaAdd2')} />
                <Input label="Address line 3" value={form.jaAdd3     ?? ''} onChange={setU('jaAdd3')} />
                <Input label="City"           value={form.jaCity     ?? ''} onChange={setU('jaCity')} />
                <Input label="Postcode"       value={form.jaPostcode ?? ''} onChange={setU('jaPostcode')} />
                <StateSelect label="State" value={form.jaState ?? ''} onChange={set('jaState')} states={states} byName />
              </div>
            )}

            {/* ════ CORPORATE ════ */}
            {tab === 'corporate' && (
              <div className="grid grid-cols-2 gap-4">
                <SectionHeading>Company details</SectionHeading>
                <div className="col-span-2">
                  {isEdit
                    ? <ReadOnlyField label="Company name" value={form.fullName} />
                    : <Input label="Company name" value={form.fullName ?? ''} onChange={setU('fullName')} required />
                  }
                </div>
                <Input label="Registration no."   value={form.registrationNo ?? ''} onChange={setU('registrationNo')} />
                <Input label="Incorporation date" type="date"
                  value={form.incorporationDate?.slice(0, 10) ?? ''} onChange={setDate('incorporationDate')} />
                <div className="col-span-2">
                  <Input label="Business nature" value={form.businessNature ?? ''} onChange={setU('businessNature')} />
                </div>

                <SectionHeading>Contact</SectionHeading>
                <Input label="Email"  type="email" value={form.email    ?? ''} onChange={setEmail('email')} />
                <Input label="Tel. 1"              value={form.telHome   ?? ''} onChange={setU('telHome')} />
                <Input label="Tel. 2"              value={form.telMobile ?? ''} onChange={setU('telMobile')} />
                <Input label="Fax"                 value={form.faxNo     ?? ''} onChange={setU('faxNo')} />
              </div>
            )}

            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

            <div className="mt-6 flex gap-3">
              <Button type="submit" loading={saveMut.isPending}>
                {isEdit ? 'Save changes' : 'Create member'}
              </Button>
              <Button type="button" variant="secondary"
                onClick={() => navigate(isEdit ? `/members/${id}` : '/members', { replace: true })}>
                Cancel
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
