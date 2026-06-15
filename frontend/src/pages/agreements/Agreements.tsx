import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { agreementsApi } from '../../api/agreements';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';
import { Pagination } from '../../components/ui/Pagination';
import { PageSpinner } from '../../components/ui/Spinner';
import { RecordCount } from '../../components/ui/RecordCount';
import { format } from 'date-fns';

type SortField = 'fullName' | 'agreementDate';
type SortDir   = 'asc' | 'desc';

export function Agreements() {
  const [sp, setSp] = useSearchParams();

  // All filter/sort/page state lives in the URL
  const coCode  = sp.get('coCode')  ?? '03';
  const status  = sp.get('status')  ?? 'NA';
  const sortBy  = (sp.get('sortBy')  ?? '') as SortField | '';
  const sortDir = (sp.get('sortDir') ?? 'asc') as SortDir;
  const page    = parseInt(sp.get('page') ?? '1', 10);
  const q       = sp.get('q') ?? '';

  // Search input is local state — initialised from URL so it matches on Back
  const [searchInput, setSearchInput] = useState(() => sp.get('q') ?? '');

  // Debounce: update URL `q` param 350 ms after typing stops (replace so no history noise)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSp(prev => {
        const next = new URLSearchParams(prev);
        if (searchInput.trim()) next.set('q', searchInput.trim()); else next.delete('q');
        next.set('page', '1');
        return next;
      }, { replace: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const setFilter = (key: string, value: string) => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      next.set('page', '1');
      return next;
    }, { replace: true });
  };

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

  const sortIcon = (field: SortField) =>
    sortBy === field ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

  const { data, isLoading } = useQuery({
    queryKey: ['agreements', q, coCode, status, sortBy, sortDir, page],
    queryFn: () => agreementsApi.list({
      q:            q       || undefined,
      coCode:       coCode  || undefined,
      acctClassify: status  || undefined,
      sortBy:       sortBy  || undefined,
      sortDir,
      page, limit: 20,
    }).then(r => r.data),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-56">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
               fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search agreement no., membership no. or name…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <Select value={coCode} onChange={e => setFilter('coCode', e.target.value)} className="w-36">
          <option value="03">LHC-03</option>
          <option value="15">LHC-15</option>
          <option value="02">CP</option>
        </Select>
        <Select value={status} onChange={e => setFilter('status', e.target.value)} className="w-44">
          <option value="NA">Active (NA)</option>
          <option value="SU">Suspended (SU)</option>
          <option value="PT">Pending Termination (PT)</option>
          <option value="TM">Terminated (TM)</option>
        </Select>
      </div>

      <RecordCount total={data?.meta?.total} loading={isLoading} />

      <Card>
        {isLoading ? <PageSpinner /> : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Agreement No.</th>
                  <th className="px-4 py-3 text-left cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort('fullName')}>
                    Membership No / Name{sortIcon('fullName')}
                  </th>
                  <th className="px-4 py-3 text-left cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => handleSort('agreementDate')}>
                    Agreement Date{sortIcon('agreementDate')}
                  </th>
                  <th className="px-4 py-3 text-left">Expiry Date</th>
                  <th className="px-4 py-3 text-left">Term</th>
                  <th className="px-4 py-3 text-left">AMC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.data.map(a => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/agreements/${a.id}`} className="font-mono text-blue-600 hover:underline">{a.agreementNo}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/members/${a.memberId}`} className="text-blue-600 hover:underline text-xs">
                        {a.member?.membershipNo}
                      </Link>
                      <div className="text-gray-700 text-xs">{a.member?.fullName}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{format(new Date(a.agreementDate), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 text-gray-500">{a.endDate ? format(new Date(a.endDate), 'dd/MM/yyyy') : '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{a.termYears} yrs</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {a.amcSchedule ? (
                        <span>{a.amcSchedule.invoicesIssued}/{a.amcSchedule.totalInvoices}</span>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {data?.data.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No agreements found</td></tr>
                )}
              </tbody>
            </table>
            {data?.meta && <Pagination {...data.meta} onPage={handlePage} />}
          </>
        )}
      </Card>
    </div>
  );
}
