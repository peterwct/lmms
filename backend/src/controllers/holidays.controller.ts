import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// Holidays (Resorts Setup fn 7) — one global, nationwide calendar covering BOTH public
// holidays (single dates) and school breaks (date ranges), discriminated by holidayType.
// No resort or state scope. Read by LHC booking only — CpSeasonDate is CP's own calendar
// and the two are never joined or derived from one another.
//
// Dates are UTC-midnight business dates, so they are parsed from the YYYY-MM-DD string
// with Date.UTC and never with `new Date(str)`.
//
// `year` means different things per kind, deliberately:
//   PUBLIC — the calendar year, ALWAYS derived server-side from startDate, never accepted
//            from the client, so it cannot drift.
//   SCHOOL — the academic year, EDITABLE, because a Malaysian session can run past the
//            calendar boundary (a January break can belong to the previous academic year).

const HOLIDAY_TYPES = ['PUBLIC', 'SCHOOL'] as const;
type HolidayType = (typeof HOLIDAY_TYPES)[number];

const holidayType = z.enum(HOLIDAY_TYPES);
const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD');

const holidaySchema = z.object({
  holidayType,
  startDate:   dateStr,
  endDate:     dateStr.nullish(),
  year:        z.number().int().min(1900).max(2999).optional(),  // SCHOOL only — derived for PUBLIC
  description: z.string().trim().min(1).max(40),
});

const cloneSchema = z.object({
  holidayType,
  sourceYear: z.number().int().min(1900).max(2999),
});

