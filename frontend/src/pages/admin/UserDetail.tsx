import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../api/users';
import { departmentsApi } from '../../api/departments';
import { reportsApi } from '../../api/reports';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { PageSpinner } from '../../components/ui/Spinner';
import type { User, UserReportAccessEntry, AccessKind } from '../../types';
import { format } from 'date-fns';
import clsx from 'clsx';

export function UserDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit, canDelete, isIT, user: me } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [cloneModal, setCloneModal] = useState(false);
  const [cloneForm, setCloneForm] = useState({ fullName: '', username: '', email: '' });
  const [form, setForm] = useState({ fullName: '', email: '', phone: '' });
  const [tempPwd, setTempPwd] = useState('');
  const [error, setError] = useState('');
  const [delOpen, setDelOpen] = useState(false);
  const [delErr, setDelErr] = useState('');
  // Local state, not a URL param: this is a tab inside a card on a detail page, not a list view
  // whose results Back should restore.
  const [accessTab, setAccessTab] = useState<AccessKind>('REPORT');

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

  const deleteMut = useMutation({
    mutationFn: () => usersApi.remove(Number(id)),
    onSuccess: () => {
      setDelOpen(false);
      qc.invalidateQueries({ queryKey: ['users'] });
      navigate('/admin/users');
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const { data: reportAccess } = useQuery<UserReportAccessEntry[]>({
    queryKey: ['reportAccess', id],
    queryFn: () => reportsApi.getReportAccess(Number(id)).then(r => r.data.data),
    enabled: isIT && !!id,
  });

  const grantMut = useMutation({
    mutationFn: (reportKey: string) => reportsApi.grantReportAccess(Number(id), reportKey as import('../../types').ReportKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reportAccess', id] }),
  });

  const revokeMut = useMutation({
    mutationFn: (reportKey: string) => reportsApi.revokeReportAccess(Number(id), reportKey as import('../../types').ReportKey),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reportAccess', id] }),
  });

  // Split on the backend's `kind` rather than re-deriving it here, so the two cannot drift.
  // Numbering is per tab (1..n within Reports, 1..n within Functions), matching how the PBS and
  // Resorts Setup menus number their own functions.
  const reports   = useMemo(() => (reportAccess ?? []).filter(e => e.kind === 'REPORT'),   [reportAccess]);
  const functions = useMemo(() => (reportAccess ?? []).filter(e => e.kind === 'FUNCTION'), [reportAccess]);
  const shown = accessTab === 'REPORT' ? reports : functions;

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
        {canDelete('ADMIN') && data.id !== me?.id && (
          <Button variant="danger" onClick={() => { setDelErr(''); setDelOpen(true); }}>Delete user</Button>
        )}
      </div>

      {isIT && (
        <Card>
          <CardHeader>
            <h3 className="font-semibold text-gray-800">Report &amp; Function Access</h3>
            <p className="text-xs text-gray-500 mt-0.5">Grant or revoke access to individual reports and restricted functions for this user.</p>
          </CardHeader>

          {!data.department.isLocked && reportAccess && (
            <div className="flex gap-1 border-b px-4">
              {([
                { key: 'REPORT'   as AccessKind, label: 'Reports',   items: reports },
                { key: 'FUNCTION' as AccessKind, label: 'Functions', items: functions },
              ]).map(t => (
                <button
                  key={t.key}
                  onClick={() => setAccessTab(t.key)}
                  className={clsx(
                    'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                    accessTab === t.key
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  )}
                >
                  {t.label}
                  <span className="ml-1.5 text-xs text-gray-400">
                    {t.items.filter(e => e.granted).length}/{t.items.length}
                  </span>
                </button>
              ))}
            </div>
          )}

          <CardBody>
            {data.department.isLocked ? (
              <p className="text-sm text-gray-500">IT department has access to all reports and restricted functions by default.</p>
            ) : reportAccess ? (
              <div className="divide-y divide-gray-100">
                {shown.map((entry, i) => (
                  <div key={entry.reportKey} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex gap-2.5 min-w-0">
                      {/* Numbered per tab, so Functions restarts at 1 rather than continuing the reports. */}
                      <span className="text-sm text-gray-400 tabular-nums shrink-0 w-5 text-right">{i + 1}.</span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800">{entry.label}</p>
                        {entry.granted && entry.grantedBy && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            Granted by {entry.grantedBy.fullName}
                            {entry.grantedAt ? ` on ${format(new Date(entry.grantedAt), 'dd/MM/yyyy')}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <Badge color={entry.granted ? 'green' : 'gray'}>{entry.granted ? 'Granted' : 'No access'}</Badge>
                      {entry.granted ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => revokeMut.mutate(entry.reportKey)}
                          loading={revokeMut.isPending && revokeMut.variables === entry.reportKey}
                        >
                          Revoke
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => grantMut.mutate(entry.reportKey)}
                          loading={grantMut.isPending && grantMut.variables === entry.reportKey}
                        >
                          Grant
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                {shown.length === 0 && (
                  <p className="text-sm text-gray-400 py-3">Nothing in this tab.</p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Loading...</p>
            )}
          </CardBody>
        </Card>
      )}

      <Modal open={!!tempPwd} title="Password Reset" onClose={() => setTempPwd('')}>
        <div className="rounded-md bg-gray-100 px-4 py-3 font-mono text-lg text-center tracking-widest select-all">{tempPwd}</div>
        <p className="mt-3 text-xs text-gray-500">Share securely. User must change on next login.</p>
      </Modal>

      <ConfirmDeleteModal
        open={delOpen}
        title="Delete User"
        description={
          'This permanently removes the user ID and its report access. The account cannot log in again '
          + 'and the username becomes available for reuse. Their audit log history is kept. '
          + 'To bar access without removing the ID, suspend the account instead.'
        }
        rows={[
          { label: 'Name',       value: data.fullName },
          { label: 'Username',   value: data.username },
          { label: 'Department', value: data.department.name },
          { label: 'Status',     value: data.status },
          { label: 'Last login', value: data.lastLoginAt ? format(new Date(data.lastLoginAt), 'dd/MM/yyyy HH:mm') : 'Never' },
        ]}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete user"
        onConfirm={() => deleteMut.mutate()}
        onClose={() => { setDelOpen(false); setDelErr(''); }}
      />

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
