import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';
import { apartmentTypeExists } from './resort-units.controller';

// Resorts Unit Availability/Inventory Setup (fn 5). A block = one row per (resort, unit, date range).
// Each save expands into per-day ResAvailMast rows (act/bal +1 per day; -1 on delete),
// keyed by (resortCode, apartmentType, date). Overlapping ranges for the same unit are rejected.
//
// ADD-ONLY (2026-08-14, business decision): there is no update path. A record is created or
// deleted, never edited, so the grid deltas and the fn 6 maintenance guard only ever see a
// whole record appear or disappear. Correcting a record = delete + re-add.

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

// MAR (Make Available Resorts) batch setup — the partner/exchange resorts reached through an
// LVC exchange programme. They allocate N interchangeable units of a sleep type for a period
// rather than naming real apartments, and the legacy data already numbers them "N-occupancy"
// (V-CLC1 SLEEP4 = 1-4 .. 15-4). One batch keys the count instead of the units.
//
// A MAR resort is one flagged `Resort.mar = 'Y'` in fn 2 (2026-09-10). It used to be inferred as
// "any resort not on one of our own coCodes", which over-reached: a partner resort is not
// automatically made available to our members. Both the picker and createAptBlockBatch key off
// the flag now; OWN_CO_CODES still gates the own-product half, since those resorts have real
// numbered apartments and must never take a generated "N-occupancy" batch.
const MAR_MAX_UNITS = 200;               // sanity cap; V-LDBR is the largest today at 78
const OWN_CO_CODES = ['03', '15', '02']; // our own products — NOT MAR, they use createAptBlock

