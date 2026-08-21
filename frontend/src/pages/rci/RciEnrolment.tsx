import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search, Eye } from 'lucide-react';
import { rciEnrolmentsApi } from '../../api/rci';
import { useActiveProducts, productOptions } from '../../hooks/useActiveProducts';
import { apiError } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { ResultDialog } from '../../components/ui/ResultDialog';
import { ConfirmDeleteModal } from '../../components/ui/ConfirmDeleteModal';
import { Card, CardHeader } from '../../components/ui/Card';
import { PageSpinner } from '../../components/ui/Spinner';
import { RecordCount } from '../../components/ui/RecordCount';
import { Pagination } from '../../components/ui/Pagination';
import { ProductBadge } from '../../components/ProductBadge';
import type { RciEnrolment as RciEnrolmentRow } from '../../types';

const PAGE_SIZE = 50;

// re_rci_status. C dominates the migrated data (11,685 of 17,915), then A (5,961).
const RCI_STATUS_LABELS: Record<string, string> = {
  A: 'A — Active',
  C: 'C — Cancelled',
  M: 'M — Matured',
  T: 'T — Terminated',
};

const STATUS_BADGE: Record<string, string> = {
  A: 'bg-green-100 text-green-700',
  C: 'bg-gray-100 text-gray-600',
  M: 'bg-blue-100 text-blue-700',
  T: 'bg-red-100 text-red-700',
};

const EMPTY_FORM = {
  coCode: '', membershipNo: '', agreementNo: '',
  rciNo: '', rciStatus: 'A', renewalDate: '', expiryDate: '',
  rciFees: '', totInterval: '1', resortCode: '',
  firstName1: '', lastName1: '', name1: '',
  firstName2: '', lastName2: '', coOwner: '',
  mailAdd1: '', mailAdd2: '', mailAdd3: '', mailCityState: '', mailPostcode: '',
  malaysia: 'Y', telNo1: '', telNo2: '',
};

// Stored dates are UTC midnight; <input type="date"> wants YYYY-MM-DD
const dateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};
const fmtFees = (v: string | null) => (v == null ? '—' : Number(v).toFixed(2));

interface ModalProps {
  open: boolean;
  row: RciEnrolmentRow | null;   // null = add mode
  onClose: () => void;
  onSaved: (saved: RciEnrolmentRow, mode: 'add' | 'edit') => void;
}

