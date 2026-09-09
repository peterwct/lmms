import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { departmentsApi } from '../../api/departments';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Badge } from '../../components/ui/Badge';
import { Info } from 'lucide-react';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { PageSpinner } from '../../components/ui/Spinner';
import type { AppModule, Permission, Department } from '../../types';

// RESORTS_SETUP is deliberately ABSENT: it is granted per user via RESORTS_SETUP_ACCESS, so its
// department-matrix row has no effect and showing four dead checkboxes was misleading. The modal
// carries a note pointing at the user profile instead. Do not add it back without also changing
// requireResortsSetupAccess (backend) and the AuthContext note that mirrors it.
const MODULES: AppModule[] = ['ADMIN', 'MEMBERS', 'AGREEMENTS', 'AMC_BILLING', 'RESORT_BOOKING', 'ENTITLEMENTS', 'PBS_SCHEME'];
const MODULE_LABELS: Record<AppModule, string> = {
  ADMIN: 'Admin', MEMBERS: 'Members', AGREEMENTS: 'Agreements',
  // Resort Booking also gates the RCI module (fns 1-3), which is why the label names both.
  AMC_BILLING: 'AMC Billing', RESORT_BOOKING: 'Resort Booking / RCI', ENTITLEMENTS: 'Entitlements',
  PBS_SCHEME: 'Zurich PBS', RESORTS_SETUP: 'Resorts Setup',
};

type PermMap = Record<AppModule, Omit<Permission, 'module'>>;

export function Departments() {
  const { isIT } = useAuth();
  const qc = useQueryClient();
  const [permModal, setPermModal] = useState<number | null>(null);
  const [newDeptModal, setNewDeptModal] = useState(false);
  const [newDept, setNewDept] = useState({ name: '', description: '' });
  const [localPerms, setLocalPerms] = useState<PermMap>({} as PermMap);
  const [error, setError] = useState('');

  const { data, isLoading } = useQuery<Department[]>({
    queryKey: ['departments'],
    queryFn: () => departmentsApi.list().then(r => r.data.data),
  });

  const createMut = useMutation({
    mutationFn: () => departmentsApi.create(newDept),
    onSuccess: () => { setNewDeptModal(false); setNewDept({ name: '', description: '' }); qc.invalidateQueries({ queryKey: ['departments'] }); },
    onError: (err) => setError(apiError(err)),
  });

  const permQuery = useQuery({
    queryKey: ['dept-perms', permModal],
    queryFn: () => departmentsApi.getPermissions(permModal!).then(r => r.data.data),
    enabled: permModal !== null,
  });

  useEffect(() => {
    if (permQuery.data) {
      const map = {} as PermMap;
      permQuery.data.permissions.forEach((p: Permission) => {
        map[p.module] = { canView: p.canView, canCreate: p.canCreate, canEdit: p.canEdit, canDelete: p.canDelete };
      });
      setLocalPerms(map);
    }
  }, [permQuery.data]);

  const savePermsMut = useMutation({
    mutationFn: () => departmentsApi.updatePermissions(permModal!, localPerms),
    onSuccess: () => { setPermModal(null); qc.invalidateQueries({ queryKey: ['departments'] }); },
  });

  const togglePerm = (mod: AppModule, field: keyof Omit<Permission, 'module'>) => {
    setLocalPerms(prev => ({ ...prev, [mod]: { ...prev[mod], [field]: !prev[mod]?.[field] } }));
  };

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {isIT && <Button size="sm" onClick={() => setNewDeptModal(true)}>+ New department</Button>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.map(dept => (
          <Card key={dept.id}>
            <CardHeader className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-gray-800">{dept.name}</p>
                {dept.isLocked && <Badge color="purple" className="mt-0.5">IT — Locked</Badge>}
              </div>
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{dept._count?.users ?? 0} users</span>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-500 mb-3">{dept.description || '—'}</p>
              {isIT && !dept.isLocked && (
                <Button variant="secondary" size="sm" onClick={() => setPermModal(dept.id)}>Edit permissions</Button>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <Modal open={newDeptModal} title="New Department" onClose={() => setNewDeptModal(false)}>
        <div className="space-y-3">
          <Input label="Name" value={newDept.name} onChange={e => setNewDept(f => ({ ...f, name: e.target.value }))} required />
          <Input label="Description" value={newDept.description} onChange={e => setNewDept(f => ({ ...f, description: e.target.value }))} />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button onClick={() => createMut.mutate()} loading={createMut.isPending}>Create</Button>
            <Button variant="secondary" onClick={() => setNewDeptModal(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal open={permModal !== null} title={`Permissions — ${data?.find(d => d.id === permModal)?.name}`} onClose={() => setPermModal(null)} size="lg">
        {permQuery.isLoading ? <PageSpinner /> : (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-2 text-left text-gray-500">Module</th>
                    {['View', 'Create', 'Edit', 'Delete'].map(a => (
                      <th key={a} className="py-2 text-center text-gray-500">{a}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {MODULES.map(mod => (
                    <tr key={mod}>
                      <td className="py-2 font-medium">{MODULE_LABELS[mod]}</td>
                      {(['canView', 'canCreate', 'canEdit', 'canDelete'] as const).map(field => (
                        <td key={field} className="py-2 text-center">
                          <input type="checkbox"
                            checked={localPerms[mod]?.[field] ?? false}
                            onChange={() => togglePerm(mod, field)}
                            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 flex gap-2.5">
              <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
              <p className="text-xs text-amber-900">
                <strong>Resorts Setup is not set here.</strong> It is granted to individual users, not to a
                whole department — open <strong>Admin &rarr; Users &rarr;</strong> the user, and grant
                &ldquo;Resorts Setup (module)&rdquo; under <strong>Report &amp; Function Access</strong>.
                A granted user gets full access to all 10 Resorts Setup functions; IT always has it.
                <br />
                RCI (Enrolment, Weekly Interval, Bulk Bank) is separate and <em>is</em> set here — it
                follows <strong>Resort Booking / RCI</strong> above.
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={() => savePermsMut.mutate()} loading={savePermsMut.isPending}>Save permissions</Button>
              <Button variant="secondary" onClick={() => setPermModal(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