const marBatchSchema = z.object({
  resortCode:    z.string().trim().min(1).max(8),
  apartmentType: z.string().trim().min(1).max(10),
  unitCount:     z.number().int().min(1).max(MAR_MAX_UNITS),
  occupancy:     z.number().int().min(1).max(20), // matches resortUnitSchema.occupancy
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

// Apply +qty/-qty to the per-day ResAvailMast grid for a block's date range.
// sign=+1: upsert, act/bal += qty (create qty/qty if absent).
// sign=-1: act/bal -= qty, delete the row when act reaches 0, clamp bal at >= 0.
// Returns whether any balNight had to be clamped (a booked day was un-blocked).
//
// qty defaults to 1 — one unit's block. The MAR batch passes the unit count instead of
// calling this once per unit: every unit in a batch shares the same resort, apartment type
// and date range, so the grid effect is simply +N per day. N separate passes would be
// N x days round-trips (78 units x 366 days is ~28,500 queries, well past the 120s timeout).
async function applyDelta(
  tx: Prisma.TransactionClient,
  resortId: string,
  resortCode: string,
  apartmentType: string,
  days: Date[],
  sign: 1 | -1,
  qty = 1,
): Promise<boolean> {
  let clamped = false;
  for (const date of days) {
    const where = { resortCode_apartmentType_date: { resortCode, apartmentType, date } };
    if (sign === 1) {
      await tx.resAvailMast.upsert({
        where,
        create: {
          id: randomUUID(), resortId, resortCode, apartmentType, date,
          actNight: qty, balNight: qty, updatedAt: new Date(),
        },
        update: { actNight: { increment: qty }, balNight: { increment: qty }, updatedAt: new Date() },
      });
    } else {
      const row = await tx.resAvailMast.findUnique({ where });
      if (!row) continue;
      const newAct = row.actNight - qty;
      const newBal = row.balNight - qty;
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

// Maintenance (fn 6) records this unit has inside [start,end]. A maintenance range must
// always sit inside one availability record, so a block cannot be removed — or shrunk —
// out from under one: applyMaintDelta already deducted those days from balNight, and
// applyDelta would then clamp at 0 and leave the grid inconsistent. Staff clear the
// maintenance first.
//
// Bookings will need exactly the same guard once that module exists — add the count here.
async function maintenanceWithin(resortCode: string, unitNo: string, start: Date, end: Date): Promise<number> {
  return prisma.resortMaintenance.count({
    where: { resortCode, unitNo, startDate: { lte: end }, endDate: { gte: start } },
  });
}

// RCI bulk bank (RCI fn 3) weeks this unit has inside [start,end]. Exactly the same
// reasoning as maintenanceWithin: applyBankDelta has already deducted those days from
// balNight, so applyDelta's -1 would clamp at 0 and the deduction would never be given
// back. Staff remove the banked weeks first.
async function bulkBankWithin(resortCode: string, unitNo: string, start: Date, end: Date): Promise<number> {
  return prisma.rciBulkBank.count({
    where: { resortCode, unitNo, checkIn: { lte: end }, checkOut: { gte: start } },
  });
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

// Availability records per unit at this resort. Feeds the Resorts Maintenance form, which
// may only offer units already in the booking pool and makes the user pick ONE of these
// records before keying date ranges inside it. Units absent from the result have no
// availability at all, which is what greys them out in that unit picker.
// Index-only: resortCode is the leftmost prefix of the [resortCode, unitNo, startDate,
// endDate] unique, and nothing is included, so even V-LDBR's 2,139 blocks stay a small
// single payload. startDate desc matches the fn 5 list order, putting the current record
// at the top of the picker.
export async function listUnitsWithAvailability(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  if (!resortCode) { res.status(400).json({ error: 'resortCode is required' }); return; }

  const blocks = await prisma.aptBlock.findMany({
    where: { resortCode },
    select: { id: true, unitNo: true, startDate: true, endDate: true },
    orderBy: [{ unitNo: 'asc' }, { startDate: 'desc' }],
  });

  const byUnit = new Map<string, { id: string; startDate: Date; endDate: Date }[]>();
  for (const b of blocks) {
    const list = byUnit.get(b.unitNo);
    const entry = { id: b.id, startDate: b.startDate, endDate: b.endDate };
    if (list) list.push(entry); else byUnit.set(b.unitNo, [entry]);
  }

  res.json({ data: [...byUnit].map(([unitNo, unitBlocks]) => ({ unitNo, blocks: unitBlocks })) });
}

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Resort Availability chart: ResAvailMast pivoted to rows (resort x apartment type)
// by a rolling date window, cell = balNight (units available). Read-only view.
export async function getAvailabilityChart(req: Request, res: Response): Promise<void> {
  // Any product may be charted (2026-08-17). This used to be a fixed `product=LHC|CP`
  // mapped to coCode 03 / 02; the picker now reads the Product master, so the coCode
  // comes straight from the client. Product status is not checked here -- the picker
  // offers active products, but charting a retired one by URL must still work.
  const coCode = typeof req.query.coCode === 'string' ? req.query.coCode.trim() : '';
  if (!coCode) { res.status(400).json({ error: 'coCode is required' }); return; }
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
    where: { coCode, status: 'A' },
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

  res.json({ coCode, startDate: dateStr, days, dates, rows });
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

// MAR batch: create/reuse N units at one resort and give each an availability record over one
// shared date range, all-or-nothing in a single transaction (same shape as createMaintenance).
//
// Unit numbering restarts at 1 on every run. A generated unit that already exists with the SAME
// apartment type is REUSED (its ResortUnit row is left untouched, only the block is added) —
// that is the normal path for the second and later runs, which set up next year's dates for the
// units already registered. A clash with a DIFFERENT apartment type is a hard 409: ResortUnit is
// unique on [resortCode, unitNo], so one unit number cannot belong to two types.
export async function createAptBlockBatch(req: Request, res: Response): Promise<void> {
  const parsed = marBatchSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { resortCode, apartmentType, unitCount, occupancy } = parsed.data;
  const startDate = toUtcMidnight(parsed.data.startDate);
  const endDate = toUtcMidnight(parsed.data.endDate);

  if (endDate < startDate) { res.status(400).json({ error: 'End date must be on or after start date' }); return; }

  const resort = await prisma.resort.findUnique({ where: { resortCode } });
  if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }

  // Enforce the scope split server-side, not just in the dropdown
  if (OWN_CO_CODES.includes(resort.coCode)) {
    res.status(400).json({
      error: `${resortCode} belongs to one of our own products (03/15/02). Use Add availability to set up its units individually.`,
    });
    return;
  }

  // MAR is an explicit flag (fn 2), not an inference from coCode: a partner resort is not
  // automatically made available to our members. Kept in step with the picker, which lists
  // mar='Y' resorts only.
  if (resort.mar !== 'Y') {
    res.status(400).json({
      error: `${resortCode} is not flagged as a MAR resort. Tick MAR on it in Resorts Master Maintenance and Setup (fn 2) first.`,
    });
    return;
  }

  if (!(await apartmentTypeExists(resortCode, apartmentType))) {
    res.status(400).json({ error: 'Apartment type not set up for this resort' });
    return;
  }

  const days = eachUtcDay(startDate, endDate);
  if (days.length > MAX_RANGE_DAYS) { res.status(400).json({ error: `Date range too large (max ${MAX_RANGE_DAYS} days)` }); return; }

  const unitNos = Array.from({ length: unitCount }, (_, i) => `${i + 1}-${occupancy}`);

  // Existing units, in one query: same type -> reuse, different type -> refuse
  const existing = await prisma.resortUnit.findMany({
    where: { resortCode, unitNo: { in: unitNos } },
    select: { unitNo: true, apartmentType: true },
  });
  const conflict = existing.filter(u => u.apartmentType !== apartmentType);
  if (conflict.length) {
    const named = conflict.slice(0, 3).map(u => `${u.unitNo} (${u.apartmentType})`).join(', ');
    res.status(409).json({
      error: `${conflict.length} unit number(s) already exist at this resort with a different apartment type: ${named}${conflict.length > 3 ? ', ...' : ''}`,
    });
    return;
  }
  const reused = new Set(existing.map(u => u.unitNo));
  const toCreate = unitNos.filter(u => !reused.has(u));

  // One overlap query for the whole batch. hasOverlap() takes no TransactionClient and is
  // per-unit, so it is neither usable inside the transaction nor efficient here.
  const clash = await prisma.aptBlock.findMany({
    where: { resortCode, unitNo: { in: unitNos }, startDate: { lte: endDate }, endDate: { gte: startDate } },
    select: { unitNo: true },
    orderBy: { unitNo: 'asc' },
  });
  if (clash.length) {
    const named = clash.slice(0, 5).map(b => b.unitNo).join(', ');
    res.status(409).json({
      error: `${clash.length} unit(s) already have an availability record overlapping these dates: ${named}${clash.length > 5 ? ', ...' : ''}`,
    });
    return;
  }

  try {
    await prisma.$transaction(async (tx) => {
      if (toCreate.length) {
        await tx.resortUnit.createMany({
          data: toCreate.map(unitNo => ({
            id: randomUUID(), resortId: resort.id, resortCode, unitNo, apartmentType,
            occupancy, rciReserved: 'N', updatedAt: new Date(),
          })) as never,
        });
      }
      await tx.aptBlock.createMany({
        data: unitNos.map(unitNo => ({
          id: randomUUID(), resortId: resort.id, resortCode, unitNo, apartmentType,
          startDate, endDate, updatedAt: new Date(),
        })) as never,
      });
      // One pass over the days, +unitNos.length each — see the note on applyDelta
      await applyDelta(tx, resort.id, resortCode, apartmentType, days, 1, unitNos.length);
    }, { maxWait: 15_000, timeout: 120_000 });

    await writeAudit({
      userId: req.user.id,
      action: `Created MAR availability batch: ${resortCode} ${apartmentType}, ${unitNos.length} unit(s) (${parsed.data.startDate} to ${parsed.data.endDate})`,
      actionType: 'CREATE',
      targetType: 'AptBlock',
      metadata: {
        unitCount: unitNos.length, occupancy,
        unitsCreated: toCreate.length, unitsReused: reused.size, days: days.length,
      },
    });

    res.status(201).json({
      data: {
        resortCode, apartmentType, occupancy, unitNos,
        unitsCreated: toCreate.length,
        unitsReused: reused.size,
        blocksCreated: unitNos.length,
        startDate: parsed.data.startDate,
        endDate: parsed.data.endDate,
        days: days.length,
      },
    });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'One of these units already has an identical availability record' });
    } else { throw e; }
  }
}

export async function deleteAptBlock(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existing = await prisma.aptBlock.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Block not found' }); return; }

  const maintenance = await maintenanceWithin(existing.resortCode, existing.unitNo, existing.startDate, existing.endDate);
  if (maintenance > 0) {
    res.status(409).json({
      error: `Cannot delete — unit ${existing.unitNo} has ${maintenance} maintenance record(s) within these dates. Clear them in Resorts Unit Under Maintenance first.`,
    });
    return;
  }

  const bulkBank = await bulkBankWithin(existing.resortCode, existing.unitNo, existing.startDate, existing.endDate);
  if (bulkBank > 0) {
    res.status(409).json({
      error: `Cannot delete — unit ${existing.unitNo} has ${bulkBank} RCI bulk bank week(s) within these dates. Remove them in RCI Bulk Bank (fn 3) first.`,
    });
    return;
  }

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
