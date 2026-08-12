import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// Units Availability Setup by Dates. A block = one row per (resort, unit, date range).
// Each save expands into per-day ResAvailMast rows (act/bal +1 per day; -1 on delete),
// keyed by (resortCode, apartmentType, date). Overlapping ranges for the same unit are rejected.

const MAX_RANGE_DAYS = 3660; // ~10 years — sanity cap on a single block's day expansion
const DAY_MS = 86_400_000;

const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD');

const aptBlockSchema = z.object({
  resortCode:    z.string().trim().min(1).max(8),
  apartmentType: z.string().trim().min(1).max(10),
  unitNo:        z.string().trim().min(1).max(20),
  startDate:     dateStr,
  endDate:       dateStr,
});

const resortSelect = { select: { shortName: true, resortName: true, coCode: true } };

// Parse a YYYY-MM-DD string to a UTC-midnight Date (business-date convention)
function toUtcMidnight(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// Inclusive list of UTC-midnight days from start to end
function eachUtcDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let ms = start.getTime(); ms <= end.getTime(); ms += DAY_MS) days.push(new Date(ms));
  return days;
}

// Apply +1/-1 to the per-day ResAvailMast grid for a block's date range.
// sign=+1: upsert, act/bal += 1 (create 1/1 if absent).
// sign=-1: act/bal -= 1, delete the row when act reaches 0, clamp bal at >= 0.
// Returns whether any balNight had to be clamped (a booked day was un-blocked).
async function applyDelta(
  tx: Prisma.TransactionClient,
  resortId: string,
  resortCode: string,
  apartmentType: string,
  days: Date[],
  sign: 1 | -1,
): Promise<boolean> {
  let clamped = false;
  for (const date of days) {
    const where = { resortCode_apartmentType_date: { resortCode, apartmentType, date } };
    if (sign === 1) {
      await tx.resAvailMast.upsert({
        where,
        create: {
          id: randomUUID(), resortId, resortCode, apartmentType, date,
          actNight: 1, balNight: 1, updatedAt: new Date(),
        },
        update: { actNight: { increment: 1 }, balNight: { increment: 1 }, updatedAt: new Date() },
      });
    } else {
      const row = await tx.resAvailMast.findUnique({ where });
      if (!row) continue;
      const newAct = row.actNight - 1;
      const newBal = row.balNight - 1;
      if (newBal < 0) clamped = true;
      if (newAct <= 0) {
        await tx.resAvailMast.delete({ where });
      } else {
        await tx.resAvailMast.update({
          where,
          data: { actNight: newAct, balNight: Math.max(0, newBal), updatedAt: new Date() },
        });
      }
    }
  }
  return clamped;
}

