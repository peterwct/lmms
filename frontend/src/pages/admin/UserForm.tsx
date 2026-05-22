import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { usersApi } from '../../api/users';
import { departmentsApi } from '../../api/departments';
import { apiError } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';

export function UserForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullName: '', username: '', email: '', phone: '',
    password: '', departmentId: '',
  });
  const [error, setError] = useState('');
  const [tempPwd, setTempPwd] = useState('');

  const { data: depts } = useQuery({
    queryKey: ['departments'],
    queryFn: () => departmentsApi.list().then(r => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: () => usersApi.create({ ...form, departmentId: parseInt(form.departmentId) }),
    onSuccess: (res) => {
      setTempPwd(res.data.tempPassword ?? form.password);
      setTimeout(() => navigate(`/admin/users/${res.data.data.id}`), 2000);
    },
    onError: (err) => setError(apiError(err)),
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); setError(''); createMut.mutate(); };

  return (
    <div className="max-w-xl">
      <Card>
        <CardHeader><h2 className="font-semibold text-gray-800">Create New User</h2></CardHeader>
        <CardBody>
          {tempPwd ? (
            <div className="space-y-3 text-center">
              <p className="text-green-700 font-medium">User created successfully!</p>
              <div className="rounded-md bg-gray-100 px-4 py-3 font-mono text-lg tracking-widest select-all">{tempPwd}</div>
              <p className="text-xs text-gray-500">Temporary password — share securely. Redirecting…</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Input label="Full name" value={form.fullName} onChange={set('fullName')} required />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Username" value={form.username} onChange={set('username')} required />
                <Input label="Email" type="email" value={form.email} onChange={set('email')} required />
              </div>
              <Input label="Phone" value={form.phone} onChange={set('phone')} />
              <Input label="Password" type="password" value={form.password} onChange={set('password')}
                placeholder="Min 8 chars, 1 number, 1 special" required />
              <Select label="Department" value={form.departmentId} onChange={set('departmentId')} required>
                <option value="">Select…</option>
                {depts?.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-2">
                <Button type="submit" loading={createMut.isPending}>Create user</Button>
                <Button type="button" variant="secondary" onClick={() => navigate('/admin/users')}>Cancel</Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
