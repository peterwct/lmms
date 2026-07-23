import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { ChevronLeft, Pencil } from 'lucide-react';
import { resortsApi } from '../../api/resorts';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, CardBody } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { ProductBadge } from '../../components/ProductBadge';
import { ResortFormModal } from './ResortFormModal';
import type { ResortInfoCategory } from '../../types';

const INFO_MAX_CHARS = 400;

const INFO_TABS: { key: ResortInfoCategory; label: string }[] = [
  { key: 'GETTING_THERE',     label: 'Getting There' },
  { key: 'RESORT_FACILITY',   label: 'Resort Facilities' },
  { key: 'PLACE_OF_INTEREST', label: 'Places of Interest' },
  { key: 'UNIT_AMENITY',      label: 'Unit Amenities' },
];

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm text-gray-900">{value || '—'}</p>
    </div>
  );
}

function YesNo({ value }: { value?: string | null }) {
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${value === 'Y' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
      {value === 'Y' ? 'Yes' : 'No'}
    </span>
  );
}

export function ResortDetail() {
  const { id } = useParams<{ id: string }>();
  const { canEdit } = useAuth();
  const qc = useQueryClient();
  const editable = canEdit('RESORTS_SETUP');

  const [tab, setTab] = useState<ResortInfoCategory>('GETTING_THERE');
  const [editModal, setEditModal] = useState(false);
  const [editingTab, setEditingTab] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const { data: resort, isLoading } = useQuery({
    queryKey: ['resort', id],
    queryFn: () => resortsApi.get(id!).then(r => r.data.data),
    enabled: !!id,
  });

  const saveInfoMut = useMutation({
    mutationFn: (lines: string[]) => resortsApi.saveInfo(id!, { category: tab, lines }),
    onSuccess: () => {
      setEditingTab(false);
      qc.invalidateQueries({ queryKey: ['resort', id] });
    },
    onError: (err) => setError(apiError(err)),
  });

  const activeTab = INFO_TABS.find(t => t.key === tab)!;
  const viewLines = resort?.info[tab] ?? [];

  const startEditTab = () => {
    setText(viewLines.join('\n'));
    setError('');
    setEditingTab(true);
  };

  const switchTab = (key: ResortInfoCategory) => {
    setTab(key);
    setEditingTab(false);
    setError('');
  };

  const saveTab = () => {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.join('\n').length > INFO_MAX_CHARS) {
      setError(`${activeTab.label} allows at most ${INFO_MAX_CHARS} characters in total.`);
      return;
    }
    setError('');
    saveInfoMut.mutate(lines);
  };

  if (isLoading || !resort) return <PageSpinner />;

  const cityStateCountry = [resort.city, resort.state, resort.country].filter(Boolean).join(', ');

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <Link to="/resorts/setup" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
            <ChevronLeft className="h-4 w-4" /> Resorts Setup
          </Link>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-semibold text-gray-900">{resort.resortName}</h1>
            <ProductBadge coCode={resort.coCode} />
            <span className={`text-xs font-semibold px-2 py-0.5 rounded ${resort.status === 'A' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {resort.status === 'A' ? 'Active' : 'Inactive'}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500 font-mono">{resort.resortCode}{resort.shortName ? ` · ${resort.shortName}` : ''}</p>
        </div>
        {editable && (
          <Button size="sm" variant="secondary" onClick={() => setEditModal(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
      </div>

      {/* ── Details card ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader><p className="font-semibold text-gray-700">Resort Details</p></CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
            <div className="col-span-2">
              <p className="text-xs text-gray-500">Address</p>
              <p className="text-sm text-gray-900">
                {[resort.add1, resort.add2, resort.add3].filter(Boolean).join(', ') || '—'}
              </p>
              <p className="text-sm text-gray-900">{cityStateCountry}</p>
            </div>
            <Field label="Telephone" value={resort.telNo} />
            <Field label="Fax" value={resort.faxNo} />
            <Field label="Check-in time" value={resort.checkInTime} />
            <Field label="Check-out time" value={resort.checkOutTime} />
            <Field label="Contact person" value={resort.contactPerson} />
            <Field label="Resort management" value={resort.resortMgmt} />
            <Field label="RCI code" value={resort.rciCode} />
            <div>
              <p className="text-xs text-gray-500 mb-0.5">RCI Affiliation</p>
              <YesNo value={resort.rciAffiliate} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Lock-on / lock-off</p>
              <YesNo value={resort.lockOnOff} />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Payment</p>
              <YesNo value={resort.paymt} />
            </div>
          </div>
        </CardBody>
      </Card>

      {/* ── Info tabs ────────────────────────────────────────────────── */}
      <Card>
        <div className="flex gap-1 border-b px-4 pt-2">
          {INFO_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label} ({(resort.info[t.key] ?? []).length})
            </button>
          ))}
        </div>
        <CardBody>
          {!editingTab ? (
            <>
              {viewLines.length ? (
                <div className="space-y-0.5">
                  {viewLines.map((line, i) => (
                    <p key={i} className="text-sm text-gray-800">{line}</p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No {activeTab.label.toLowerCase()} information recorded.</p>
              )}
              {editable && (
                <div className="mt-4">
                  <Button size="sm" variant="secondary" onClick={startEditTab}>
                    <Pencil className="h-3.5 w-3.5" /> {viewLines.length ? `Edit ${activeTab.label.toLowerCase()}` : `Add ${activeTab.label.toLowerCase()}`}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="max-w-xl space-y-2">
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                rows={10}
                maxLength={INFO_MAX_CHARS}
                spellCheck={false}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400">{text.length}/{INFO_MAX_CHARS} characters</p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex gap-3 pt-1">
                <Button size="sm" onClick={saveTab} loading={saveInfoMut.isPending}>Save</Button>
                <Button size="sm" variant="secondary" onClick={() => { setEditingTab(false); setError(''); }}>Cancel</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <ResortFormModal open={editModal} resort={resort} onClose={() => setEditModal(false)} />
    </div>
  );
}
