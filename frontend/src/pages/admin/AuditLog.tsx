import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../../api/amc';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Pagination } from '../../components/ui/Pagination';
import { PageSpinner } from '../../components/ui/Spinner';
import { RecordCount } from '../../components/ui/RecordCount';
import { format } from 'date-fns';

const ACTION_TYPES = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'SUSPEND'];

const actionColor: Record<string, 'green' | 'blue' | 'red' | 'yellow' | 'gray'> = {
  CREATE: 'green', UPDATE: 'blue', DELETE: 'red', LOGIN: 'gray', SUSPEND: 'yellow',
};

interface SearchState {
  from: string; to: string; username: string; action: string; actionType: string; targetType: string;
}
const EMPTY: SearchState = { from: '', to: '', username: '', action: '', actionType: '', targetType: '' };

export function AuditLog() {
  const [sp, setSp] = useSearchParams();

  const page = parseInt(sp.get('page') ?? '1', 10);
  const searched = sp.get('s') === '1';
  const applied: SearchState = {
    from:       sp.get('from')       ?? '',
    to:         sp.get('to')         ?? '',
    username:   sp.get('username')   ?? '',
    action:     sp.get('action')     ?? '',
    actionType: sp.get('actionType') ?? '',
    targetType: sp.get('targetType') ?? '',
  };

  const [draft, setDraft] = useState<SearchState>(() => ({
    from:       sp.get('from')       ?? '',
    to:         sp.get('to')         ?? '',
    username:   sp.get('username')   ?? '',
    action:     sp.get('action')     ?? '',
    actionType: sp.get('actionType') ?? '',
    targetType: sp.get('targetType') ?? '',
  }));

  const set = (k: keyof SearchState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setDraft(d => ({ ...d, [k]: e.target.value }));

  // Date To can never be earlier than Date From. Picking a From that is empty/after
  // the current To bumps To up to match (yyyy-MM-dd strings sort chronologically).
  const setFrom = (e: React.ChangeEvent<HTMLInputElement>) => {
    const from = e.target.value;
    setDraft(d => ({ ...d, from, to: !d.to || (from && from > d.to) ? from : d.to }));
  };

  // Guard against a To earlier than From (e.g. typed in directly); clamp it up to From.
  const setTo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const to = e.target.value;
    setDraft(d => ({ ...d, to: d.from && to && to < d.from ? d.from : to }));
  };

  const handleSearch = () => {
    const p: Record<string, string> = { s: '1', page: '1' };
    if (draft.from)       p.from       = draft.from;
    if (draft.to)         p.to         = draft.to;
    if (draft.username)   p.username   = draft.username;
    if (draft.action)     p.action     = draft.action;
    if (draft.actionType) p.actionType = draft.actionType;
    if (draft.targetType) p.targetType = draft.targetType;
    setSp(p);
  };

  const handleClear = () => { setDraft(EMPTY); setSp({}); };

  const handlePage = (p: number) =>
    setSp(prev => { const n = new URLSearchParams(prev); n.set('page', String(p)); return n; }, { replace: true });

  const params: Record<string, unknown> = { page, limit: 50 };
  if (searched) {
    if (applied.from)       params.from       = applied.from;
    if (applied.to)         params.to         = applied.to;
    if (applied.username)   params.username   = applied.username;
    if (applied.action)     params.action     = applied.action;
    if (applied.actionType) params.actionType = applied.actionType;
    if (applied.targetType) params.targetType = applied.targetType;
  }

  const { data, isLoading } = useQuery({
    queryKey: ['audit', params],
    queryFn: () => auditApi.list(params).then(r => r.data),
    enabled: searched,
  });

  return (
    <Card>
      {/* Search bar */}
      <div className="p-4 border-b space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date From</label>
            <Input type="date" value={draft.from} onChange={setFrom} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date To</label>
            <Input type="date" value={draft.to} min={draft.from || undefined} onChange={setTo} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">User</label>
            <Input placeholder="Username" value={draft.username} onChange={set('username')}
              onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Action</label>
            <Input placeholder="Action description" value={draft.action} onChange={set('action')}
              onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Type</label>
            <Select value={draft.actionType} onChange={set('actionType')}>
              <option value="">All</option>
              {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </Select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Target</label>
            <Input placeholder="Target type" value={draft.targetType} onChange={set('targetType')}
              onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={handleSearch}>Search</Button>
          <Button variant="secondary" onClick={handleClear}>Clear</Button>
          {searched && data?.meta && <RecordCount total={data.meta.total} />}
        </div>
      </div>

      {!searched ? (
        <p className="px-4 py-8 text-center text-gray-400">Enter search criteria above and click Search.</p>
      ) : isLoading ? <PageSpinner /> : (
        <>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">When</th>
                <th className="px-4 py-3 text-left">User</th>
                <th className="px-4 py-3 text-left">Action</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-left">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.data.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No records found</td></tr>
              )}
              {data?.data.map(log => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">
                    {format(new Date(log.createdAt), 'dd/MM/yy HH:mm')}
                  </td>
                  <td className="px-4 py-2.5 font-medium">{log.user.username}</td>
                  <td className="px-4 py-2.5 text-gray-700 max-w-xs truncate">{log.action}</td>
                  <td className="px-4 py-2.5">
                    <Badge color={actionColor[log.actionType] ?? 'gray'}>{log.actionType}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{log.targetType ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.meta && <Pagination {...data.meta} onPage={handlePage} />}
        </>
      )}
    </Card>
  );
}
