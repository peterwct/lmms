import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Eye, ToggleLeft, ToggleRight, Trash2, Search } from 'lucide-react';
import { resortsApi } from '../../api/resorts';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { ProductBadge } from '../../components/ProductBadge';
import { ResortFormModal } from './ResortFormModal';
import type { Resort } from '../../types';

export function ResortMaster() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState(false);

  const { data: resorts, isLoading } = useQuery({
    queryKey: ['resorts', q],
    queryFn: () => resortsApi.list(q || undefined).then(r => r.data.data),
  });

  const toggleMut = useMutation({
    mutationFn: (id: string) => resortsApi.toggle(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resorts'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => resortsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['resorts'] }),
  });

  const openAdd = () => setModal(true);

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const next = searchInput.trim();
    setSearchParams(next ? { q: next } : {}, { replace: true });
  };

  const clearSearch = () => { setSearchInput(''); setSearchParams({}, { replace: true }); };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">Resorts Setup</h1>
        <p className="mt-1 text-sm text-gray-500">Resort master maintenance.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={doSearch} className="flex items-center gap-2">
            <div className="w-72">
              <Input
                placeholder="Search code / name / short name"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
            {q && <Button type="button" size="sm" variant="secondary" onClick={clearSearch}>Clear</Button>}
          </form>
          {canCreate('RESORTS_SETUP') && (
            <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4" /> Add resort</Button>
          )}
        </CardHeader>

        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Code</th>
                  <th className="px-4 py-3 text-left">Product</th>
                  <th className="px-4 py-3 text-left">Short</th>
                  <th className="px-4 py-3 text-left">Resort Name</th>
                  <th className="px-4 py-3 text-left">RCI Affiliation</th>
                  <th className="px-4 py-3 text-left">RCI Code</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {resorts?.map(r => (
                  <tr key={r.id} className={`hover:bg-gray-50 ${r.status !== 'A' ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-2.5 font-mono">{r.resortCode}</td>
                    <td className="px-4 py-2.5"><ProductBadge coCode={r.coCode} /></td>
                    <td className="px-4 py-2.5 font-mono">{r.shortName ?? '—'}</td>
                    <td className="px-4 py-2.5 font-medium">{r.resortName}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${r.rciAffiliate === 'Y' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.rciAffiliate === 'Y' ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 font-mono">{r.rciCode ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${r.status === 'A' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.status === 'A' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => navigate(`/resorts/setup/${r.id}`)} title="View" className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {canEdit('RESORTS_SETUP') && (
                          <button onClick={() => toggleMut.mutate(r.id)} title={r.status === 'A' ? 'Deactivate' : 'Activate'}
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                            {r.status === 'A' ? <ToggleRight className="h-4 w-4 text-green-600" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                        )}
                        {canDelete('RESORTS_SETUP') && (
                          <button
                            onClick={() => { if (window.confirm(`Delete resort ${r.resortCode} — ${r.resortName}?`)) deleteMut.mutate(r.id); }}
                            title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {resorts?.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No resorts found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ResortFormModal open={modal} resort={null} onClose={() => setModal(false)} />
    </div>
  );
}
