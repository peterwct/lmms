import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search, CopyPlus } from 'lucide-react';
import { publicHolidaysApi } from '../../api/resorts';
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
import type { PublicHoliday } from '../../types';

const EMPTY_FORM = { holidayDate: '', description: '' };

// Stored dates are UTC midnight — show the calendar date, and feed <input type="date"> a YYYY-MM-DD value
const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : '');

// timeZone: 'UTC' is required — without it a UTC-midnight date renders as the previous day
const dayName = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) : '';

const describe = (h: PublicHoliday) => `${dateOnly(h.holidayDate)} ${h.description}`;

interface ModalProps {
  open: boolean;
  holiday: PublicHoliday | null;   // null = add mode
  onClose: () => void;
  onSaved: (saved: PublicHoliday, mode: 'add' | 'edit') => void;
}

function PublicHolidayFormModal({ open, holiday, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(holiday ? {
      holidayDate: dateOnly(holiday.holidayDate),
      description: holiday.description,
    } : { ...EMPTY_FORM });
  }, [open, holiday]);

  const saveMut = useMutation({
    // the raw YYYY-MM-DD string goes straight through — no Date construction
    mutationFn: () => {
      const payload = { holidayDate: form.holidayDate, description: form.description.trim() };
      return holiday
        ? publicHolidaysApi.update(holiday.id, payload)
        : publicHolidaysApi.create(payload);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['public-holidays'] });
      qc.invalidateQueries({ queryKey: ['public-holiday-years'] });
      onSaved(r.data.data, holiday ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const canSave = form.holidayDate !== '' && form.description.trim() !== '';

  return (
    <Modal open={open} title={holiday ? 'Edit Public Holiday' : 'Add Public Holiday'} onClose={onClose}>
      <div className="space-y-3">
        <Input
          label="Date"
          type="date"
          value={form.holidayDate}
          onChange={e => setForm(f => ({ ...f, holidayDate: e.target.value }))}
          required
        />
        <Input
          label="Holiday"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value.toUpperCase() }))}
          maxLength={40}
          placeholder="e.g. CHINESE NEW YEAR"
          required
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!canSave}>
          {holiday ? 'Save changes' : 'Add holiday'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

interface CloneProps {
  open: boolean;
  years: number[];
  onClose: () => void;
  onCloned: (message: string) => void;
}

function CloneYearModal({ open, years, onClose, onCloned }: CloneProps) {
  const qc = useQueryClient();
  const [sourceYear, setSourceYear] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setSourceYear(years.length ? String(years[0]) : '');   // years arrive newest first
  }, [open, years]);

  const cloneMut = useMutation({
    mutationFn: () => publicHolidaysApi.clone({ sourceYear: Number(sourceYear) }),
    onSuccess: (r) => {
      const { sourceYear: src, targetYear, created } = r.data.data;
      qc.invalidateQueries({ queryKey: ['public-holidays'] });
      qc.invalidateQueries({ queryKey: ['public-holiday-years'] });
      onCloned(
        `Cloned ${created} holiday(s) from ${src} to ${targetYear}, on the same month and day. ` +
        `Review every date and correct it — lunar and Islamic holidays shift each year.`
      );
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  return (
    <Modal open={open} title="Clone Holidays to Next Year" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Copies every holiday of the selected year into the following year, keeping the same
          month and day. Most Malaysian holidays move each year, so treat the result as a
          starting point and edit each date afterwards.
        </p>
        <Select label="Clone from year" value={sourceYear} onChange={e => setSourceYear(e.target.value)} required>
          <option value="">Select year...</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </Select>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Creates holidays for</label>
          <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm font-mono text-gray-800">
            {sourceYear ? Number(sourceYear) + 1 : '—'}
          </div>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => cloneMut.mutate()} loading={cloneMut.isPending} disabled={!sourceYear}>
          Clone holidays
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function PublicHolidays() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const year = searchParams.get('year') ?? '';
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; holiday: PublicHoliday | null }>({ open: false, holiday: null });
  const [cloneOpen, setCloneOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PublicHoliday | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const { data: holidays, isLoading } = useQuery({
    queryKey: ['public-holidays', q, year],
    queryFn: () => publicHolidaysApi.list({
      q: q || undefined,
      year: year ? Number(year) : undefined,
    }).then(r => r.data.data),
  });

  const { data: years } = useQuery({
    queryKey: ['public-holiday-years'],
    queryFn: () => publicHolidaysApi.years().then(r => r.data.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => publicHolidaysApi.remove(id),
    onSuccess: (_res, id) => {
      const gone = holidays?.find(h => h.id === id);
      qc.invalidateQueries({ queryKey: ['public-holidays'] });
      qc.invalidateQueries({ queryKey: ['public-holiday-years'] });
      setDeleteTarget(null);
      if (gone) setResult(`Public holiday deleted — ${describe(gone)}.`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const setParams = (next: { q?: string; year?: string }) => {
    const p: Record<string, string> = {};
    const nq = next.q ?? q;
    const ny = next.year ?? year;
    if (nq) p.q = nq;
    if (ny) p.year = ny;
    setSearchParams(p, { replace: true });
  };

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams({ q: searchInput.trim() });
  };

  const clearSearch = () => { setSearchInput(''); setSearchParams({}, { replace: true }); };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">Public Holidays Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          National public holiday calendar. Clone a year forward, then correct each date.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={doSearch} className="flex flex-wrap items-center gap-2">
            <div className="w-32">
              <Select value={year} onChange={e => setParams({ year: e.target.value })} title="Filter by year">
                <option value="">All years</option>
                {years?.map(y => <option key={y} value={y}>{y}</option>)}
              </Select>
            </div>
            <div className="w-64">
              <Input
                placeholder="Search holiday name"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value.toUpperCase())}
              />
            </div>
            <Button type="submit" size="sm" variant="secondary"><Search className="h-4 w-4" /> Search</Button>
            {(q || year) && <Button type="button" size="sm" variant="secondary" onClick={clearSearch}>Clear</Button>}
          </form>
          {canCreate('RESORTS_SETUP') && (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setCloneOpen(true)}>
                <CopyPlus className="h-4 w-4" /> Clone to next year
              </Button>
              <Button size="sm" onClick={() => setModal({ open: true, holiday: null })}>
                <Plus className="h-4 w-4" /> Add holiday
              </Button>
            </div>
          )}
        </CardHeader>

        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Date</th>
                  <th className="px-4 py-3 text-left">Day</th>
                  <th className="px-4 py-3 text-left">Year</th>
                  <th className="px-4 py-3 text-left">Holiday</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {holidays?.map(h => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono">{dateOnly(h.holidayDate)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{dayName(h.holidayDate)}</td>
                    <td className="px-4 py-2.5 font-mono text-gray-500">{h.year}</td>
                    <td className="px-4 py-2.5 font-medium">{h.description}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        {canEdit('RESORTS_SETUP') && (
                          <button onClick={() => setModal({ open: true, holiday: h })} title="Edit"
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 hover:text-blue-600">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {canDelete('RESORTS_SETUP') && (
                          <button
                            onClick={() => { setDelErr(''); setDeleteTarget(h); }}
                            title="Delete" className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-600">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {holidays?.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No public holidays found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <PublicHolidayFormModal
        open={modal.open}
        holiday={modal.holiday}
        onClose={() => setModal({ open: false, holiday: null })}
        onSaved={(h, mode) => setResult(`Public holiday ${mode === 'add' ? 'added' : 'updated'} — ${describe(h)}.`)}
      />

      <CloneYearModal
        open={cloneOpen}
        years={years ?? []}
        onClose={() => setCloneOpen(false)}
        onCloned={setResult}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title="Delete public holiday?"
        description="This permanently removes the holiday from the calendar. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'Date',    value: <span className="font-mono font-medium">{dateOnly(deleteTarget.holidayDate)}</span> },
          { label: 'Day',     value: dayName(deleteTarget.holidayDate) },
          { label: 'Holiday', value: <span className="font-medium">{deleteTarget.description}</span> },
        ] : []}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete holiday"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
