import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// CP Season calendar (Resorts Setup fn 8) — one row per calendar day graded
// G=Gold / S=Silver / D=Diamond, driving CP points pricing per night.
//
// PRODUCT SCOPE: this is the only holiday/peak calendar CP booking reads.
// PublicHoliday and SchoolHoliday are LHC-only — never join or derive across them.
//
// Dates are UTC-midnight business dates, parsed with Date.UTC, never `new Date(str)`.

const SEASONS = ['G', 'S', 'D'] as const;

const DAY_MS = 86_400_000;

const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD');

const cloneSchema = z.object({
  sourceYear: z.number().int().min(1900).max(2999),
});

// Bulk save of one month's grading — the screen edits a whole month at a time
const saveMonthSchema = z.object({
  year:  z.number().int().min(1900).max(2999),
  month: z.number().int().min(1).max(12),
  days:  z.array(z.object({ date: dateStr, season: z.enum(SEASONS) })).min(1).max(31),
});

// Parse a YYYY-MM-DD string to a UTC-midnight Date (business-date convention)
function toUtcMidnight(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// First and last UTC-midnight day of a calendar month
function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  // First of the following month, minus one day = last day of this one (leap-safe)
  const end = new Date(Date.UTC(year, month, 1) - DAY_MS);
  return { start, end };
}

// The screen shows exactly one month at a time, so this returns every graded day in
// that month with NO pagination. Ungraded days simply aren't returned — the client
// scaffolds the full month and defaults the gaps.
export async function listCpSeasonMonth(req: Request, res: Response): Promise<void> {
  const year = parseInt(String(req.query.year), 10);
  const month = parseInt(String(req.query.month), 10);
  if (!(year >= 1900 && year <= 2999)) { res.status(400).json({ error: 'A valid year is required' }); return; }
  if (!(month >= 1 && month <= 12)) { res.status(400).json({ error: 'A valid month (1-12) is required' }); return; }

  const { start, end } = monthRange(year, month);
  const dates = await prisma.cpSeasonDate.findMany({
    where: { date: { gte: start, lte: end } },
    orderBy: [{ date: 'asc' }],
  });

  res.json({ year, month, data: dates });
}

// Distinct years present in the calendar, newest first — feeds the Year dropdown
export async function getCpSeasonYears(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.cpSeasonDate.groupBy({
    by: ['year'],
    orderBy: { year: 'desc' },
  });
  res.json({ data: rows.map(r => r.year) });
}

// Save a whole month's grading in one go — this is both the "add a new month" and
// the "edit an existing month" path, since the screen edits a month at a time.
export async function saveCpSeasonMonth(req: Request, res: Response): Promise<void> {
  const parsed = saveMonthSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const { year, month, days } = parsed.data;
  const { start, end } = monthRange(year, month);

  // Every submitted day must belong to the month being saved, so a stale form can't
  // silently write into a neighbouring month
  const rows = days.map(d => ({ date: toUtcMidnight(d.date), season: d.season }));
  const stray = rows.find(r => r.date < start || r.date > end);
  if (stray) { res.status(400).json({ error: `${iso(stray.date)} is outside ${year}-${String(month).padStart(2, '0')}` }); return; }

  const seen = new Set(rows.map(r => r.date.getTime()));
  if (seen.size !== rows.length) { res.status(400).json({ error: 'Duplicate dates in the submitted month' }); return; }

  const before = await prisma.cpSeasonDate.count({ where: { date: { gte: start, lte: end } } });

  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      await tx.cpSeasonDate.upsert({
        where:  { date: r.date },
        update: { season: r.season, updatedAt: new Date() },
        create: { id: randomUUID(), date: r.date, season: r.season, year: r.date.getUTCFullYear(), updatedAt: new Date() },
      });
    }
  }, { maxWait: 15_000, timeout: 120_000 });

  const result = { year, month, days: rows.length, created: rows.length - before, updated: before };

  await writeAudit({
    userId: req.user.id,
    action: `Saved CP season month ${year}-${String(month).padStart(2, '0')} (${rows.length} days)`,
    actionType: before > 0 ? 'UPDATE' : 'CREATE',
    targetType: 'CpSeasonDate',
    metadata: result,
  });

  res.status(before > 0 ? 200 : 201).json({ data: result });
}

// Delete every graded day in a month — deletion is month-scoped by design
export async function deleteCpSeasonMonth(req: Request, res: Response): Promise<void> {
  const year = parseInt(String(req.query.year), 10);
  const month = parseInt(String(req.query.month), 10);
  if (!(year >= 1900 && year <= 2999)) { res.status(400).json({ error: 'A valid year is required' }); return; }
  if (!(month >= 1 && month <= 12)) { res.status(400).json({ error: 'A valid month (1-12) is required' }); return; }

  const { start, end } = monthRange(year, month);
  const result = await prisma.cpSeasonDate.deleteMany({ where: { date: { gte: start, lte: end } } });
  if (result.count === 0) { res.status(404).json({ error: `No season dates found for ${year}-${String(month).padStart(2, '0')}` }); return; }

  await writeAudit({
    userId: req.user.id,
    action: `Deleted CP season month ${year}-${String(month).padStart(2, '0')} (${result.count} days)`,
    actionType: 'DELETE',
    targetType: 'CpSeasonDate',
    metadata: { year, month, deleted: result.count },
  });

  res.json({ data: { year, month, deleted: result.count } });
}

// Copy a year's grading forward to the NEXT year on the same month/day, for staff
// to review and correct (peak dates shift annually).
export async function cloneCpSeasonYear(req: Request, res: Response): Promise<void> {
  const parsed = cloneSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const sourceYear = parsed.data.sourceYear;
  const targetYear = sourceYear + 1;

  const source = await prisma.cpSeasonDate.findMany({
    where: { year: sourceYear },
    orderBy: { date: 'asc' },
  });
  if (source.length === 0) { res.status(404).json({ error: `No season dates found for ${sourceYear}` }); return; }

  // Refuse rather than duplicate or overwrite — a second click must not silently
  // discard grading that has already been corrected in the target year.
  const existing = await prisma.cpSeasonDate.count({ where: { year: targetYear } });
  if (existing > 0) {
    res.status(409).json({ error: `${targetYear} already has ${existing} graded day(s). Delete them first, or clone from a different year.` });
    return;
  }

  // Same month/day in the target year. Leap-year caveat: cloning INTO a leap year
  // leaves 29 Feb ungraded (no source day), and cloning OUT of one rolls 29 Feb onto
  // 1 Mar where skipDuplicates drops it. Either way the target needs a gap check —
  // acceptable, since every cloned year is reviewed.
  const rows = source.map(r => ({
    id: randomUUID(),
    date: new Date(Date.UTC(targetYear, r.date.getUTCMonth(), r.date.getUTCDate())),
    season: r.season,
    year: targetYear,
    updatedAt: new Date(),
  }));

  const result = await prisma.cpSeasonDate.createMany({ data: rows as never, skipDuplicates: true });

  await writeAudit({
    userId: req.user.id,
    action: `Cloned CP season calendar ${sourceYear} -> ${targetYear} (${result.count} days)`,
    actionType: 'CREATE',
    targetType: 'CpSeasonDate',
    metadata: { sourceYear, targetYear, created: result.count },
  });

  res.status(201).json({ data: { sourceYear, targetYear, created: result.count } });
}