function RciEnrolmentFormModal({ open, row, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const { products, allProducts } = useActiveProducts();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(row ? {
      coCode: row.coCode, membershipNo: row.membershipNo, agreementNo: row.agreementNo,
      rciNo: row.rciNo ?? '', rciStatus: row.rciStatus ?? 'A',
      renewalDate: dateInput(row.renewalDate), expiryDate: dateInput(row.expiryDate),
      rciFees: row.rciFees != null ? String(Number(row.rciFees)) : '',
      totInterval: String(row.totInterval),
      resortCode: row.resortCode ?? '',
      firstName1: row.firstName1 ?? '', lastName1: row.lastName1 ?? '', name1: row.name1 ?? '',
      firstName2: row.firstName2 ?? '', lastName2: row.lastName2 ?? '', coOwner: row.coOwner ?? '',
      mailAdd1: row.mailAdd1 ?? '', mailAdd2: row.mailAdd2 ?? '', mailAdd3: row.mailAdd3 ?? '',
      mailCityState: row.mailCityState ?? '', mailPostcode: row.mailPostcode ?? '',
      malaysia: row.malaysia ?? 'Y',
      telNo1: row.telNo1 ?? '', telNo2: row.telNo2 ?? '',
    } : { ...EMPTY_FORM });
  }, [open, row]);

  // Confirms the agreement exists and names the member, so staff can check they are
  // enrolling the right one before saving. Add mode only — the key is fixed after that.
  const key = { coCode: form.coCode, membershipNo: form.membershipNo.trim(), agreementNo: form.agreementNo.trim() };
  const keyComplete = !!(key.coCode && key.membershipNo && key.agreementNo);
  const { data: lookup, isFetching: looking, isError: lookupFailed } = useQuery({
    queryKey: ['rci-lookup', key.coCode, key.membershipNo, key.agreementNo],
    queryFn: () => rciEnrolmentsApi.lookup(key).then(r => r.data.data),
    enabled: open && !row && keyComplete,
    retry: false,
  });

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        rciNo: form.rciNo.trim() || null,
        rciStatus: form.rciStatus || null,
        renewalDate: form.renewalDate || null,
        expiryDate: form.expiryDate || null,
        rciFees: form.rciFees === '' ? null : Number(form.rciFees),
        totInterval: form.totInterval === '' ? 1 : Number(form.totInterval),
        resortCode: form.resortCode.trim() || null,
        firstName1: form.firstName1.trim() || null,
        lastName1: form.lastName1.trim() || null,
        name1: form.name1.trim() || null,
        firstName2: form.firstName2.trim() || null,
        lastName2: form.lastName2.trim() || null,
        coOwner: form.coOwner.trim() || null,
        mailAdd1: form.mailAdd1.trim() || null,
        mailAdd2: form.mailAdd2.trim() || null,
        mailAdd3: form.mailAdd3.trim() || null,
        mailCityState: form.mailCityState.trim() || null,
        mailPostcode: form.mailPostcode.trim() || null,
        malaysia: form.malaysia || null,
        telNo1: form.telNo1.trim() || null,
        telNo2: form.telNo2.trim() || null,
      };
      return row
        ? rciEnrolmentsApi.update(row.id, payload)
        : rciEnrolmentsApi.create({ ...key, ...payload });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['rci-enrolments'] });
      onSaved(r.data.data, row ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  // auto-uppercase text inputs (project convention)
  const setU = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value.toUpperCase() }));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const canSave = row ? true : (keyComplete && !!lookup);

  return (
    <Modal open={open} title={row ? 'Edit RCI Enrolment' : 'Add RCI Enrolment'} onClose={onClose} size="lg">
      <div className="space-y-4">
        {/* Agreement — immutable after create (move = delete + re-add) */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Agreement</h3>
          {row ? (
            <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-500">Product:</span> <span className="font-mono">{row.coCode}</span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="text-gray-500">Membership:</span> <span className="font-mono font-medium">{row.membershipNo}</span>
              <span className="mx-2 text-gray-300">|</span>
              <span className="text-gray-500">Agreement:</span> <span className="font-mono font-medium">{row.agreementNo}</span>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Select label="Product" value={form.coCode} onChange={set('coCode')} required>
                  <option value="">Select...</option>
                  {productOptions(products, allProducts, form.coCode).map(p => (
                    <option key={p.coCode} value={p.coCode}>{p.coCode} — {p.coName}</option>
                  ))}
                </Select>
                <Input label="Membership no" value={form.membershipNo} onChange={setU('membershipNo')} maxLength={19} required />
                <Input label="Agreement no" value={form.agreementNo} onChange={setU('agreementNo')} maxLength={8} required />
              </div>
              {keyComplete && (
                <p className={`mt-1.5 text-xs ${lookup ? 'text-green-700' : 'text-amber-600'}`}>
                  {looking ? 'Checking agreement...'
                    : lookup ? `Agreement found — ${lookup.memberName ?? 'name unavailable'} (${lookup.acctClassify})`
                    : lookupFailed ? 'No such agreement for this membership and product.'
                    : ''}
                </p>
              )}
            </>
          )}
        </section>

        {/* RCI */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">RCI</h3>
          <div className="grid grid-cols-3 gap-3">
            <Input label="RCI no" value={form.rciNo} onChange={setU('rciNo')} maxLength={10} />
            <Select label="RCI status" value={form.rciStatus} onChange={set('rciStatus')}>
              {Object.entries(RCI_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </Select>
            <Input label="Resort code" value={form.resortCode} onChange={setU('resortCode')} maxLength={8} />
            <Input label="Renewal date" type="date" value={form.renewalDate} onChange={set('renewalDate')} />
            <Input label="Expiry date" type="date" value={form.expiryDate} onChange={set('expiryDate')} />
            <Input label="RCI fees" type="number" step="0.01" min={0} value={form.rciFees} onChange={set('rciFees')} />
            <Input label="Total intervals" type="number" min={0} max={99} value={form.totInterval} onChange={set('totInterval')} />
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            Renewal and expiry dates are recorded for information only — members renew directly with RCI.
          </p>
        </section>

        {/* Names */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Enrolled names</h3>
          <div className="grid grid-cols-3 gap-3">
            <Input label="First name 1" value={form.firstName1} onChange={setU('firstName1')} maxLength={10} />
            <Input label="Last name 1" value={form.lastName1} onChange={setU('lastName1')} maxLength={20} />
            <Input label="Full name 1" value={form.name1} onChange={setU('name1')} maxLength={40} />
            <Input label="First name 2" value={form.firstName2} onChange={setU('firstName2')} maxLength={10} />
            <Input label="Last name 2" value={form.lastName2} onChange={setU('lastName2')} maxLength={20} />
            <Input label="Co-owner" value={form.coOwner} onChange={setU('coOwner')} maxLength={40} />
          </div>
        </section>

        {/* Mailing address */}
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Mailing address</h3>
          <div className="space-y-3">
            <Input label="Address 1" value={form.mailAdd1} onChange={setU('mailAdd1')} maxLength={30} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Address 2" value={form.mailAdd2} onChange={setU('mailAdd2')} maxLength={30} />
              <Input label="Address 3" value={form.mailAdd3} onChange={setU('mailAdd3')} maxLength={30} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Input label="City / state" value={form.mailCityState} onChange={setU('mailCityState')} maxLength={30} />
              <Input label="Postcode" value={form.mailPostcode} onChange={setU('mailPostcode')} maxLength={7} />
              <Select label="Malaysian address" value={form.malaysia} onChange={set('malaysia')}>
                <option value="Y">Y — Malaysia</option>
                <option value="N">N — Overseas</option>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Tel 1" value={form.telNo1} onChange={setU('telNo1')} maxLength={18} />
              <Input label="Tel 2" value={form.telNo2} onChange={setU('telNo2')} maxLength={18} />
            </div>
          </div>
        </section>
      </div>

      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!canSave}>
          {row ? 'Save changes' : 'Add enrolment'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? '—'}</dd>
    </div>
  );
}

function RciEnrolmentDetailModal({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['rci-enrolments', 'detail', id],
    queryFn: () => rciEnrolmentsApi.get(id as string).then(r => r.data.data),
    enabled: !!id,
  });

  const addr = data
    ? [data.mailAdd1, data.mailAdd2, data.mailAdd3, data.mailCityState, data.mailPostcode].filter(Boolean).join(', ')
    : '';

  return (
    <Modal open={!!id} title="RCI Enrolment" onClose={onClose} size="lg">
      {isLoading || !data ? <PageSpinner /> : (
        <div className="space-y-4">
          <dl className="grid grid-cols-3 gap-3">
            <DetailRow label="Serial no" value={<span className="font-mono">{data.serialNo}</span>} />
            <DetailRow label="Product" value={<ProductBadge coCode={data.coCode} />} />
            <DetailRow label="Status" value={
              <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[data.rciStatus ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                {RCI_STATUS_LABELS[data.rciStatus ?? ''] ?? data.rciStatus ?? '—'}
              </span>
            } />
            <DetailRow label="Membership no" value={<span className="font-mono">{data.membershipNo}</span>} />
            <DetailRow label="Agreement no" value={<span className="font-mono">{data.agreementNo}</span>} />
            <DetailRow label="Member" value={data.memberName ?? '—'} />
            <DetailRow label="RCI no" value={<span className="font-mono">{data.rciNo ?? '—'}</span>} />
            <DetailRow label="Renewal date" value={fmtDate(data.renewalDate)} />
            <DetailRow label="Expiry date" value={fmtDate(data.expiryDate)} />
            <DetailRow label="RCI fees" value={fmtFees(data.rciFees)} />
            <DetailRow label="Intervals" value={data.totInterval} />
            <DetailRow label="Resort code" value={data.resortCode ?? '—'} />
            <DetailRow label="Name 1" value={data.name1 ?? ([data.firstName1, data.lastName1].filter(Boolean).join(' ') || '—')} />
            <DetailRow label="Name 2" value={[data.firstName2, data.lastName2].filter(Boolean).join(' ') || '—'} />
            <DetailRow label="Co-owner" value={data.coOwner ?? '—'} />
          </dl>
          <div>
            <dt className="text-xs text-gray-500">Mailing address ({data.malaysia === 'N' ? 'overseas' : 'Malaysia'})</dt>
            <dd className="text-sm text-gray-900">{addr || '—'}</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <DetailRow label="Tel 1" value={data.telNo1 ?? '—'} />
            <DetailRow label="Tel 2" value={data.telNo2 ?? '—'} />
          </div>
        </div>
      )}
      <div className="mt-4">
        <Button variant="secondary" onClick={onClose}>Close</Button>
      </div>
    </Modal>
  );
}

export function RciEnrolment() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const coCode = searchParams.get('coCode') ?? '';
  const rciStatus = searchParams.get('status') ?? '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; row: RciEnrolmentRow | null }>({ open: false, row: null });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RciEnrolmentRow | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const { products, allProducts } = useActiveProducts();

  const setParams = (next: { q?: string; coCode?: string; status?: string; page?: number }) => {
    const p: Record<string, string> = {};
    const nq = next.q ?? q;
    const nc = next.coCode ?? coCode;
    const ns = next.status ?? rciStatus;
    const np = next.page ?? 1;   // any filter change resets to page 1
    if (nq) p.q = nq;
    if (nc) p.coCode = nc;
    if (ns) p.status = ns;
    if (np > 1) p.page = String(np);
    setSearchParams(p, { replace: true });
  };

  const { data: list, isLoading } = useQuery({
    queryKey: ['rci-enrolments', q, coCode, rciStatus, page],
    queryFn: () => rciEnrolmentsApi.list({
      q: q || undefined,
      coCode: coCode || undefined,
      rciStatus: rciStatus || undefined,
      page,
      pageSize: PAGE_SIZE,
    }).then(r => r.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => rciEnrolmentsApi.remove(id),
    onSuccess: (_res, id) => {
      const gone = list?.data.find(r => r.id === id);
      qc.invalidateQueries({ queryKey: ['rci-enrolments'] });
      setDeleteTarget(null);
      if (gone) setResult(`RCI enrolment deleted — ${gone.membershipNo} / ${gone.agreementNo} (RCI ${gone.rciNo ?? '—'}).`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams({ q: searchInput.trim(), page: 1 });
  };

  const clearSearch = () => { setSearchInput(''); setParams({ q: '', coCode: '', status: '', page: 1 }); };

  // After adding, filter to the new record's membership so it is visible
  // (a plain refetch could leave it on another page)
  const focusCreated = (r: RciEnrolmentRow) => {
    setSearchInput(r.membershipNo);
    setParams({ q: r.membershipNo, coCode: '', status: '', page: 1 });
  };

  const pages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="space-y-4">
      <div>
        <Link to="/rci" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> RCI
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">1. RCI Enrolment</h1>
        <p className="mt-1 text-sm text-gray-500">
          Members enrolled with Resort Condominiums International. One record per enrolment — an agreement may hold more than one.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={doSearch} className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select value={coCode} onChange={e => setParams({ coCode: e.target.value, page: 1 })}>
                <option value="">All products</option>
                {productOptions(products, allProducts, coCode).map(p => (
                  <option key={p.coCode} value={p.coCode}>{p.coCode} — {p.coName}</option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select value={rciStatus} onChange={e => setParams({ status: e.target.value, page: 1 })}>
                <option value="">All statuses</option>
                {Object.entries(RCI_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </div>
            <div className="w-72">
              <Input
                placeholder="Search membership / agreement / RCI no / name"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
            {(q || coCode || rciStatus) && <Button type="button" size="sm" variant="secondary" onClick={clearSearch}>Clear</Button>}
          </form>
          {canCreate('RESORTS_SETUP') && (
            <Button size="sm" onClick={() => setModal({ open: true, row: null })}><Plus className="h-4 w-4" /> Add enrolment</Button>
          )}
        </CardHeader>

        {!isLoading && (
          <div className="border-b bg-gray-50/60 px-4 py-2">
            <RecordCount total={list?.total} />
          </div>
        )}

        {isLoading ? <PageSpinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-3 text-left">Membership No</th>
                    <th className="px-4 py-3 text-left">Agreement</th>
                    <th className="px-4 py-3 text-left">Product</th>
                    <th className="px-4 py-3 text-left">RCI No</th>
                    <th className="px-4 py-3 text-left">Name</th>
                    <th className="px-4 py-3 text-left">Expiry</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {list?.data.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono">{r.membershipNo}</td>
                      <td className="px-4 py-2.5 font-mono font-medium">{r.agreementNo}</td>
                      <td className="px-4 py-2.5"><ProductBadge coCode={r.coCode} /></td>
                      <td className="px-4 py-2.5 font-mono">{r.rciNo ?? '—'}</td>
                      <td className="px-4 py-2.5">{r.name1 ?? ([r.firstName1, r.lastName1].filter(Boolean).join(' ') || '—')}</td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.expiryDate)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${STATUS_BADGE[r.rciStatus ?? ''] ?? 'bg-gray-100 text-gray-500'}`}>
                          {r.rciStatus ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setDetailId(r.id)} title="View"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          {canEdit('RESORTS_SETUP') && (
                            <button onClick={() => setModal({ open: true, row: r })} title="Edit"
                              className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {canDelete('RESORTS_SETUP') && (
                            <button onClick={() => { setDelErr(''); setDeleteTarget(r); }} title="Delete"
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {list?.data.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No RCI enrolments found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {list && (
              <Pagination
                page={list.page}
                pages={pages}
                total={list.total}
                limit={list.pageSize}
                onPage={p => setParams({ page: p })}
              />
            )}
          </>
        )}
      </Card>

      <RciEnrolmentFormModal
        open={modal.open}
        row={modal.row}
        onClose={() => setModal({ open: false, row: null })}
        onSaved={(r, mode) => {
          if (mode === 'add') focusCreated(r);
          setResult(
            mode === 'add'
              ? `RCI enrolment added — ${r.membershipNo} / ${r.agreementNo} (RCI ${r.rciNo ?? '—'}), serial ${r.serialNo}.`
              : `RCI enrolment updated — ${r.membershipNo} / ${r.agreementNo} (RCI ${r.rciNo ?? '—'}).`
          );
        }}
      />

      <RciEnrolmentDetailModal id={detailId} onClose={() => setDetailId(null)} />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete RCI enrolment?"
        description="This permanently removes the enrolment record. The agreement and its member are not affected. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'Membership', value: <span className="font-mono font-medium">{deleteTarget.membershipNo}</span> },
          { label: 'Agreement',  value: <span className="font-mono font-medium">{deleteTarget.agreementNo}</span> },
          { label: 'RCI no',     value: <span className="font-mono">{deleteTarget.rciNo ?? '—'}</span> },
          { label: 'Serial no',  value: <span className="font-mono">{deleteTarget.serialNo}</span> },
        ] : []}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete enrolment"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
