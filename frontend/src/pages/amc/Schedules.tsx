import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { amcApi } from '../../api/amc';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';
import { AgreementStatusBadge } from '../../components/AgreementStatusBadge';
import { Pagination } from '../../components/ui/Pagination';
import { PageSpinner } from '../../components/ui/Spinner';
import { ProductBadge } from '../../components/ProductBadge';
import { RecordCount } from '../../components/ui/RecordCount';
import { format } from 'date-fns';

const PRODUCT_LABELS: Record<string, string> = { '03': 'LHC-03', '15': 'LHC-15', '02': 'CP' };
const STATUS_LABELS: Record<string, string> = {
  NA: 'Active (NA)', SU: 'Suspended (SU)', PT: 'Pending Termination (PT)', TM: 'Terminated (TM)',
};

export function Schedules() {
  const [sp, setSp] = useSearchParams();
  const currentMonth = format(new Date(), 'yyyy-MM');

  // Committed filters (drive the query) — sourced from the URL, updated only on Search.
  const coCode       = sp.get('coCode')       ?? '';
  const acctClassify = sp.get('acctClassify') ?? '';
  const billingStatus = sp.get('billingStatus') ?? '';
  const dueDate      = sp.get('dueDate')      ?? '';
  const q            = sp.get('q')            ?? '';
  const page         = parseInt(sp.get('page') ?? '1', 10);
  const hasFilters   = !!(q || coCode || acctClassify || billingStatus || dueDate);

  // Staged filter inputs — held locally until the user clicks Search.
  const [searchInput, setSearchInput]   = useState(() => sp.get('q') ?? '');
  const [coCodeInput, setCoCodeInput]   = useState(() => sp.get('coCode') ?? '');
  const [acctInput, setAcctInput]       = useState(() => sp.get('acctClassify') ?? '');
  const [dueDateInput, setDueDateInput] = useState(() => sp.get('dueDate') ?? currentMonth);

  const handleSearch = () => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      const set = (key: string, value: string) => { if (value) next.set(key, value); else next.delete(key); };
      set('q', searchInput.trim());
      set('coCode', coCodeInput);
      set('acctClassify', acctInput);
      set('dueDate', dueDateInput);
      next.set('page', '1');
      return next;
    }, { replace: true });
  };

  const handlePage = (p: number) => {
    setSp(prev => { const next = new URLSearchParams(prev); next.set('page', String(p)); return next; }, { replace: true });
  };

  const { data, isLoading } = useQuery({
    queryKey: ['amc-schedules', q, coCode, acctClassify, billingStatus, dueDate, page],
    queryFn: () => amcApi.listSchedules({
      q:            q             || undefined,
      coCode:       coCode        || undefined,
      acctClassify: acctClassify  || undefined,
      billingStatus: billingStatus || undefined,
      dueDate:      dueDate       || undefined,
      page, limit: 20,
    }).then(r => r.data),
    enabled: hasFilters,
  });

  const handleClear = () => {
    setSearchInput('');
    setCoCodeInput('');
    setAcctInput('');
    setDueDateInput(currentMonth);
    setSp({}, { replace: true });
  };

  // Human-readable summary of the applied filters (shown next to the record count).
  const criteria: { label: string; value: string }[] = [];
  if (q)            criteria.push({ label: 'Search', value: q });
  if (coCode)       criteria.push({ label: 'Product', value: PRODUCT_LABELS[coCode] ?? coCode });
  if (acctClassify) criteria.push({ label: 'Status', value: STATUS_LABELS[acctClassify] ?? acctClassify });
  if (dueDate) {
    const [y, m] = dueDate.split('-').map(Number);
    criteria.push({ label: 'AMC Next Due Month', value: format(new Date(y, m - 1, 1), 'MMMM yyyy') });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-56">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
               fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="Search agreement no., membership no. or name…"
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

        <Select value={coCodeInput} onChange={e => setCoCodeInput(e.target.value)} className="w-36">
          <option value="">All Products</option>
          <option value="03">LHC-03</option>
          <option value="15">LHC-15</option>
          <option value="02">CP</option>
        </Select>

        <Select value={acctInput} onChange={e => setAcctInput(e.target.value)} className="w-44">
          <option value="">All Status</option>
          <option value="NA">Active (NA)</option>
          <option value="SU">Suspended (SU)</option>
          <option value="PT">Pending Termination (PT)</option>
          <option value="TM">Terminated (TM)</option>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <label className="text-sm text-gray-500 whitespace-nowrap">AMC Next Due Month</label>
          <input
            type="month"
            value={dueDateInput}
            onChange={e => setDueDateInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
            className="px-2 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button onClick={handleSearch}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700">
          Search
        </button>
        <button onClick={handleClear}
          className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
          Clear
        </button>
      </div>

      {hasFilters && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <RecordCount total={data?.meta?.total} loading={isLoading} />
          {!isLoading && criteria.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-400">Filters:</span>
              {criteria.map(c => (
                <span key={c.label}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-100 px-2 py-0.5 text-blue-700">
                  <span className="text-blue-400">{c.label}:</span>
                  <span className="font-medium">{c.value}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {!hasFilters ? (
        <Card>
          <p className="px-4 py-8 text-center text-gray-400">Enter a search term or select a filter to view AMC schedules.</p>
        </Card>
      ) : (
      <Card>
        {isLoading ? <PageSpinner /> : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Agreement</th>
                  <th className="px-4 py-3 text-left">Member</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Progress</th>
                  <th className="px-4 py-3 text-left">Next Due</th>
                  <th className="px-4 py-3 text-left">Previous Invoice</th>
                  <th className="px-4 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.data.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/agreements/${s.agreementId}`} className="font-mono text-blue-600 hover:underline">
                        {s.agreementNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="font-mono">{s.agreement?.member?.membershipNo}</div>
                      <div className="text-gray-500">{s.agreement?.member?.fullName}</div>
                    </td>
                    <td className="px-4 py-3"><ProductBadge coCode={s.coCode} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-1.5">
                          <div className="bg-blue-600 h-1.5 rounded-full"
                               style={{ width: `${Math.min((s.invoicesIssued / s.totalInvoices) * 100, 100)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{s.invoicesIssued}/{s.totalInvoices}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {s.nextDueDate ? format(new Date(s.nextDueDate), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {s.lastInvoiceDate ? format(new Date(s.lastInvoiceDate), 'dd/MM/yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {s.agreement?.acctClassify
                        ? <AgreementStatusBadge status={s.agreement.acctClassify} />
                        : '—'}
                    </td>
                  </tr>
                ))}
                {data?.data.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No schedules found</td></tr>
                )}
              </tbody>
            </table>
            {data?.meta && <Pagination {...data.meta} onPage={handlePage} />}
          </>
        )}
      </Card>
      )}
    </div>
  );
}
