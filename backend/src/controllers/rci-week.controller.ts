import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// RCI week-number calendar - RCI function 2 (Weekly Interval).
//
// A year holds 52 or 53 weeks, each running Friday -> the FOLLOWING Friday, so
// consecutive weeks share a boundary date and the last week of a year crosses into the
// next. Every row is derivable from the year alone (verified against all 209 migrated
// rows of 2026-2029), which is why a year is added as a whole and needs no start date.
//
// There is deliberately NO update handler: a week cannot be edited, only a whole year
// added or removed.

// Dates are UTC-midnight business dates, built with Date.UTC, never `new Date(str)`
const DAY_MS = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

// The register starts here - older Informix years were deliberately not migrated.
const MIN_YEAR = 2026;
const MAX_YEAR = 2999;

const createYearSchema = z.object({
  year: z.number().int().min(MIN_YEAR).max(MAX_YEAR),
});

// First Friday on or after 1 Jan. NOTE getUTCDay(): Sunday=0 ... Friday=5.
function firstFriday(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  return new Date(jan1.getTime() + ((5 - jan1.getUTCDay() + 7) % 7) * DAY_MS);
}

// A year holds exactly the whole weeks between its first Friday and the next year's -
// 52, or 53 when the extra Friday fits. Saturday dates trail the Friday pair by a day;
// they are stored for fidelity with Informix but are not shown on screen.
export function generateWeeks(year: number) {
  const start = firstFriday(year);
  const count = Math.round((firstFriday(year + 1).getTime() - start.getTime()) / (7 * DAY_MS));
  // 52/53 is a property of the Gregorian calendar - anything else is a bug, not bad input
  if (count !== 52 && count !== 53) throw new Error(`Derived ${count} weeks for ${year}`);

  return Array.from({ length: count }, (_, i) => {
    const friStart = new Date(start.getTime() + i * 7 * DAY_MS);
    const friEnd   = new Date(friStart.getTime() + 7 * DAY_MS);
    return {
      weekNo:   i + 1,
      friStart,
      friEnd,
      satStart: new Date(friStart.getTime() + DAY_MS),
      satEnd:   new Date(friEnd.getTime() + DAY_MS),
    };
  });
}

// Year comes from a query param on the read and delete paths (no body to validate)
function yearParam(req: Request): number | null {
  const y = parseInt(String(req.query.year), 10);
  return y >= MIN_YEAR && y <= MAX_YEAR ? y : null;
}

export async function listRciWeeks(req: Request, res: Response): Promise<void> {
  const year = yearParam(req);
  if (year === null) { res.status(400).json({ error: 'A valid year is required' }); return; }

  // 52/53 rows - the whole year is returned unpaginated, like the CP season month
  const weeks = await prisma.rciWeek.findMany({
    where: { year },
    orderBy: { weekNo: 'asc' },
  });

  res.json({ data: weeks, year, weeks: weeks.length });
}

export async function listRciWeekYears(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.rciWeek.groupBy({ by: ['year'], orderBy: { year: 'desc' } });
  res.json({ data: rows.map(r => r.year) });
}

export async function createRciWeekYear(req: Request, res: Response): Promise<void> {
  const parsed = createYearSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { year } = parsed.data;

  // A second click must not duplicate the year or half-write it
  const existing = await prisma.rciWeek.count({ where: { year } });
  if (existing > 0) {
    res.status(409).json({ error: `${year} already has ${existing} week(s). Delete the year first to regenerate it.` });
    return;
  }

  const weeks = generateWeeks(year);
  await prisma.rciWeek.createMany({
    data: weeks.map(w => ({ id: randomUUID(), year, ...w, updatedAt: new Date() })) as never,
  });

  const result = {
    year,
    weeks: weeks.length,
    firstFriday: weeks[0].friStart,
    lastWeekEnd: weeks[weeks.length - 1].friEnd,
  };

  await writeAudit({
    userId: req.user.id,
    action: `Created RCI week calendar for ${year} (${weeks.length} weeks)`,
    actionType: 'CREATE', targetType: 'RciWeek',
    // audit metadata must be JSON-serializable, so the dates go in as ISO strings
    metadata: {
      year, weeks: weeks.length,
      firstFriday: iso(result.firstFriday),
      lastWeekEnd: iso(result.lastWeekEnd),
    },
  });

  res.status(201).json({ data: result });
}

export async function deleteRciWeekYear(req: Request, res: Response): Promise<void> {
  const year = yearParam(req);
  if (year === null) { res.status(400).json({ error: 'A valid year is required' }); return; }

  // Whole-year delete - there is no per-week delete
  const result = await prisma.rciWeek.deleteMany({ where: { year } });
  if (result.count === 0) { res.status(404).json({ error: `No RCI weeks found for ${year}` }); return; }

  await writeAudit({
    userId: req.user.id,
    action: `Deleted RCI week calendar for ${year} (${result.count} weeks)`,
    actionType: 'DELETE', targetType: 'RciWeek', metadata: { year, deleted: result.count },
  });

  res.json({ data: { year, deleted: result.count } });
}
