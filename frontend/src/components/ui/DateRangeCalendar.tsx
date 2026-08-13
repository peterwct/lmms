import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

// Inline month calendar for picking one inclusive date range, with days the caller
// forbids rendered greyed and unclickable. Built here rather than with a native
// <input type="date"> because the browser control only honours min/max — it cannot grey
// out individual days, which is the whole point (days already under maintenance, or
// already claimed by another range in the same form, must not be pickable).
//
// All dates are plain YYYY-MM-DD strings, so every comparison is a string compare and no
// timezone conversion ever happens (stored dates are UTC midnight business dates).

export type DayRange = { start: string; end: string };   // '' when unset

interface Props {
  value: DayRange;
  min: string;                 // first selectable day (inclusive)
  max: string;                 // last selectable day (inclusive)
  blocked?: DayRange[];        // spans that cannot be picked or spanned
  onChange: (next: DayRange) => void;
  onDone?: () => void;         // fired once a complete range is picked
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n: number) => String(n).padStart(2, '0');
const key = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const monthKey = (s: string) => s.slice(0, 7);

// Any blocked span intersecting [a,b] — inclusive on both ends, matching the server
const hits = (blocked: DayRange[], a: string, b: string) =>
  blocked.some(x => x.start <= b && x.end >= a);

// The month to open on: whatever is already picked, else THIS month — availability often
// starts years back (1 Jan 2026 and earlier), and opening there means paging forward every
// time. Clamped into the allowed window so the view always has selectable days.
function initialMonth(picked: string, min: string, max: string): string {
  if (picked) return monthKey(picked);
  const now = new Date();
  const current = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  if (current < monthKey(min)) return monthKey(min);
  if (current > monthKey(max)) return monthKey(max);
  return current;
}

export function DateRangeCalendar({ value, min, max, blocked = [], onChange, onDone }: Props) {
  const [cursor, setCursor] = useState(() => initialMonth(value.start, min, max));

  useEffect(() => {
    if (value.start) setCursor(monthKey(value.start));
  }, [value.start]);

  const [year, month] = useMemo(() => {
    const [y, m] = cursor.split('-').map(Number);
    return [y, m - 1];
  }, [cursor]);

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(year, month + delta, 1));
    setCursor(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  // Don't page outside the allowed window — there is nothing selectable there
  const canPrev = monthKey(min) < cursor;
  const canNext = cursor < monthKey(max);

  const firstDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => key(year, month, i + 1)),
  ];

  const isBlocked = (day: string) => day < min || day > max || hits(blocked, day, day);

  const pick = (day: string) => {
    // No start yet, a complete range already picked, or a click before the start:
    // begin a new range. Same when completing would span a blocked day.
    if (!value.start || value.end || day < value.start || hits(blocked, value.start, day)) {
      onChange({ start: day, end: '' });
      return;
    }
    onChange({ start: value.start, end: day });
    onDone?.();
  };

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={!canPrev}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-medium text-gray-800">{MONTH_NAMES[month]} {year}</span>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={!canNext}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-xs text-gray-400">
        {WEEKDAYS.map(d => <span key={d} className="py-1">{d}</span>)}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (!day) return <span key={`e${i}`} />;
          const off = isBlocked(day);
          const isStart = day === value.start;
          const isEnd = day === value.end;
          const inRange = !!value.end && day > value.start && day < value.end;
          return (
            <button
              key={day}
              type="button"
              disabled={off}
              title={off ? 'Not available' : undefined}
              onClick={() => pick(day)}
              className={clsx(
                'rounded py-1 text-xs',
                off && 'cursor-not-allowed bg-gray-100 text-gray-300 line-through',
                !off && !isStart && !isEnd && !inRange && 'text-gray-700 hover:bg-blue-50',
                inRange && 'bg-blue-100 text-blue-800',
                (isStart || isEnd) && 'bg-blue-600 font-medium text-white',
              )}
            >
              {Number(day.slice(8))}
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs text-gray-500">
        {value.start && !value.end
          ? `Start ${value.start} — now pick the end date.`
          : 'Click the start date, then the end date. Crossed-out days are not available.'}
      </p>
    </div>
  );
}
