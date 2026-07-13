import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pbsApi } from '../../api/pbs';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';
import { Pagination } from '../../components/ui/Pagination';
import { PageSpinner } from '../../components/ui/Spinner';
import { ProductBadge } from '../../components/ProductBadge';
import { RecordCount } from '../../components/ui/RecordCount';
import { format } from 'date-fns';
import { ArrowLeft } from 'lucide-react';

export function PbsEnquiry() {
  const [sp, setSp] = useSearchParams();

  const coCode       = sp.get('coCode')       ?? '';
  const acctClassify = sp.get('acctClassify') ?? '';
  const schemeType   = sp.get('schemeType')   ?? '';
  const claimIndc    = sp.get('claimIndc')    ?? '';
  const q            = sp.get('q')            ?? '';
  const page         = parseInt(sp.get('page') ?? '1', 10);

  const [searchInput, setSearchInput] = useState(() => sp.get('q') ?? '');

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

  const handlePage = (p: number) => {
    setSp(prev => { const next = new URLSearchParams(prev); next.set('page', String(p)); return next; }, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['pbs-schemes', q, coCode, acctClassify, schemeType, claimIndc, page],
    queryFn: () => pbsApi.list({
      q:            q || undefined,
      coCode:       coCode || undefined,
      acctClassify: acctClassify || undefined,
      schemeType:   schemeType || undefined,
      claimIndc:    claimIndc || undefined,
      page, limit: 20,
    }).then(r => r.data),
  });

  return (
    <div className="space-y-4">
      <Link to="/pbs" className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800">
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Zurich PBS
      </Link>

      <h1 className="text-xl font-semibold text-gray-900">PBS Enquiry & Maintenance</h1>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-56">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
               fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value.toUpperCase())}
            placeholder="Search agreement no., membership no., name or cert no..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searchInput && (
            <button onClick={() => setSearchInput('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <Select value={coCode} onChange={e => setFilter('coCode', e.target.value)} className="w-36">
          <option value="">All Products</option>
          <option value="03">LHC-03</option>
          <option value="15">LHC-15</option>
        </Select>

        <Select value={acctClassify} onChange={e => setFilter('acctClassify', e.target.value)} className="w-44">
          <option value="">All Status</option>
          <option value="NA">Active (NA)</option>
          <option value="SU">Suspended (SU)</option>
          <option value="PT">Pending Termination (PT)</option>
          <option value="TM">Terminated (TM)</option>
        </Select>

        <Select value={schemeType} onChange={e => setFilter('schemeType', e.target.value)} className="w-36">
          <option value="">All Schemes</option>
          <option value="19K">19K</option>
          <option value="21K">21K</option>
        </Select>

        <Select value={claimIndc} onChange={e => setFilter('claimIndc', e.target.value)} className="w-44">
          <option value="">All Claims</option>
          <option value="true">Claimed</option>
          <option value="false">Not Claimed</option>
        </Select>

        {(searchInput || coCode || acctClassify || schemeType || claimIndc) && (
          <button
            onClick={() => {
              setSearchInput('');
              setSp(new URLSearchParams(), { replace: true });
            }}
            className="px-3 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Clear all
          </button>
        )}
      </div>

      <RecordCount total={data?.meta?.total} loading={isLoading} />

      <Card>
        {isLoading ? <PageSpinner /> : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Agreement</th>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Cert No</th>
                  <th className="px-4 py-3 text-left">Scheme</th>
                  <th className="px-4 py-3 text-left">Payback Date</th>
                  <th className="px-4 py-3 text-center">Top Up</th>
                  <th className="px-4 py-3 text-center">Claimed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.data.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/pbs/enquiry/${s.id}`} className="font-mono text-blue-600 hover:underline">
                        {s.agreementNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{s.agreement?.membershipNo}</div>
                      <div className="text-gray-500">{s.agreement?.member?.fullName}</div>
                    </td>
                    <td className="px-4 py-3"><ProductBadge coCode={s.coCode} /></td>
                    <td className="px-4 py-3 font-mono">{s.certNo || '—'}</td>
                    <td className="px-4 py-3">{s.schemeType || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.paybackDate ? format(new Date(s.paybackDate), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.topUp ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">Yes</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-bold ${
                        s.claimIndc ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {s.claimIndc ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </tr>
                ))}
                {data?.data.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No PBS records found</td></tr>
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
