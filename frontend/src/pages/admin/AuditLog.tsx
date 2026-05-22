import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../../api/amc';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Pagination } from '../../components/ui/Pagination';
import { PageSpinner } from '../../components/ui/Spinner';
import { format } from 'date-fns';

const actionColor: Record<string, 'green' | 'blue' | 'red' | 'yellow' | 'gray'> = {
  CREATE: 'green', UPDATE: 'blue', DELETE: 'red', LOGIN: 'gray', SUSPEND: 'yellow',
};

export function AuditLog() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery({
    queryKey: ['audit', page],
    queryFn: () => auditApi.list({ page, limit: 50 }).then(r => r.data),
  });

  return (
    <Card>
      {isLoading ? <PageSpinner /> : (
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
          {data?.meta && <Pagination {...data.meta} onPage={setPage} />}
        </>
      )}
    </Card>
  );
}
