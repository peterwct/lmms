import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { membersApi } from '../../api/members';
import { useAuth } from '../../contexts/AuthContext';
import { Card, CardBody } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Select } from '../../components/ui/Select';
import { Pagination } from '../../components/ui/Pagination';
import { PageSpinner } from '../../components/ui/Spinner';
import { AgreementStatusBadge } from '../../components/AgreementStatusBadge';
import { RecordCount } from '../../components/ui/RecordCount';
import { format } from 'date-fns';

type SortField = 'coCode' | 'membershipNo' | 'agreementNo' | 'agreementDate' | 'acctClassify' | 'fullName' | 'icNew';
type SortDir   = 'asc' | 'desc';

interface SearchState {
  coCode: string; membershipNo: string; agreementNo: string; name: string; icNew: string;
  icOld: string; jaName: string; spouseName: string; nomineeName: string; email: string; companyName: string; phone: string;
}
const EMPTY: SearchState = { coCode: '', membershipNo: '', agreementNo: '', name: '', icNew: '', icOld: '', jaName: '', spouseName: '', nomineeName: '', email: '', companyName: '', phone: '' };

function SortHeader({ label, field, sortBy, sortDir, onSort }: {
  label: string; field: SortField;
  sortBy: SortField | ''; sortDir: SortDir; onSort: (f: SortField) => void;
}) {
  const active = sortBy === field;
  return (
    <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide cursor-pointer select-none hover:bg-gray-100 whitespace-nowrap"
        onClick={() => onSort(field)}>
      {label}
      <span className="ml-1 text-gray-400">{active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}</span>
    </th>
  );
}

