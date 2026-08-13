import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Plus, Pencil, Trash2, Search, CopyPlus } from 'lucide-react';
import clsx from 'clsx';
import { holidaysApi } from '../../api/resorts';
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
import type { Holiday, HolidayType } from '../../types';

// Public holidays (single dates) and school holidays (date ranges) share one table and
// this one screen; the tab picks which kind is being maintained. Each tab keeps its own
// columns, year-filter label and Clone action — they are different enough to be worth it.

const TABS: { key: HolidayType; slug: string; label: string }[] = [
  { key: 'PUBLIC', slug: 'public', label: 'Public Holidays' },
  { key: 'SCHOOL', slug: 'school', label: 'School Holidays' },
];

const DAY_MS = 86_400_000;

const EMPTY_FORM = { year: '', startDate: '', endDate: '', description: '' };

// Stored dates are UTC midnight — show the calendar date, and feed <input type="date"> a YYYY-MM-DD value
const dateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

// timeZone: 'UTC' is required — without it a UTC-midnight date renders as the previous day
const dayName = (iso: string) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' }) : '';

// Inclusive day count across the range
const dayCount = (start: string, end: string) =>
  Math.round((new Date(end).getTime() - new Date(start).getTime()) / DAY_MS) + 1;

const describe = (h: Holiday) =>
  h.holidayType === 'SCHOOL'
    ? `${h.description} (AY ${h.year}), ${dateOnly(h.startDate)} to ${dateOnly(h.endDate)}`
    : `${dateOnly(h.startDate)} ${h.description}`;

const kindWord = (t: HolidayType) => (t === 'SCHOOL' ? 'School holiday' : 'Public holiday');

interface ModalProps {
  open: boolean;
  type: HolidayType;
  holiday: Holiday | null;   // null = add mode
  onClose: () => void;
  onSaved: (saved: Holiday, mode: 'add' | 'edit') => void;
}

function HolidayFormModal({ open, type, holiday, onClose, onSaved }: ModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [error, setError] = useState('');

  const isSchool = type === 'SCHOOL';

  useEffect(() => {
    if (!open) return;
    setError('');
    setForm(holiday ? {
      year: String(holiday.year),
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
      year: f.year === '' && startDate ? startDate.slice(0, 4) : f.year,
    }));
  };

  const saveMut = useMutation({
    // raw YYYY-MM-DD strings go straight through — no Date construction.
    // A public holiday sends neither endDate nor year: it is one day, and the server
    // always derives its year from the date.
    mutationFn: () => {
      const payload = isSchool
        ? {
            holidayType: type,
            year: Number(form.year),
            startDate: form.startDate,
            endDate: form.endDate,
            description: form.description.trim(),
          }
        : {
            holidayType: type,
            startDate: form.startDate,
            description: form.description.trim(),
          };
      return holiday ? holidaysApi.update(holiday.id, payload) : holidaysApi.create(payload);
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['holidays'] });
      qc.invalidateQueries({ queryKey: ['holiday-years'] });
      onSaved(r.data.data, holiday ? 'edit' : 'add');
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  const datesOutOfOrder = isSchool && form.startDate !== '' && form.endDate !== '' && form.startDate > form.endDate;
  const canSave = form.startDate !== '' && form.description.trim() !== ''
    && (!isSchool || (/^\d{4}$/.test(form.year) && form.endDate !== '' && !datesOutOfOrder));

  const title = `${holiday ? 'Edit' : 'Add'} ${isSchool ? 'School' : 'Public'} Holiday`;

  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="space-y-3">
        {isSchool ? (
          <>
            <Input
              label="Academic year"
              type="number"
              min={1900}
              max={2999}
              value={form.year}
              onChange={e => setForm(f => ({ ...f, year: e.target.value }))}
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
          </>
        ) : (
          <Input
            label="Date"
            type="date"
            value={form.startDate}
            onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
            required
          />
        )}
        <Input
          label="Holiday"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value.toUpperCase() }))}
          maxLength={40}
          placeholder={isSchool ? 'e.g. TERM 1 SCHOOL HOLIDAYS' : 'e.g. CHINESE NEW YEAR'}
          required
        />
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex gap-3">
        <Button onClick={() => saveMut.mutate()} loading={saveMut.isPending} disabled={!canSave}>
          {holiday ? 'Save changes' : `Add ${isSchool ? 'school holiday' : 'holiday'}`}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

interface CloneProps {
  open: boolean;
  type: HolidayType;
  years: number[];
  onClose: () => void;
  onCloned: (message: string) => void;
}

