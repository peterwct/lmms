import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// Public Holidays (Resorts Setup fn 6) — a global, nationwide calendar. No resort
// or state scope. Dates are UTC-midnight business dates, so they are parsed from
// the YYYY-MM-DD string with Date.UTC and never with `new Date(str)`.

const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD');

const holidaySchema = z.object({
  holidayDate: dateStr,
  description: z.string().trim().min(1).max(40),
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

export async function listPublicHolidays(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const yearRaw = parseInt(String(req.query.year), 10);
  const year = yearRaw >= 1900 && yearRaw <= 2999 ? yearRaw : undefined;

  const holidays = await prisma.publicHoliday.findMany({
    where: {
      ...(year ? { year } : {}),
      ...(q ? { description: { contains: q, mode: 'insensitive' as const } } : {}),
    },
    orderBy: [{ holidayDate: 'asc' }],
  });
  res.json({ data: holidays });
}

// Distinct years present in the calendar, newest first — feeds the Year dropdown
export async function getHolidayYears(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.publicHoliday.groupBy({
    by: ['year'],
    orderBy: { year: 'desc' },
  });
  res.json({ data: rows.map(r => r.year) });
}

export async function createPublicHoliday(req: Request, res: Response): Promise<void> {
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const holidayDate = toUtcMidnight(parsed.data.holidayDate);

  try {
    const h = await prisma.publicHoliday.create({
      // year is always derived from the date, never taken from the client, so it can't drift
      data: { id: randomUUID(), holidayDate, year: holidayDate.getUTCFullYear(), description: parsed.data.description, updatedAt: new Date() } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Created public holiday: ${iso(h.holidayDate)} ${h.description}`, actionType: 'CREATE', targetType: 'PublicHoliday' });
    res.status(201).json({ data: h });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'That holiday already exists on that date' }); }
    else { throw e; }
  }
}

export async function updatePublicHoliday(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // Both fields are editable — correcting a cloned date is the point of this screen
  const parsed = holidaySchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const existing = await prisma.publicHoliday.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Public holiday not found' }); return; }

  const holidayDate = parsed.data.holidayDate ? toUtcMidnight(parsed.data.holidayDate) : existing.holidayDate;

  try {
    const h = await prisma.publicHoliday.update({
      where: { id },
      data: {
        holidayDate,
        year: holidayDate.getUTCFullYear(), // re-derived whenever the date moves
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        updatedAt: new Date(),
      } as never,
    });
    await writeAudit({ userId: req.user.id, action: `Updated public holiday: ${iso(h.holidayDate)} ${h.description}`, actionType: 'UPDATE', targetType: 'PublicHoliday' });
    res.json({ data: h });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'That holiday already exists on that date' }); }
    else { throw e; }
  }
}

export async function deletePublicHoliday(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const h = await prisma.publicHoliday.delete({ where: { id } });
    await writeAudit({ userId: req.user.id, action: `Deleted public holiday: ${iso(h.holidayDate)} ${h.description}`, actionType: 'DELETE', targetType: 'PublicHoliday' });
    res.json({ message: 'Public holiday deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Public holiday not found' }); }
    else { throw e; }
  }
}

// Copy a year's holidays forward to the NEXT year on the same month/day. Malaysian
// lunar/Islamic holidays shift annually, so the clone is only a starting point —
// staff then edit each row to the gazetted date.
export async function clonePublicHolidayYear(req: Request, res: Response): Promise<void> {
  const parsed = cloneSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const sourceYear = parsed.data.sourceYear;
  const targetYear = sourceYear + 1;

  const source = await prisma.publicHoliday.findMany({
    where: { year: sourceYear },
    orderBy: { holidayDate: 'asc' },
  });
  if (source.length === 0) { res.status(404).json({ error: `No holidays found for ${sourceYear}` }); return; }

  // Refuse rather than duplicate or overwrite — a second click must not silently
  // discard dates that have already been corrected in the target year.
  const existing = await prisma.publicHoliday.count({ where: { year: targetYear } });
  if (existing > 0) {
    res.status(409).json({ error: `${targetYear} already has ${existing} holiday(s). Delete them first, or clone from a different year.` });
    return;
  }

  const rows = source.map(h => ({
    id: randomUUID(),
    // Same month/day in the target year. A 29-Feb source date rolls to 1 Mar in a
    // non-leap year — acceptable, since every cloned date is reviewed anyway.
    holidayDate: new Date(Date.UTC(targetYear, h.holidayDate.getUTCMonth(), h.holidayDate.getUTCDate())),
    year: targetYear,
    description: h.description,
    updatedAt: new Date(),
  }));

  const result = await prisma.publicHoliday.createMany({ data: rows as never, skipDuplicates: true });

  await writeAudit({
    userId: req.user.id,
    action: `Cloned public holidays ${sourceYear} -> ${targetYear} (${result.count} records)`,
    actionType: 'CREATE',
    targetType: 'PublicHoliday',
    metadata: { sourceYear, targetYear, created: result.count },
  });

  res.status(201).json({ data: { sourceYear, targetYear, created: result.count } });
}
