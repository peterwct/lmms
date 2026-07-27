import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search, CopyPlus } from 'lucide-react';
import { schoolHolidaysApi } from '../../api/resorts';
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
import type { SchoolHoliday } from '../../types';

const EMPTY_FORM = { academicYear: '', startDate: '', endDate: '', description: '' };

const DAY_MS = 86_400_000;

// Stored dates are UTC midnight — show the calendar date, and feed <input type="date"> a YYYY-MM-DD value
const dateOnly = (iso: string) => (iso ? iso.slice(0, 10) : '');

// Inclusive day count across the range
const dayCount = (start: string, end: string) =>
  Math.round((new Date(end).getTime() - new Date(start).getTime()) / DAY_MS) + 1;

const describe = (h: SchoolHoliday) =>
  `${h.description} (AY ${h.academicYear}), ${dateOnly(h.startDate)} to ${dateOnly(h.endDate)}`;

interface ModalProps {
  open: boolean;
  holiday: SchoolHoliday | null;   // null = add mode
  onClose: () => void;
  onSaved: (saved: SchoolHoliday, mode: 'add' | 'edit') => void;
}

function SchoolHolidayFormModal({ open, holiday, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(holiday ? {
      academicYear: String(holiday.academicYear),
      startDate: dateOnly(holiday.startDate),
      endDate: dateOnly(holiday.endDate),
      description: holiday.description,
    } : { ...EMPTY_FORM });
  }, [open, holiday]);

  // Picking a start date fills the academic year only while it is still blank — a
  // default, not an override, since a session can belong to the previous year.
  const onStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const startDate = e.target.value;
    setForm(f => ({
      ...f,
      startDate,
      academicYear: f.academicYear === '' && startDate ? startDate.slice(0, 4) : f.academicYear,
    }));
  };

  const saveMut = useMutation({
    // raw YYYY-MM-DD strings go straight through — no Date construction
    mutationFn: () => {
      const payload = {
        academicYear: Number(form.academicYear),
        startDate: form.startDate,
        endDate: form.endDate,
        description: form.description.trim(),
      };
      return holiday
        ? schoolHolidaysApi.update(holiday.id, payload)
        : schoolHolidaysApi.create(payload);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['school-holidays'] });
      qc.invalidateQueries({ queryKey: ['school-holiday-years'] });
      onSaved(r.data.data, holiday ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const datesOutOfOrder = form.startDate !== '' && form.endDate !== '' && form.startDate > form.endDate;
  const yearValid = /^\d{4}$/.test(form.academicYear);
  const canSave = yearValid && form.startDate !== '' && form.endDate !== ''
    && !datesOutOfOrder && form.description.trim() !== '';

  return (
    <Modal open={open} title={holiday ? 'Edit School Holiday' : 'Add School Holiday'} onClose={onClose}>
      <div className="space-y-3">
        <Input
          label="Academic year"
          type="number"
          min={1900}
          max={2999}
          value={form.academicYear}
          onChange={e => setForm(f => ({ ...f, academicYear: e.target.value }))}
          required
        />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Start date" type="date" value={form.startDate} onChange={onStartDateChange} required />
          <Input
            label="End date"
            type="date"
            value={form.endDate}
            min={form.startDate || undefined}
            onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
            required
          />
        </div>
        {datesOutOfOrder && (
          <p className="text-xs text-red-600 -mt-1">End date must be on or after start date.</p>
        )}
        <Input
          label="Holiday"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value.toUpperCase() }))}
          maxLength={40}
          placeholder="e.g. TERM 1 SCHOOL HOLIDAYS"
          required
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!canSave}>
          {holiday ? 'Save changes' : 'Add school holiday'}
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
    mutationFn: () => schoolHolidaysApi.clone({ sourceYear: Number(sourceYear) }),
    onSuccess: (r) => {
      const { sourceYear: src, targetYear, created } = r.data.data;
      qc.invalidateQueries({ queryKey: ['school-holidays'] });
      qc.invalidateQueries({ queryKey: ['school-holiday-years'] });
      onCloned(
        `Cloned ${created} school holiday(s) from academic year ${src} to ${targetYear}, on the same ` +
        `month and day. Review every range and correct it — term dates shift each year.`
      );
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  return (
    <Modal open={open} title="Clone School Holidays to Next Year" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          Copies every school holiday of the selected academic year into the following year,
          keeping the same month and day at both ends. Term dates change each year, so treat
          the result as a starting point and edit each range afterwards.
        </p>
        <Select label="Clone from academic year" value={sourceYear} onChange={e => setSourceYear(e.target.value)} required>
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
          Clone school holidays
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function SchoolHolidays() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const q = searchParams.get('q') ?? '';
  const year = searchParams.get('year') ?? '';
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; holiday: SchoolHoliday | null }>({ open: false, holiday: null });
  const [cloneOpen, setCloneOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SchoolHoliday | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const { data: holidays, isLoading } = useQuery({
    queryKey: ['school-holidays', q, year],
    queryFn: () => schoolHolidaysApi.list({
      q: q || undefined,
      academicYear: year ? Number(year) : undefined,
    }).then(r => r.data.data),
  });

  const { data: years } = useQuery({
    queryKey: ['school-holiday-years'],
    queryFn: () => schoolHolidaysApi.years().then(r => r.data.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => schoolHolidaysApi.remove(id),
    onSuccess: (_res, id) => {
      const gone = holidays?.find(h => h.id === id);
      qc.invalidateQueries({ queryKey: ['school-holidays'] });
      qc.invalidateQueries({ queryKey: ['school-holiday-years'] });
      setDeleteTarget(null);
      if (gone) setResult(`School holiday deleted — ${describe(gone)}.`);
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
        <h1 className="mt-1 text-xl font-semibold text-gray-900">School Holidays Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          School break date ranges by academic year. Clone a year forward, then correct each range.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={doSearch} className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <Select value={year} onChange={e => setParams({ year: e.target.value })} title="Filter by academic year">
                <option value="">All academic years</option>
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
                <Plus className="h-4 w-4" /> Add school holiday
              </Button>
            </div>
          )}
        </CardHeader>

        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Academic Year</th>
                  <th className="px-4 py-3 text-left">Start</th>
                  <th className="px-4 py-3 text-left">End</th>
                  <th className="px-4 py-3 text-right">Days</th>
                  <th className="px-4 py-3 text-left">Holiday</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {holidays?.map(h => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono">{h.academicYear}</td>
                    <td className="px-4 py-2.5 font-mono">{dateOnly(h.startDate)}</td>
                    <td className="px-4 py-2.5 font-mono">{dateOnly(h.endDate)}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-gray-500">{dayCount(h.startDate, h.endDate)}</td>
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
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No school holidays found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SchoolHolidayFormModal
        open={modal.open}
        holiday={modal.holiday}
        onClose={() => setModal({ open: false, holiday: null })}
        onSaved={(h, mode) => setResult(`School holiday ${mode === 'add' ? 'added' : 'updated'} — ${describe(h)}.`)}
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
        title="Delete school holiday?"
        description="This permanently removes the school holiday from the calendar. This cannot be undone."
        rows={deleteTarget ? [
          { label: 'Academic year', value: <span className="font-mono font-medium">{deleteTarget.academicYear}</span> },
          { label: 'Dates',         value: <span className="font-mono">{dateOnly(deleteTarget.startDate)} to {dateOnly(deleteTarget.endDate)}</span> },
          { label: 'Holiday',       value: <span className="font-medium">{deleteTarget.description}</span> },
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
