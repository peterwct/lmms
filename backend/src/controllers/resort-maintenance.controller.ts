import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// Resorts Maintenance. A record = one row per (resort, unit, date range) withdrawing
// that unit from the booking pool (housekeeping / buffer / upgrading / repairs).
// Each save adjusts the generated ResAvailMast grid's balNight for the unit's
// apartment type — actNight is never touched (the unit still exists, it just isn't
// bookable). Overlapping ranges for the same unit are rejected.
//
// The migration (prisma/migrate-maintenance.ts) deliberately applies NO grid deltas:
// res_avail_mast.txt was exported from Informix with maintenance already deducted.

const MAX_RANGE_DAYS = 3660; // ~10 years — sanity cap on a single record's day expansion
const DAY_MS = 86_400_000;

const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD');

const maintenanceSchema = z.object({
  resortCode: z.string().trim().min(1).max(8),
  unitNo:     z.string().trim().min(1).max(20),
  startDate:  dateStr,
  endDate:    dateStr,
  remarks:    z.string().trim().max(40).nullish(),
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

// Adjust the per-day ResAvailMast grid for a maintenance record's date range.
// sign=-1: maintenance applied  -> balNight -= 1 (floor 0)
// sign=+1: maintenance removed  -> balNight += 1 (ceiling actNight)
// Rows are never created or deleted, and actNight is never changed: a day with no
// grid row simply means the unit isn't in the availability pool then, so there is
// nothing to reduce. `clamped` flags days where the floor/ceiling blocked the change.
async function applyMaintDelta(
  tx: Prisma.TransactionClient,
  resortCode: string,
  apartmentType: string,
  days: Date[],
  sign: 1 | -1,
): Promise<{ adjusted: number; clamped: boolean }> {
  let adjusted = 0;
  let clamped = false;
  for (const date of days) {
    const where = { resortCode_apartmentType_date: { resortCode, apartmentType, date } };
    const row = await tx.resAvailMast.findUnique({ where });
    if (!row) continue;
    const next = sign === -1
      ? Math.max(0, row.balNight - 1)
      : Math.min(row.actNight, row.balNight + 1);
    if (next === row.balNight) { clamped = true; continue; }
    await tx.resAvailMast.update({ where, data: { balNight: next, updatedAt: new Date() } });
    adjusted++;
  }
  return { adjusted, clamped };
}

// Reject a range that overlaps an existing maintenance record for the same unit
async function hasOverlap(resortCode: string, unitNo: string, start: Date, end: Date, excludeId?: string): Promise<boolean> {
  const clash = await prisma.resortMaintenance.findFirst({
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

// Migrated rows can have a null apartmentType (unit absent from the partial apt_mast
// export) — fall back to the ResortUnit register so the grid can still be maintained.
async function resolveType(resortCode: string, unitNo: string, current: string | null): Promise<string | null> {
  if (current) return current;
  const unit = await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode, unitNo } } });
  return unit?.apartmentType ?? null;
}

// Build the "under maintenance during this period" filter from year (+ optional month).
// A record counts when its date range OVERLAPS the period, not merely starts in it —
// a block running Jun-Dec is under maintenance in August. Month without a year is
// meaningless, so it is ignored; year alone means the whole year.
function periodFilter(yearRaw: unknown, monthRaw: unknown) {
  const year = parseInt(String(yearRaw), 10);
  if (!(year >= 1900 && year <= 2999)) return {};

  const month = parseInt(String(monthRaw), 10);
  const hasMonth = month >= 1 && month <= 12;

  const rangeStart = new Date(Date.UTC(year, hasMonth ? month - 1 : 0, 1));
  // First day of the month/year AFTER the period, minus one day = its last day
  const rangeEnd = new Date(Date.UTC(year, hasMonth ? month : 12, 1) - DAY_MS);

  return { startDate: { lte: rangeEnd }, endDate: { gte: rangeStart } };
}

// Distinct years covered by the register, for the Month/Year filter dropdown.
// Derived from the data span so it stays correct after a re-import.
export async function getMaintenanceYears(_req: Request, res: Response): Promise<void> {
  const agg = await prisma.resortMaintenance.aggregate({
    _min: { startDate: true },
    _max: { endDate: true },
  });
  const min = agg._min.startDate;
  const max = agg._max.endDate;
  if (!min || !max) { res.json({ data: [] }); return; }

  const years: number[] = [];
  for (let y = max.getUTCFullYear(); y >= min.getUTCFullYear(); y--) years.push(y); // newest first
  res.json({ data: years });
}

export async function listMaintenance(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize), 10) || 50));

  const where = {
    ...(resortCode ? { resortCode } : {}),
    ...periodFilter(req.query.year, req.query.month),
    ...(q
      ? {
          OR: [
            { unitNo:        { contains: q, mode: 'insensitive' as const } },
            { resortCode:    { contains: q, mode: 'insensitive' as const } },
            { apartmentType: { contains: q, mode: 'insensitive' as const } },
            { remarks:       { contains: q, mode: 'insensitive' as const } },
            { resort: { resortName: { contains: q, mode: 'insensitive' as const } } },
            { resort: { shortName:  { contains: q, mode: 'insensitive' as const } } },
          ],
        }
      : {}),
  };

  const [total, records] = await Promise.all([
    prisma.resortMaintenance.count({ where }),
    prisma.resortMaintenance.findMany({
      where,
      include: { resort: resortSelect },
      orderBy: [{ startDate: 'desc' }, { resortCode: 'asc' }, { unitNo: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ data: records, total, page, pageSize });
}

// Per-day availability grid (ResAvailMast) for a maintenance record's resort +
// apartment type, scoped to its date range. The grid is keyed by apartment type
// (aggregate across all units of that type), not by the individual unit.
export async function getMaintenanceAvailability(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const record = await prisma.resortMaintenance.findUnique({ where: { id } });
  if (!record) { res.status(404).json({ error: 'Maintenance record not found' }); return; }

  const apartmentType = await resolveType(record.resortCode, record.unitNo, record.apartmentType);

  const rows = apartmentType
    ? await prisma.resAvailMast.findMany({
        where: { resortCode: record.resortCode, apartmentType, date: { gte: record.startDate, lte: record.endDate } },
        orderBy: { date: 'asc' },
        select: { date: true, actNight: true, balNight: true },
      })
    : [];

  res.json({
    resortCode: record.resortCode,
    unitNo: record.unitNo,
    apartmentType,
    startDate: record.startDate,
    endDate: record.endDate,
    data: rows,
  });
}

export async function createMaintenance(req: Request, res: Response): Promise<void> {
  const parsed = maintenanceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { resortCode, unitNo } = parsed.data;
  const remarks = parsed.data.remarks || null;
  const startDate = toUtcMidnight(parsed.data.startDate);
  const endDate = toUtcMidnight(parsed.data.endDate);

  if (endDate < startDate) { res.status(400).json({ error: 'End date must be on or after start date' }); return; }

  const resort = await prisma.resort.findUnique({ where: { resortCode } });
  if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }

  // The unit must be registered for this resort; its apartment type drives the grid
  const unit = await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode, unitNo } } });
  if (!unit) { res.status(400).json({ error: 'Unit not set up for this resort' }); return; }
  const apartmentType = unit.apartmentType;

  const days = eachUtcDay(startDate, endDate);
  if (days.length > MAX_RANGE_DAYS) { res.status(400).json({ error: `Date range too large (max ${MAX_RANGE_DAYS} days)` }); return; }

  if (await hasOverlap(resortCode, unitNo, startDate, endDate)) {
    res.status(409).json({ error: 'This unit already has a maintenance record overlapping these dates' });
    return;
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.resortMaintenance.create({
        data: {
          id: randomUUID(), resortId: resort.id, resortCode, unitNo, apartmentType,
          startDate, endDate, remarks, updatedAt: new Date(),
        } as never,
        include: { resort: resortSelect },
      });
      const delta = await applyMaintDelta(tx, resortCode, apartmentType, days, -1);
      return { created, delta };
    }, { maxWait: 15_000, timeout: 120_000 });

    await writeAudit({
      userId: req.user.id,
      action: `Created maintenance record: ${resortCode} ${unitNo} (${parsed.data.startDate} to ${parsed.data.endDate})`,
      actionType: 'CREATE',
      targetType: 'ResortMaintenance',
      metadata: { days: days.length, adjusted: result.delta.adjusted, clamped: result.delta.clamped },
    });
    res.status(201).json({ data: result.created });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') { res.status(409).json({ error: 'A maintenance record already exists for this unit and start date' }); }
    else { throw e; }
  }
}

