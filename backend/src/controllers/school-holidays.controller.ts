import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// School Holidays (Resorts Setup fn 7) — a global, nationwide calendar of school
// break date ranges. No resort or state scope. Filed under an academic year, which
// is EDITABLE rather than derived: a session can run past the calendar boundary.
// Dates are UTC-midnight business dates, parsed with Date.UTC, never `new Date(str)`.

const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD');

const schoolHolidaySchema = z.object({
  academicYear: z.number().int().min(1900).max(2999),
  startDate:    dateStr,
  endDate:      dateStr,
  description:  z.string().trim().min(1).max(40),
});

const cloneSchema = z.object({
  sourceYear: z.number().int().min(1900).max(2999),
});

// Parse a YYYY-MM-DD string to a UTC-midnight Date (business-date convention)
function toUtcMidnight(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Term breaks shouldn't overlap within an academic year — catches date-entry typos
async function hasOverlap(academicYear: number, start: Date, end: Date, excludeId?: string): Promise<boolean> {
  const clash = await prisma.schoolHoliday.findFirst({
    where: {
      academicYear,
      startDate: { lte: end },
      endDate:   { gte: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return !!clash;
}

export async function listSchoolHolidays(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const yearRaw = parseInt(String(req.query.academicYear), 10);
  const academicYear = yearRaw >= 1900 && yearRaw <= 2999 ? yearRaw : undefined;

  const holidays = await prisma.schoolHoliday.findMany({
    where: {
      ...(academicYear ? { academicYear } : {}),
      ...(q ? { description: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ startDate: 'asc' }],
  });
  res.json({ data: holidays });
}

// Distinct academic years present, newest first — feeds the Academic Year dropdown
export async function getSchoolHolidayYears(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.schoolHoliday.groupBy({
    by: ['academicYear'],
    orderBy: { academicYear: 'desc' },
  });
  res.json({ data: rows.map(r => r.academicYear) });
}

export async function createSchoolHoliday(req: Request, res: Response): Promise<void> {
  const parsed = schoolHolidaySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const { academicYear, description } = parsed.data;
  const startDate = toUtcMidnight(parsed.data.startDate);
  const endDate   = toUtcMidnight(parsed.data.endDate);
  if (endDate < startDate) { res.status(400).json({ error: 'End date must be on or after start date' }); return; }

  if (await hasOverlap(academicYear, startDate, endDate)) {
    res.status(409).json({ error: `That range overlaps an existing school holiday in academic year ${academicYear}.` });
    return;
  }

  try {
    const h = await prisma.schoolHoliday.create({
      data: { id: randomUUID(), academicYear, startDate, endDate, description, updatedAt: new Date() } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Created school holiday: ${h.academicYear} ${h.description} (${iso(h.startDate)} to ${iso(h.endDate)})`, actionType: 'CREATE', targetType: 'SchoolHoliday' });
    res.status(201).json({ data: h });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'That school holiday already exists for this academic year' }); }
    else { throw e; }
  }
}

export async function updateSchoolHoliday(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // Every field is editable — correcting a cloned range is the point of this screen
  const parsed = schoolHolidaySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const existing = await prisma.schoolHoliday.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'School holiday not found' }); return; }

  // Merge over the stored row first, so the date-order and overlap checks run against
  // the record's effective state rather than only the fields that happened to be sent
  const academicYear = parsed.data.academicYear ?? existing.academicYear;
  const startDate = parsed.data.startDate ? toUtcMidnight(parsed.data.startDate) : existing.startDate;
  const endDate   = parsed.data.endDate   ? toUtcMidnight(parsed.data.endDate)   : existing.endDate;
  const description = parsed.data.description ?? existing.description;

  if (endDate < startDate) { res.status(400).json({ error: 'End date must be on or after start date' }); return; }
  if (await hasOverlap(academicYear, startDate, endDate, id)) {
    res.status(409).json({ error: `That range overlaps an existing school holiday in academic year ${academicYear}.` });
    return;
  }

  try {
    const h = await prisma.schoolHoliday.update({
      where: { id },
      data: { academicYear, startDate, endDate, description, updatedAt: new Date() } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Updated school holiday: ${h.academicYear} ${h.description} (${iso(h.startDate)} to ${iso(h.endDate)})`, actionType: 'UPDATE', targetType: 'SchoolHoliday' });
    res.json({ data: h });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'That school holiday already exists for this academic year' }); }
    else { throw e; }
  }
}

export async function deleteSchoolHoliday(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const h = await prisma.schoolHoliday.delete({ where: { id } });
    await writeAudit({ userId: req.user.id, action: `Deleted school holiday: ${h.academicYear} ${h.description} (${iso(h.startDate)} to ${iso(h.endDate)})`, actionType: 'DELETE', targetType: 'SchoolHoliday' });
    res.json({ message: 'School holiday deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'School holiday not found' }); }
    else { throw e; }
  }
}

// Copy an academic year's breaks forward to the NEXT academic year, keeping the same
// month/day on both ends. School terms shift annually, so the clone is only a starting
// point — staff then edit each range to the published dates.
export async function cloneSchoolHolidayYear(req: Request, res: Response): Promise<void> {
  const parsed = cloneSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const sourceYear = parsed.data.sourceYear;
  const targetYear = sourceYear + 1;

  const source = await prisma.schoolHoliday.findMany({
    where: { academicYear: sourceYear },
    orderBy: { startDate: 'asc' },
  });
  if (source.length === 0) { res.status(404).json({ error: `No school holidays found for academic year ${sourceYear}` }); return; }

  // Refuse rather than duplicate or overwrite — a second click must not silently
  // discard ranges that have already been corrected in the target year.
  const existing = await prisma.schoolHoliday.count({ where: { academicYear: targetYear } });
  if (existing > 0) {
    res.status(409).json({ error: `Academic year ${targetYear} already has ${existing} school holiday(s). Delete them first, or clone from a different year.` });
    return;
  }

  // Shift both ends by the same number of years so a range crossing 31 Dec stays intact
  const shift = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));

  const rows = source.map(h => ({
    id: randomUUID(),
    academicYear: targetYear,
    startDate: shift(h.startDate),
    endDate: shift(h.endDate),
    description: h.description,
    updatedAt: new Date(),
  }));

  const result = await prisma.schoolHoliday.createMany({ data: rows as never, skipDuplicates: true });

  await writeAudit({
    userId: req.user.id,
    action: `Cloned school holidays ${sourceYear} -> ${targetYear} (${result.count} records)`,
    actionType: 'CREATE',
    targetType: 'SchoolHoliday',
    metadata: { sourceYear, targetYear, created: result.count },
  });

  res.status(201).json({ data: { sourceYear, targetYear, created: result.count } });
}