export function Members() {
  const { canView } = useAuth();
  const [sp, setSp] = useSearchParams();

  // All search/sort/page state lives in the URL so Back restores it
  const sortBy   = (sp.get('sortBy')  ?? 'acctClassify') as SortField | '';
  const sortDir  = (sp.get('sortDir') ?? 'asc') as SortDir;
  const page     = parseInt(sp.get('page') ?? '1', 10);
  const searched = sp.get('s') === '1';
  const applied: SearchState = {
    coCode:       sp.get('coCode')       ?? '',
    membershipNo: sp.get('membershipNo') ?? '',
    agreementNo:  sp.get('agreementNo')  ?? '',
    name:         sp.get('name')         ?? '',
    icNew:        sp.get('icNew')        ?? '',
    icOld:        sp.get('icOld')        ?? '',
    jaName:       sp.get('jaName')       ?? '',
    spouseName:   sp.get('spouseName')   ?? '',
    nomineeName:  sp.get('nomineeName')  ?? '',
    email:        sp.get('email')        ?? '',
    companyName:  sp.get('companyName')  ?? '',
    phone:        sp.get('phone')        ?? '',
  };

  // Draft is local — form inputs; initialised from URL so form matches on Back
  const [draft, setDraft] = useState<SearchState>(() => ({
    coCode:       sp.get('coCode')       ?? '',
    membershipNo: sp.get('membershipNo') ?? '',
    agreementNo:  sp.get('agreementNo')  ?? '',
    name:         sp.get('name')         ?? '',
    icNew:        sp.get('icNew')        ?? '',
    icOld:        sp.get('icOld')        ?? '',
    jaName:       sp.get('jaName')       ?? '',
    spouseName:   sp.get('spouseName')   ?? '',
    nomineeName:  sp.get('nomineeName')  ?? '',
    email:        sp.get('email')        ?? '',
    companyName:  sp.get('companyName')  ?? '',
    phone:        sp.get('phone')        ?? '',
  }));

  const set = (k: keyof SearchState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      // Auto-upshift all search fields except email (matching the app-wide email convention)
      setDraft(d => ({ ...d, [k]: k === 'email' ? e.target.value : e.target.value.toUpperCase() }));

  // Search pushes a new history entry so Back returns here
  const handleSearch = () => {
    const p: Record<string, string> = { s: '1', sortBy, sortDir, page: '1' };
    if (draft.coCode)       p.coCode       = draft.coCode;
    if (draft.membershipNo) p.membershipNo = draft.membershipNo;
    if (draft.agreementNo)  p.agreementNo  = draft.agreementNo;
    if (draft.name)         p.name         = draft.name;
    if (draft.icNew)        p.icNew        = draft.icNew;
    if (draft.icOld)        p.icOld        = draft.icOld;
    if (draft.jaName)       p.jaName       = draft.jaName;
    if (draft.spouseName)   p.spouseName   = draft.spouseName;
    if (draft.nomineeName)  p.nomineeName  = draft.nomineeName;
    if (draft.email)        p.email        = draft.email;
    if (draft.companyName)  p.companyName  = draft.companyName;
    if (draft.phone)        p.phone        = draft.phone;
    setSp(p);
  };

  const handleClear = () => { setDraft(EMPTY); setSp({}); };

  // Sort/page use replace so they don't pollute history
  const handleSort = (field: SortField) => {
    const newDir = sortBy === field && sortDir === 'asc' ? 'desc' : 'asc';
    setSp(prev => {
      const next = new URLSearchParams(prev);
      next.set('sortBy', field); next.set('sortDir', newDir); next.set('page', '1');
      return next;
    }, { replace: true });
  };

  const handlePage = (p: number) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      next.set('page', String(p));
      return next;
    }, { replace: true });
  };

  const hasSearch = Object.values(applied).some(v => v !== '');

  const { data, isLoading } = useQuery({
    queryKey: ['member-enquiry', applied, sortBy, sortDir, page],
    queryFn: () => membersApi.enquiry({
      coCode:       applied.coCode       || undefined,
      membershipNo: applied.membershipNo || undefined,
      agreementNo:  applied.agreementNo  || undefined,
      name:         applied.name         || undefined,
      icNew:        applied.icNew        || undefined,
      icOld:        applied.icOld        || undefined,
      jaName:       applied.jaName       || undefined,
      spouseName:   applied.spouseName   || undefined,
      nomineeName:  applied.nomineeName  || undefined,
      email:        applied.email        || undefined,
      companyName:  applied.companyName  || undefined,
      phone:        applied.phone        || undefined,
      sortBy:       sortBy               || undefined,
      sortDir,
      page, limit: 20,
    }).then(r => r.data),
    enabled: searched && hasSearch,
  });

  const sortProps = { sortBy, sortDir, onSort: handleSort };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800">Member Enquiry</h2>

      <Card>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Code</label>
              <Select value={draft.coCode} onChange={set('coCode')} className="w-full">
                <option value="">All</option>
                <option value="03">03 — LHC-A</option>
                <option value="15">15 — LHC-B</option>
                <option value="02">02 — CP</option>
              </Select>
            </div>
            {([
              ['membershipNo', 'Membership No.',  'e.g. 02099-KL-A-0222'],
              ['agreementNo',  'Agreement No.',   'e.g. 00253'],
              ['name',         'Member/Corporate Name', 'Full name or partial'],
              ['icNew',        'IC Number (New)', '12-digit MyKad'],
              ['icOld',        'Old IC / Passport','Old IC or passport no.'],
              ['jaName',       'Joint Applicant',  'Joint applicant name'],
              ['spouseName',   'Spouse Name',      'Spouse name'],
              ['nomineeName',  'Nominee Name',     'Nominee full name or partial'],
              ['email',        'Email',            'Email or partial'],
              ['companyName',  "Member's Employer Name", 'Employer / company name'],
              ['phone',        'Phone / Fax No.',  'Any phone or fax number'],
            ] as [keyof SearchState, string, string][]).map(([k, lbl, ph]) => (
              <div key={k}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{lbl}</label>
                <input type="text" value={draft[k]} onChange={set(k)} placeholder={ph}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={e => e.key === 'Enter' && handleSearch()} />
              </div>
            ))}
            <div className="flex items-end gap-2">
              <Button onClick={handleSearch} className="flex-1">Search</Button>
              <Button variant="secondary" onClick={handleClear}>Clear</Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {searched && hasSearch && <RecordCount total={data?.meta?.total} loading={isLoading} />}

      {!searched ? (
        <p className="text-sm text-gray-400 text-center py-8">Enter search criteria above and click Search.</p>
      ) : !hasSearch ? (
        <p className="text-sm text-gray-400 text-center py-8">Please enter at least one search criterion.</p>
      ) : isLoading ? <PageSpinner /> : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-gray-500">
                <tr>
                  <SortHeader label="Company"        field="coCode"        {...sortProps} />
                  <SortHeader label="Membership No." field="membershipNo"  {...sortProps} />
                  <SortHeader label="Member Name"    field="fullName"      {...sortProps} />
                  <SortHeader label="IC Number"      field="icNew"         {...sortProps} />
                  <SortHeader label="Agreement No."  field="agreementNo"   {...sortProps} />
                  <SortHeader label="Agmt. Date"     field="agreementDate" {...sortProps} />
                  <SortHeader label="Status"         field="acctClassify"  {...sortProps} />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.data.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-700">{a.coCode}</td>
                    <td className="px-4 py-3">
                      <Link to={`/members/${a.memberId}`} className="font-mono text-blue-600 hover:underline">
                        {a.membershipNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      <div>{a.member?.fullName || '—'}</div>
                      {a.member?.jaName && (
                        <div className="text-xs text-gray-500">JA: {a.member.jaName}</div>
                      )}
                      {a.member?.spouseName && (
                        <div className="text-xs text-gray-500">Spouse: {a.member.spouseName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{a.member?.icNew || '—'}</td>
                    <td className="px-4 py-3">
                      {a.transferFlag === 'TT' ? (
                        <span className="font-mono text-gray-400 line-through" title="Transferred">{a.agreementNo}</span>
                      ) : canView('AGREEMENTS') ? (
                        <Link to={`/agreements/${a.id}`} className="font-mono text-blue-600 hover:underline">
                          {a.agreementNo}
                        </Link>
                      ) : (
                        <span className="font-mono text-gray-700">{a.agreementNo}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {format(new Date(a.agreementDate), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3"><AgreementStatusBadge status={a.acctClassify} /></td>
                  </tr>
                ))}
                {data?.data.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {data?.meta && (
            <div className="px-4 py-2 border-t flex justify-end">
              <Pagination {...data.meta} onPage={handlePage} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