export async function updateMaintenance(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  // resortCode / unitNo / apartmentType are fixed after creation (move = delete + re-add)
  const parsed = maintenanceSchema.pick({ startDate: true, endDate: true, remarks: true }).safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const existing = await prisma.resortMaintenance.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Maintenance record not found' }); return; }

  const remarks = parsed.data.remarks || null;
  const startDate = toUtcMidnight(parsed.data.startDate);
  const endDate = toUtcMidnight(parsed.data.endDate);
  if (endDate < startDate) { res.status(400).json({ error: 'End date must be on or after start date' }); return; }

  const newDays = eachUtcDay(startDate, endDate);
  if (newDays.length > MAX_RANGE_DAYS) { res.status(400).json({ error: `Date range too large (max ${MAX_RANGE_DAYS} days)` }); return; }

  if (await hasOverlap(existing.resortCode, existing.unitNo, startDate, endDate, id)) {
    res.status(409).json({ error: 'This unit already has a maintenance record overlapping these dates' });
    return;
  }

  const apartmentType = await resolveType(existing.resortCode, existing.unitNo, existing.apartmentType);

  const record = await prisma.$transaction(async (tx) => {
    if (apartmentType) {
      // Reverse the old range, then apply the new one — days in both net to zero
      await applyMaintDelta(tx, existing.resortCode, apartmentType, eachUtcDay(existing.startDate, existing.endDate), 1);
      await applyMaintDelta(tx, existing.resortCode, apartmentType, newDays, -1);
    }
    return tx.resortMaintenance.update({
      where: { id },
      data: { startDate, endDate, remarks, apartmentType, updatedAt: new Date() } as never,
      include: { resort: resortSelect },
    });
  }, { maxWait: 15_000, timeout: 120_000 });

  await writeAudit({
    userId: req.user.id,
    action: `Updated maintenance record: ${record.resortCode} ${record.unitNo} (${parsed.data.startDate} to ${parsed.data.endDate})`,
    actionType: 'UPDATE',
    targetType: 'ResortMaintenance',
  });
  res.json({ data: record });
}

export async function deleteMaintenance(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existing = await prisma.resortMaintenance.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Maintenance record not found' }); return; }

  const apartmentType = await resolveType(existing.resortCode, existing.unitNo, existing.apartmentType);

  const delta = await prisma.$transaction(async (tx) => {
    let d = { adjusted: 0, clamped: false };
    if (apartmentType) {
      d = await applyMaintDelta(tx, existing.resortCode, apartmentType, eachUtcDay(existing.startDate, existing.endDate), 1);
    }
    await tx.resortMaintenance.delete({ where: { id } });
    return d;
  }, { maxWait: 15_000, timeout: 120_000 });

  await writeAudit({
    userId: req.user.id,
    action: `Deleted maintenance record: ${existing.resortCode} ${existing.unitNo}`,
    actionType: 'DELETE',
    targetType: 'ResortMaintenance',
    metadata: { adjusted: delta.adjusted, clamped: delta.clamped },
  });
  res.json({ message: 'Maintenance record deleted' });
}