// Parse a YYYY-MM-DD string to a UTC-midnight Date (business-date convention)
function toUtcMidnight(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

const label = (t: HolidayType) => (t === 'PUBLIC' ? 'public holiday' : 'school holiday');

// Human-readable date part for audit lines
const span = (start: Date, end: Date | null) => (end ? `${iso(start)} to ${iso(end)}` : iso(start));

// Term breaks shouldn't overlap within an academic year — catches date-entry typos.
// SCHOOL only: public holidays can legitimately share a date (different names).
async function hasOverlap(year: number, start: Date, end: Date, excludeId?: string): Promise<boolean> {
  const clash = await prisma.holiday.findFirst({
    where: {
      holidayType: 'SCHOOL',
      year,
      startDate: { lte: end },
      endDate:   { gte: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return !!clash;
}

// One "TERM 1 SCHOOL HOLIDAYS" per academic year. This was the old SchoolHoliday
// [academicYear, description] unique; the merged table keys on the start date instead
// (a year-scoped unique would wrongly block multi-day public holidays that repeat a name),
// so the rule is re-enforced here.
async function descriptionTaken(year: number, description: string, excludeId?: string): Promise<boolean> {
  const clash = await prisma.holiday.findFirst({
    where: {
      holidayType: 'SCHOOL',
      year,
      description,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return !!clash;
}

export async function listHolidays(req: Request, res: Response): Promise<void> {
  const parsedType = holidayType.safeParse(req.query.type);
  if (!parsedType.success) { res.status(400).json({ error: 'type must be PUBLIC or SCHOOL' }); return; }

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const yearRaw = parseInt(String(req.query.year), 10);
  const year = yearRaw >= 1900 && yearRaw <= 2999 ? yearRaw : undefined;

  const holidays = await prisma.holiday.findMany({
    where: {
      holidayType: parsedType.data,
      ...(year ? { year } : {}),
      ...(q ? { description: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ startDate: 'asc' }],
  });
  res.json({ data: holidays });
}

// Distinct years present for that kind, newest first — feeds the Year dropdown
export async function getHolidayYears(req: Request, res: Response): Promise<void> {
  const parsedType = holidayType.safeParse(req.query.type);
  if (!parsedType.success) { res.status(400).json({ error: 'type must be PUBLIC or SCHOOL' }); return; }

  const rows = await prisma.holiday.groupBy({
    by: ['year'],
    where: { holidayType: parsedType.data },
    orderBy: { year: 'desc' },
  });
  res.json({ data: rows.map(r => r.year) });
}

export async function createHoliday(req: Request, res: Response): Promise<void> {
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const type = parsed.data.holidayType;
  const description = parsed.data.description;
  const startDate = toUtcMidnight(parsed.data.startDate);

  let endDate: Date | null = null;
  let year: number;

  if (type === 'SCHOOL') {
    if (!parsed.data.endDate) { res.status(400).json({ error: 'End date is required for a school holiday' }); return; }
    if (parsed.data.year === undefined) { res.status(400).json({ error: 'Academic year is required for a school holiday' }); return; }

    endDate = toUtcMidnight(parsed.data.endDate);
    year = parsed.data.year;

    if (endDate < startDate) { res.status(400).json({ error: 'End date must be on or after start date' }); return; }
    if (await hasOverlap(year, startDate, endDate)) {
      res.status(409).json({ error: `That range overlaps an existing school holiday in academic year ${year}.` });
      return;
    }
    if (await descriptionTaken(year, description)) {
      res.status(409).json({ error: `Academic year ${year} already has a school holiday named "${description}".` });
      return;
    }
  } else {
    // A public holiday is a single day, and its year is always derived from the date
    year = startDate.getUTCFullYear();
  }

  try {
    const h = await prisma.holiday.create({
      data: { id: randomUUID(), holidayType: type, startDate, endDate, year, description, updatedAt: new Date() } as never,
    });
    await writeAudit({
      userId: req.user.id,
      action: `Created ${label(type)}: ${span(h.startDate, h.endDate)} ${h.description}`,
      actionType: 'CREATE',
      targetType: 'Holiday',
    });
    res.status(201).json({ data: h });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: `That ${label(type)} already exists on that date` }); }
    else { throw e; }
  }
}

export async function updateHoliday(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // Every field is editable — correcting a cloned date/range is the point of this screen.
  // holidayType is the exception: it comes from the stored row, never the payload.
  const parsed = holidaySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const existing = await prisma.holiday.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Holiday not found' }); return; }

  const type = existing.holidayType as HolidayType;
  const description = parsed.data.description ?? existing.description;

  // Merge over the stored row first, so the date-order and overlap checks run against the
  // record's effective state rather than only the fields that happened to be sent
  const startDate = parsed.data.startDate ? toUtcMidnight(parsed.data.startDate) : existing.startDate;

  let endDate: Date | null = null;
  let year: number;

  if (type === 'SCHOOL') {
    endDate = parsed.data.endDate ? toUtcMidnight(parsed.data.endDate) : existing.endDate;
    year = parsed.data.year ?? existing.year;

    if (!endDate) { res.status(400).json({ error: 'End date is required for a school holiday' }); return; }
    if (endDate < startDate) { res.status(400).json({ error: 'End date must be on or after start date' }); return; }
    if (await hasOverlap(year, startDate, endDate, id)) {
      res.status(409).json({ error: `That range overlaps an existing school holiday in academic year ${year}.` });
      return;
    }
    if (await descriptionTaken(year, description, id)) {
      res.status(409).json({ error: `Academic year ${year} already has a school holiday named "${description}".` });
      return;
    }
  } else {
    // Re-derive whenever the date moves — the client never supplies a public holiday's year
    year = startDate.getUTCFullYear();
  }

  try {
    const h = await prisma.holiday.update({
      where: { id },
      data: { startDate, endDate, year, description, updatedAt: new Date() } as never,
    });
    await writeAudit({
      userId: req.user.id,
      action: `Updated ${label(type)}: ${span(h.startDate, h.endDate)} ${h.description}`,
      actionType: 'UPDATE',
      targetType: 'Holiday',
    });
    res.json({ data: h });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: `That ${label(type)} already exists on that date` }); }
    else { throw e; }
  }
}

export async function deleteHoliday(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const h = await prisma.holiday.delete({ where: { id } });
    await writeAudit({
      userId: req.user.id,
      action: `Deleted ${label(h.holidayType as HolidayType)}: ${span(h.startDate, h.endDate)} ${h.description}`,
      actionType: 'DELETE',
      targetType: 'Holiday',
    });
    res.json({ message: 'Holiday deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Holiday not found' }); }
    else { throw e; }
  }
}

// Copy a year's holidays forward to the NEXT year, keeping the same month/day. Both ends
// of a school range are shifted by the same number of years so a range crossing 31 Dec
// stays intact; a public holiday just moves its single date. Malaysian public holidays and
// school terms both shift annually, so the clone is only a starting point — staff then edit
// each record to the gazetted/published dates.
export async function cloneHolidayYear(req: Request, res: Response): Promise<void> {
  const parsed = cloneSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const { holidayType: type, sourceYear } = parsed.data;
  const targetYear = sourceYear + 1;
  const yearWord = type === 'SCHOOL' ? 'Academic year' : 'Year';

  const source = await prisma.holiday.findMany({
    where: { holidayType: type, year: sourceYear },
    orderBy: { startDate: 'asc' },
  });
  if (source.length === 0) { res.status(404).json({ error: `No ${label(type)}s found for ${sourceYear}` }); return; }

  // Refuse rather than duplicate or overwrite — a second click must not silently
  // discard dates that have already been corrected in the target year.
  const existing = await prisma.holiday.count({ where: { holidayType: type, year: targetYear } });
  if (existing > 0) {
    res.status(409).json({ error: `${yearWord} ${targetYear} already has ${existing} ${label(type)}(s). Delete them first, or clone from a different year.` });
    return;
  }

  const shift = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));

  const rows = source.map(h => ({
    id: randomUUID(),
    holidayType: type,
    startDate: shift(h.startDate),
    endDate: h.endDate ? shift(h.endDate) : null,
    year: targetYear,
    description: h.description,
    updatedAt: new Date(),
  }));

  const result = await prisma.holiday.createMany({ data: rows as never, skipDuplicates: true });

  await writeAudit({
    userId: req.user.id,
    action: `Cloned ${label(type)}s ${sourceYear} -> ${targetYear} (${result.count} records)`,
    actionType: 'CREATE',
    targetType: 'Holiday',
    metadata: { holidayType: type, sourceYear, targetYear, created: result.count },
  });

  res.status(201).json({ data: { sourceYear, targetYear, created: result.count } });
}