// Reject a range that overlaps an existing block for the same unit (optionally excluding one id)
async function hasOverlap(resortCode: string, unitNo: string, start: Date, end: Date, excludeId?: string): Promise<boolean> {
  const clash = await prisma.aptBlock.findFirst({
    where: {
      resortCode,
      unitNo,
      startDate: { lte: end },
      endDate: { gte: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return !!clash;
}

export async function listAptBlocks(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize), 10) || 50));

  const where = {
    ...(resortCode ? { resortCode } : {}),
    ...(q
      ? {
          OR: [
            { unitNo:        { contains: q, mode: 'insensitive' as const } },
            { resortCode:    { contains: q, mode: 'insensitive' as const } },
            { apartmentType: { contains: q, mode: 'insensitive' as const } },
            { resort: { resortName: { contains: q, mode: 'insensitive' as const } } },
            { resort: { shortName:  { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [total, blocks] = await Promise.all([
    prisma.aptBlock.count({ where }),
    prisma.aptBlock.findMany({
      where,
      include: { resort: resortSelect },
      orderBy: [{ startDate: 'desc' }, { resortCode: 'asc' }, { unitNo: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ data: blocks, total, page, pageSize });
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Resort Availability chart: ResAvailMast pivoted to rows (resort x apartment type)
// by a rolling date window, cell = balNight (units available). Read-only view.
export async function getAvailabilityChart(req: Request, res: Response): Promise<void> {
  const product = req.query.product === 'CP' ? 'CP' : 'LHC';
  // LHC shows coCode 03 only (LHC-15 availability is not displayed); CP = 02
  const coCodes = product === 'CP' ? ['02'] : ['03'];
  const days = Math.min(31, Math.max(1, parseInt(String(req.query.days), 10) || 15));

  const dateStr = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(req.query.date)
    ? req.query.date
    : ymd(new Date());
  const start = toUtcMidnight(dateStr);
  const end = new Date(start.getTime() + (days - 1) * DAY_MS);

  // ACTIVE resorts only. The chart scaffolds a row per resort x apartment type and
  // fills missing days with 0, so a retired resort renders a full row of zeros: before
  // this filter the LHC chart drew 56 rows of which only 5 were live, and CP 10 of 3.
  // Server-side like the Apartment Types list (this is the screen's own endpoint, not
  // a shared resort cache) -- see listApartmentTypes in apartment-types.controller.ts.
  const resorts = await prisma.resort.findMany({
    where: { coCode: { in: coCodes }, status: 'A' },
    select: { resortCode: true, shortName: true, coCode: true },
  });
  const resortCodes = resorts.map(r => r.resortCode);
  const metaByCode = new Map(resorts.map(r => [r.resortCode, r]));

  const types = await prisma.apartmentType.findMany({
    where: { resortCode: { in: resortCodes } },
    orderBy: [{ resortCode: 'asc' }, { apartmentType: 'asc' }],
    select: { resortCode: true, apartmentType: true },
  });

  const avail = await prisma.resAvailMast.findMany({
    where: { resortCode: { in: resortCodes }, date: { gte: start, lte: end } },
    select: { resortCode: true, apartmentType: true, date: true, balNight: true },
  });
  const lookup = new Map<string, number>();
  for (const a of avail) lookup.set(`${a.resortCode}|${a.apartmentType}|${ymd(a.date)}`, a.balNight);

  const dates = Array.from({ length: days }, (_, i) => {
    const d = new Date(start.getTime() + i * DAY_MS);
    const dow = d.getUTCDay();
    return { date: ymd(d), dow: DOW[dow], dom: d.getUTCDate(), weekend: dow === 0 || dow === 6 };
  });

  const rows = types.map(t => {
    const meta = metaByCode.get(t.resortCode);
    const shortName = meta?.shortName ?? null;
    return {
      resortCode: t.resortCode,
      shortName,
      apartmentType: t.apartmentType,
      coCode: meta?.coCode ?? '',
      label: `${shortName ?? t.resortCode} (${t.apartmentType})`,
      cells: dates.map(d => lookup.get(`${t.resortCode}|${t.apartmentType}|${d.date}`) ?? 0),
    };
  });
  // Order by resort short name (GC, GH, KI, LC, SR), then apartment type
  rows.sort((a, b) =>
    (a.shortName ?? a.resortCode).localeCompare(b.shortName ?? b.resortCode) ||
    a.apartmentType.localeCompare(b.apartmentType));

  res.json({ product, startDate: dateStr, days, dates, rows });
}

// Per-day availability grid (ResAvailMast) for a block's resort + apartment type,
// scoped to the block's date range. The grid is keyed by apartment type (aggregate
// across all units of that type), not by the individual unit.
export async function getAptBlockAvailability(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const block = await prisma.aptBlock.findUnique({ where: { id } });
  if (!block) { res.status(404).json({ error: 'Block not found' }); return; }

  const apartmentType = block.apartmentType
    ?? (await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode: block.resortCode, unitNo: block.unitNo } } }))?.apartmentType
    ?? null;

  const rows = apartmentType
    ? await prisma.resAvailMast.findMany({
        where: { resortCode: block.resortCode, apartmentType, date: { gte: block.startDate, lte: block.endDate } },
        orderBy: { date: 'asc' },
        select: { date: true, actNight: true, balNight: true },
      })
    : [];

  res.json({
    resortCode: block.resortCode,
    unitNo: block.unitNo,
    apartmentType,
    startDate: block.startDate,
    endDate: block.endDate,
    data: rows,
  });
}

export async function createAptBlock(req: Request, res: Response): Promise<void> {
  const parsed = aptBlockSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { resortCode, apartmentType, unitNo } = parsed.data;
  const startDate = toUtcMidnight(parsed.data.startDate);
  const endDate = toUtcMidnight(parsed.data.endDate);

  if (endDate < startDate) { res.status(400).json({ error: 'End date must be on or after start date' }); return; }

  const resort = await prisma.resort.findUnique({ where: { resortCode } });
  if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }

  // The unit must be registered for this resort, and its type must match
  const unit = await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode, unitNo } } });
  if (!unit) { res.status(400).json({ error: 'Unit not set up for this resort' }); return; }
  if (unit.apartmentType !== apartmentType) { res.status(400).json({ error: 'Apartment type does not match the unit' }); return; }

  const days = eachUtcDay(startDate, endDate);
  if (days.length > MAX_RANGE_DAYS) { res.status(400).json({ error: `Date range too large (max ${MAX_RANGE_DAYS} days)` }); return; }

  if (await hasOverlap(resortCode, unitNo, startDate, endDate)) {
    res.status(409).json({ error: 'This unit already has an availability block overlapping these dates' });
    return;
  }

  try {
    const block = await prisma.$transaction(async (tx) => {
      const created = await tx.aptBlock.create({
        data: {
          id: randomUUID(), resortId: resort.id, resortCode, unitNo, apartmentType,
          startDate, endDate, updatedAt: new Date(),
        } as never,
        include: { resort: resortSelect },
      });
      await applyDelta(tx, resort.id, resortCode, apartmentType, days, 1);
      return created;
    }, { maxWait: 15_000, timeout: 120_000 });

    await writeAudit({
      userId: req.user.id,
      action: `Created availability block: ${resortCode} ${unitNo} (${parsed.data.startDate} to ${parsed.data.endDate})`,
      actionType: 'CREATE',
      targetType: 'AptBlock',
      metadata: { days: days.length },
    });
    res.status(201).json({ data: block });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'An identical block already exists for this unit' }); }
    else { throw e; }
  }
}

