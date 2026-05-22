import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Lock, Unlock, KeyRound, Copy } from 'lucide-react';
import { usersApi } from '../../api/users';
import { departmentsApi } from '../../api/departments';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { Pagination } from '../../components/ui/Pagination';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import type { User } from '../../types';
import { format } from 'date-fns';

export function Users() {
  const { canCreate, canEdit, isIT } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch]     = useState('');
  const [deptId, setDeptId]     = useState('');
  const [status, setStatus]     = useState('');
  const [page, setPage]         = useState(1);
  const [resetModal, setResetModal] = useState<User | null>(null);
  const [tempPwd, setTempPwd]   = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['users', search, deptId, status, page],
    queryFn: () => usersApi.list({ search: search || undefined, departmentId: deptId || undefined, status: status || undefined, page, limit: 20 }).then(r => r.data),
  });

  const { data: depts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsApi.list().then(r => r.data.data),
  });

  const suspendMut = useMutation({
    mutationFn: (id: number) => usersApi.toggleSuspend(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const resetMut = useMutation({
    mutationFn: (id: number) => usersApi.resetPassword(id),
    onSuccess: (res) => { setTempPwd(res.data.tempPassword); qc.invalidateQueries({ queryKey: ['users'] }); },
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="w-full rounded-md border border-gray-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search by name, username, email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={deptId} onChange={e => { setDeptId(e.target.value); setPage(1); }} className="w-44">
          <option value="">All departments</option>
          {depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-36">
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
        </Select>
        {canCreate('ADMIN') && (
          <Button onClick={() => navigate('/admin/users/new')} size="sm">
            <Plus className="h-4 w-4" /> New user
          </Button>
        )}
      </div>

      <Card>
        {isLoading ? <PageSpinner /> : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Name</th>
                  <th className="px-4 py-3 text-left">Username</th>
                  <th className="px-4 py-3 text-left">Department</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Last login</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data?.data.map(u => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/users/${u.id}`} className="font-medium text-blue-600 hover:underline">
                        {u.fullName}
                      </Link>
                      {u.lockedAt && <span className="ml-2 text-xs text-red-500">🔒 Locked</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.username}</td>
                    <td className="px-4 py-3">{u.department.name}</td>
                    <td className="px-4 py-3">
                      <Badge color={u.status === 'ACTIVE' ? 'green' : 'red'}>{u.status}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {u.lastLoginAt ? format(new Date(u.lastLoginAt), 'dd/MM/yyyy HH:mm') : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {canEdit('ADMIN') && (
                          <button
                            title={u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                            onClick={() => suspendMut.mutate(u.id)}
                            className="rounded p-1.5 text-gray-400 hover:bg-gray-100"
                          >
                            {u.status === 'ACTIVE' ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                          </button>
                        )}
                        {isIT && (
                          <>
                            <button title="Reset password" onClick={() => { setResetModal(u); resetMut.mutate(u.id); }} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                              <KeyRound className="h-3.5 w-3.5" />
                            </button>
                            <button title="Clone user" onClick={() => navigate(`/admin/users/${u.id}`)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100">
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {data?.data.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No users found</td></tr>
                )}
              </tbody>
            </table>
            {data?.meta && <Pagination {...data.meta} onPage={setPage} />}
          </>
        )}
      </Card>

      {/* Reset password result modal */}
      <Modal open={!!tempPwd} title="Password Reset" onClose={() => { setTempPwd(''); setResetModal(null); }}>
        <p className="text-sm text-gray-600 mb-3">
          Temporary password for <strong>{resetModal?.fullName}</strong>:
        </p>
        <div className="rounded-md bg-gray-100 px-4 py-3 font-mono text-lg text-center tracking-widest select-all">
          {tempPwd}
        </div>
        <p className="mt-3 text-xs text-gray-500">Share this securely. The user will be required to change it on next login.</p>
      </Modal>
    </div>
  );
}
