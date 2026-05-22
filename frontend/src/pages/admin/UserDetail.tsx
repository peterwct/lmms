import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../api/users';
import { departmentsApi } from '../../api/departments';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import type { User } from '../../types';
import { format } from 'date-fns';

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit, isIT } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [cloneModal, setCloneModal] = useState(false);
  const [cloneForm, setCloneForm] = useState({ fullName: '', username: '', email: '' });
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [tempPwd, setTempPwd] = useState('');
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<User>({
    queryKey: ['user', id],
    queryFn: () => usersApi.get(Number(id)).then(r => r.data.data),
  });

  useEffect(() => {
    if (data) setForm({ fullName: data.fullName, email: data.email, phone: data.phone ?? '' });
  }, [data]);

  const { data: depts } = useQuery({ queryKey: ['departments'], queryFn: () => departmentsApi.list().then(r => r.data.data) });

  const updateMut = useMutation({
    mutationFn: () => usersApi.update(Number(id), form),
    onSuccess: () => { setEditing(false); qc.invalidateQueries({ queryKey: ['user', id] }); },
    onError: (err) => setError(apiError(err)),
  });

  const resetMut = useMutation({
    mutationFn: () => usersApi.resetPassword(Number(id)),
    onSuccess: (res) => setTempPwd(res.data.tempPassword),
  });

  const cloneMut = useMutation({
    mutationFn: () => usersApi.clone(Number(id), cloneForm),
    onSuccess: (res) => { setCloneModal(false); navigate(`/admin/users/${res.data.data.id}`); },
    onError: (err) => setError(apiError(err)),
  });

  if (isLoading) return <PageSpinner />;
  if (!data) return <p className="text-gray-500">User not found.</p>;

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const setC = (k: keyof typeof cloneForm) => (e: React.ChangeEvent<HTMLInputElement>) => setCloneForm(f => ({ ...f, [k]: e.target.value }));

  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-gray-800">{data.fullName}</h2>
            <p className="text-sm text-gray-500">@{data.username} · {data.department.name}</p>
          </div>
          <div className="flex gap-2">
            <Badge color={data.status === 'ACTIVE' ? 'green' : 'red'}>{data.status}</Badge>
            {data.lockedAt && <Badge color="red">Locked</Badge>}
          </div>
        </CardHeader>
        <CardBody>
          {editing ? (
            <div className="space-y-4">
              <Input label="Full name" value={form.fullName} onChange={set('fullName')} />
              <Input label="Email" type="email" value={form.email} onChange={set('email')} />
              <Input label="Phone" value={form.phone} onChange={set('phone')} />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3">
                <Button onClick={() => updateMut.mutate()} loading={updateMut.isPending}>Save</Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {([
                ['Email', data.email],
                ['Phone', data.phone || '—'],
                ['Department', data.department.name],
                ['Last login', data.lastLoginAt ? format(new Date(data.lastLoginAt), 'dd/MM/yyyy HH:mm') : '—'],
                ['Created', format(new Date(data.createdAt), 'dd/MM/yyyy')],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k}><dt className="text-gray-500">{k}</dt><dd className="font-medium">{v}</dd></div>
              ))}
            </dl>
          )}
        </CardBody>
      </Card>

      <div className="flex flex-wrap gap-3">
        {canEdit('ADMIN') && !editing && <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>}
        {isIT && <Button variant="secondary" onClick={() => resetMut.mutate()} loading={resetMut.isPending}>Reset password</Button>}
        {isIT && <Button variant="secondary" onClick={() => setCloneModal(true)}>Clone user</Button>}
        <Button variant="secondary" onClick={() => navigate('/admin/users')}>Back to list</Button>
      </div>

      <Modal open={!!tempPwd} title="Password Reset" onClose={() => setTempPwd('')}>
        <div className="rounded-md bg-gray-100 px-4 py-3 font-mono text-lg text-center tracking-widest select-all">{tempPwd}</div>
        <p className="mt-3 text-xs text-gray-500">Share securely. User must change on next login.</p>
      </Modal>

      <Modal open={cloneModal} title="Clone User" onClose={() => setCloneModal(false)}>
        <div className="space-y-3">
          <p className="text-sm text-gray-600">Creates a new user copying dept &amp; access from <strong>{data.fullName}</strong>.</p>
          <Input label="Full name" value={cloneForm.fullName} onChange={setC('fullName')} />
          <Input label="Username" value={cloneForm.username} onChange={setC('username')} />
          <Input label="Email" type="email" value={cloneForm.email} onChange={setC('email')} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button onClick={() => cloneMut.mutate()} loading={cloneMut.isPending}>Clone</Button>
            <Button variant="secondary" onClick={() => setCloneModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