export async function updateAptBlock(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // resortCode / unitNo / apartmentType are fixed after creation (move = delete + re-add)
  const parsed = aptBlockSchema.pick({ startDate: true, endDate: true }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const existing = await prisma.aptBlock.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Block not found' }); return; }

  const startDate = toUtcMidnight(parsed.data.startDate);
  const endDate = toUtcMidnight(parsed.data.endDate);
  if (endDate < startDate) { res.status(400).json({ error: 'End date must be on or after start date' }); return; }

  const newDays = eachUtcDay(startDate, endDate);
  if (newDays.length > MAX_RANGE_DAYS) { res.status(400).json({ error: `Date range too large (max ${MAX_RANGE_DAYS} days)` }); return; }

  if (await hasOverlap(existing.resortCode, existing.unitNo, startDate, endDate, id)) {
    res.status(409).json({ error: 'This unit already has an availability block overlapping these dates' });
    return;
  }

  // Resolve the block's apartment type (migrated rows may have null) so the grid can be maintained
  const apartmentType = existing.apartmentType
    ?? (await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode: existing.resortCode, unitNo: existing.unitNo } } }))?.apartmentType
    ?? null;

  const block = await prisma.$transaction(async (tx) => {
    if (apartmentType) {
      await applyDelta(tx, existing.resortId, existing.resortCode, apartmentType, eachUtcDay(existing.startDate, existing.endDate), -1);
      await applyDelta(tx, existing.resortId, existing.resortCode, apartmentType, newDays, 1);
    }
    return tx.aptBlock.update({
      where: { id },
      data: { startDate, endDate, apartmentType, updatedAt: new Date() } as never,
      include: { resort: resortSelect },
    });
  }, { maxWait: 15_000, timeout: 120_000 });

  await writeAudit({
    userId: req.user.id,
    action: `Updated availability block: ${block.resortCode} ${block.unitNo} (${parsed.data.startDate} to ${parsed.data.endDate})`,
    actionType: 'UPDATE',
    targetType: 'AptBlock',
  });
  res.json({ data: block });
}

export async function deleteAptBlock(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existing = await prisma.aptBlock.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Block not found' }); return; }

  const apartmentType = existing.apartmentType
    ?? (await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode: existing.resortCode, unitNo: existing.unitNo } } }))?.apartmentType
    ?? null;

  const clamped = await prisma.$transaction(async (tx) => {
    let c = false;
    if (apartmentType) {
      c = await applyDelta(tx, existing.resortId, existing.resortCode, apartmentType, eachUtcDay(existing.startDate, existing.endDate), -1);
    }
    await tx.aptBlock.delete({ where: { id } });
    return c;
  }, { maxWait: 15_000, timeout: 120_000 });

  await writeAudit({
    userId: req.user.id,
    action: `Deleted availability block: ${existing.resortCode} ${existing.unitNo}`,
    actionType: 'DELETE',
    targetType: 'AptBlock',
    metadata: { balanceClamped: clamped },
  });
  res.json({ message: 'Block deleted' });
}