function CloneYearModal({ open, type, years, onClose, onCloned }: CloneProps) {
  const qc = useQueryClient();
  const [sourceYear, setSourceYear] = useState('');
  const [error, setError] = useState('');

  const isSchool = type === 'SCHOOL';

  useEffect(() => {
    if (!open) return;
    setError('');
    setSourceYear(years.length ? String(years[0]) : '');   // years arrive newest first
  }, [open, years]);

  const cloneMut = useMutation({
    mutationFn: () => holidaysApi.clone({ holidayType: type, sourceYear: Number(sourceYear) }),
    onSuccess: (r) => {
      const { sourceYear: src, targetYear, created } = r.data.data;
      qc.invalidateQueries({ queryKey: ['holidays'] });
      qc.invalidateQueries({ queryKey: ['holiday-years'] });
      onCloned(
        isSchool
          ? `Cloned ${created} school holiday(s) from academic year ${src} to ${targetYear}, on the same ` +
            `month and day. Review every range and correct it — term dates shift each year.`
          : `Cloned ${created} holiday(s) from ${src} to ${targetYear}, on the same month and day. ` +
            `Review every date and correct it — lunar and Islamic holidays shift each year.`
      );
      onClose();
    },
    onError: (err) => setError(apiError(err)),
  });

  return (
    <Modal
      open={open}
      title={isSchool ? 'Clone School Holidays to Next Year' : 'Clone Holidays to Next Year'}
      onClose={onClose}
    >
      <div className="space-y-3">
        <p className="text-sm text-gray-600">
          {isSchool
            ? 'Copies every school holiday of the selected academic year into the following year, ' +
              'keeping the same month and day at both ends. Term dates change each year, so treat ' +
              'the result as a starting point and edit each range afterwards.'
            : 'Copies every holiday of the selected year into the following year, keeping the same ' +
              'month and day. Most Malaysian holidays move each year, so treat the result as a ' +
              'starting point and edit each date afterwards.'}
        </p>
        <Select
          label={isSchool ? 'Clone from academic year' : 'Clone from year'}
          value={sourceYear}
          onChange={e => setSourceYear(e.target.value)}
          required
        >
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
          {isSchool ? 'Clone school holidays' : 'Clone holidays'}
        </Button>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

export function Holidays() {
  const { canCreate, canEdit, canDelete } = useAuth();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Tab lives in the URL alongside q + year, so Back restores the whole view
  const slug = searchParams.get('tab') === 'school' ? 'school' : 'public';
  const type: HolidayType = slug === 'school' ? 'SCHOOL' : 'PUBLIC';
  const isSchool = type === 'SCHOOL';

  const q = searchParams.get('q') ?? '';
  const year = searchParams.get('year') ?? '';
  const [searchInput, setSearchInput] = useState(q);

  const [modal, setModal] = useState<{ open: boolean; holiday: Holiday | null }>({ open: false, holiday: null });
  const [cloneOpen, setCloneOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);
  const [delErr, setDelErr] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const { data: holidays, isLoading } = useQuery({
    queryKey: ['holidays', type, q, year],
    queryFn: () => holidaysApi.list({
      type,
      q: q || undefined,
      year: year ? Number(year) : undefined,
    }).then(r => r.data.data),
  });

  const { data: years } = useQuery({
    queryKey: ['holiday-years', type],
    queryFn: () => holidaysApi.years(type).then(r => r.data.data),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => holidaysApi.remove(id),
    onSuccess: (_res, id) => {
      const gone = holidays?.find(h => h.id === id);
      qc.invalidateQueries({ queryKey: ['holidays'] });
      qc.invalidateQueries({ queryKey: ['holiday-years'] });
      setDeleteTarget(null);
      if (gone) setResult(`${kindWord(gone.holidayType)} deleted — ${describe(gone)}.`);
    },
    onError: (err) => setDelErr(apiError(err)),
  });

  const setParams = (next: { q?: string; year?: string }) => {
    const p: Record<string, string> = {};
    const nq = next.q ?? q;
    const ny = next.year ?? year;
    if (slug !== 'public') p.tab = slug;
    if (nq) p.q = nq;
    if (ny) p.year = ny;
    setSearchParams(p, { replace: true });
  };

  // The two kinds have different year lists, so switching tabs drops the filters
  const switchTab = (nextSlug: string) => {
    setSearchInput('');
    setSearchParams(nextSlug === 'public' ? {} : { tab: nextSlug }, { replace: true });
  };

  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setParams({ q: searchInput.trim() });
  };

  const clearSearch = () => {
    setSearchInput('');
    setSearchParams(slug === 'public' ? {} : { tab: slug }, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <Link to="/resorts" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600">
          <ChevronLeft className="h-4 w-4" /> Resorts Setup
        </Link>
        <h1 className="mt-1 text-xl font-semibold text-gray-900">Public &amp; School Holidays Maintenance and Setup</h1>
        <p className="mt-1 text-sm text-gray-500">
          {isSchool
            ? 'School break date ranges by academic year. Clone a year forward, then correct each range.'
            : 'National public holiday calendar. Clone a year forward, then correct each date.'}
        </p>
      </div>

      <Card>
        <div className="flex gap-1 border-b px-4 pt-2">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.slug)}
              className={clsx(
                'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                type === t.key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <form onSubmit={doSearch} className="flex flex-wrap items-center gap-2">
            <div className={isSchool ? 'w-40' : 'w-32'}>
              <Select
                value={year}
                onChange={e => setParams({ year: e.target.value })}
                title={isSchool ? 'Filter by academic year' : 'Filter by year'}
              >
                <option value="">{isSchool ? 'All academic years' : 'All years'}</option>
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
                <Plus className="h-4 w-4" /> {isSchool ? 'Add school holiday' : 'Add holiday'}
              </Button>
            </div>
          )}
        </CardHeader>

        {!isLoading && (
          <div className="border-b bg-gray-50/60 px-4 py-2">
            <RecordCount total={holidays?.length} />
          </div>
        )}

        {isLoading ? <PageSpinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b text-xs text-gray-500 uppercase">
                {isSchool ? (
                  <tr>
                    <th className="px-4 py-3 text-left">Academic Year</th>
                    <th className="px-4 py-3 text-left">Start</th>
                    <th className="px-4 py-3 text-left">End</th>
                    <th className="px-4 py-3 text-right">Days</th>
                    <th className="px-4 py-3 text-left">Holiday</th>
                    <th className="px-4 py-3" />
                  </tr>
                ) : (
                  <tr>
                    <th className="px-4 py-3 text-left">Date</th>
                    <th className="px-4 py-3 text-left">Day</th>
                    <th className="px-4 py-3 text-left">Year</th>
                    <th className="px-4 py-3 text-left">Holiday</th>
                    <th className="px-4 py-3" />
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {holidays?.map(h => (
                  <tr key={h.id} className="hover:bg-gray-50">
                    {isSchool ? (
                      <>
                        <td className="px-4 py-2.5 font-mono">{h.year}</td>
                        <td className="px-4 py-2.5 font-mono">{dateOnly(h.startDate)}</td>
                        <td className="px-4 py-2.5 font-mono">{dateOnly(h.endDate)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-gray-500">
                          {h.endDate ? dayCount(h.startDate, h.endDate) : ''}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2.5 font-mono">{dateOnly(h.startDate)}</td>
                        <td className="px-4 py-2.5 text-gray-500">{dayName(h.startDate)}</td>
                        <td className="px-4 py-2.5 font-mono text-gray-500">{h.year}</td>
                      </>
                    )}
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
                  <tr>
                    <td colSpan={isSchool ? 6 : 5} className="px-4 py-8 text-center text-gray-400">
                      No {isSchool ? 'school holidays' : 'public holidays'} found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <HolidayFormModal
        open={modal.open}
        type={type}
        holiday={modal.holiday}
        onClose={() => setModal({ open: false, holiday: null })}
        onSaved={(h, mode) => setResult(`${kindWord(h.holidayType)} ${mode === 'add' ? 'added' : 'updated'} — ${describe(h)}.`)}
      />

      <CloneYearModal
        open={cloneOpen}
        type={type}
        years={years ?? []}
        onClose={() => setCloneOpen(false)}
        onCloned={setResult}
      />

      <ResultDialog message={result} onClose={() => setResult(null)} />

      <ConfirmDeleteModal
        open={!!deleteTarget}
        title={isSchool ? 'Delete school holiday?' : 'Delete public holiday?'}
        description={`This permanently removes the ${isSchool ? 'school holiday' : 'holiday'} from the calendar. This cannot be undone.`}
        rows={deleteTarget ? (
          deleteTarget.holidayType === 'SCHOOL' ? [
            { label: 'Academic year', value: <span className="font-mono font-medium">{deleteTarget.year}</span> },
            { label: 'Dates',         value: <span className="font-mono">{dateOnly(deleteTarget.startDate)} to {dateOnly(deleteTarget.endDate)}</span> },
            { label: 'Holiday',       value: <span className="font-medium">{deleteTarget.description}</span> },
          ] : [
            { label: 'Date',    value: <span className="font-mono font-medium">{dateOnly(deleteTarget.startDate)}</span> },
            { label: 'Day',     value: dayName(deleteTarget.startDate) },
            { label: 'Holiday', value: <span className="font-medium">{deleteTarget.description}</span> },
          ]
        ) : []}
        error={delErr}
        loading={deleteMut.isPending}
        confirmLabel="Delete holiday"
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
