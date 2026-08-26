import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// RCI Bulk Bank - RCI function 3. A record = ONE RCI WEEK of ONE RCI-qualified unit
// (ResortUnit.rciReserved='Y') deposited into the RCI exchange network, graded a season
// colour by RCI (R=Red / B=Blue / W=White).
//
// The date range is not free-form: staff pick an RCI week from fn 2 (RciWeek), and the
// server derives checkIn = friStart and checkOut = friStart + 6. That makes the
// "check-in is a Friday" rule unbreakable - it is never keyed. (RciWeek.friEnd is
// friStart + 7, the true RCI check-out day; bulk_bank stores the LAST NIGHT, so the
// stored range is 7 inclusive days, the same convention resmt uses for
// rm_checkin/rm_checkout. Confirmed against the imported grid: at L-10024 the
// ResAvailMast deduction drops by exactly the banked-week count on the day AFTER a
// week's checkOut.)
//
// Each save adjusts the generated ResAvailMast grid's balNight for the unit's apartment
// type - actNight is never touched (the unit still exists, it just isn't ours to book).
// A week containing a day whose balNight is already 0 is REFUSED (409) rather than clamped
// - see fullDays() below for why banking differs from maintenance here.
//
// The migration (prisma/migrate-rci-bulk-bank.ts) deliberately applies NO grid deltas:
// res_avail_mast.txt was exported from Informix with the bulk-bank weeks already
// deducted, exactly like maintenance.
//
// bb_status is migrated for provenance as `bankStatus` and is DELIBERATELY absent from
// both zod schemas below, so no payload can write it (LvcCode incoming/outgoing/faxBatch
// precedent). New rows default to 'B' via the DB default.

const WEEK_DAYS = 7;   // a banked week is always exactly this many grid days
const DAY_MS = 86_400_000;
const MIN_YEAR = 2026; // mirrors rci-week.controller.ts
const MAX_YEAR = 2999;

// Informix bb_time_colour maps 1=Blue, 2=White, 3=Red (see migrate-rci-bulk-bank.ts).
// NOT the G/S/D value space of CpSeasonDate/SeasonPoint - different calendars.
const SEASONS = ['R', 'B', 'W'] as const;
export const SEASON_LABELS: Record<string, string> = { R: 'Red', B: 'Blue', W: 'White' };

const createSchema = z.object({
  resortCode: z.string().trim().min(1).max(8),
  unitNo:     z.string().trim().min(1).max(20),
  weekYear:   z.number().int().min(MIN_YEAR).max(MAX_YEAR),
  weekNo:     z.number().int().min(1).max(53),
  season:     z.enum(SEASONS),
});

// resortCode / unitNo / apartmentType / serialNo / bankStatus are fixed after creation
// (move = delete + re-add, the ResortMaintenance rule). The WEEK and the SEASON stay
// editable - a mis-keyed week and an RCI regrade are the two realistic corrections, and
// re-keying a week must not burn a new serial number.
const updateSchema = createSchema.omit({ resortCode: true, unitNo: true });

// Thrown inside a handler so a guard failure short-circuits with its own status
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const resortSelect = { select: { shortName: true, resortName: true, coCode: true } };

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Inclusive list of UTC-midnight days from start to end
function eachUtcDay(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  for (let ms = start.getTime(); ms <= end.getTime(); ms += DAY_MS) days.push(new Date(ms));
  return days;
}

// Adjust the per-day ResAvailMast grid for a banked week.
// sign=-1: week banked to RCI -> balNight -= 1 (floor 0)
// sign=+1: week withdrawn      -> balNight += 1 (ceiling actNight)
// Rows are never created or deleted, and actNight is never changed: a day with no grid
// row simply means the unit isn't in the availability pool then, so there is nothing to
// reduce. `clamped` flags days where the floor/ceiling blocked the change.
//
// Deliberately a COPY of applyMaintDelta in resort-maintenance.controller.ts rather than
// a shared helper: fn 3 and fn 6 are proven separately and are likely to diverge (bulk
// bank may grow a release/relNight concept). Extract to utils/availabilityGrid.ts when
// the Resorts Reservation module becomes the third caller.
async function applyBankDelta(
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

// The RCI week is the only date input, so both ends are derived and can never disagree
// with fn 2's calendar.
async function resolveWeek(weekYear: number, weekNo: number) {
  const wk = await prisma.rciWeek.findUnique({ where: { year_weekNo: { year: weekYear, weekNo } } });
  if (!wk) {
    throw new HttpError(400,
      `RCI week ${weekNo} of ${weekYear} has not been set up. Add the year in RCI Weekly Interval (fn 2) first.`);
  }
  // Defensive: fn 2 derives every Friday, so this can only fire on corrupt data.
  // NOTE getUTCDay(): Sunday=0 ... Friday=5 - the one easy off-by-one here.
  if (wk.friStart.getUTCDay() !== 5) {
    throw new HttpError(400,
      `RCI week ${weekNo} of ${weekYear} does not start on a Friday - check the week calendar.`);
  }
  const checkIn = wk.friStart;
  const checkOut = new Date(checkIn.getTime() + (WEEK_DAYS - 1) * DAY_MS); // = friEnd - 1
  return { checkIn, checkOut, days: eachUtcDay(checkIn, checkOut) };       // exactly 7
}

// Availability precondition. Every day of the week must be covered by the unit's fn 5
// AptBlock records - applyBankDelta skips days with no grid row, so a week outside
// availability would write a record that silently changes nothing (the fn 6 reasoning).
//
// Coverage is by the UNION of the unit's blocks, not one chosen block: fn 5 keys
// availability as a chain of yearly blocks, so a week crossing a year boundary (2027
// wk53 runs 31-12-2027 -> 06-01-2028) sits legitimately across two consecutive records.
// fn 6 makes staff split such a range into two saves; a week is indivisible, so that is
// not an option here - and the union is what actually matters for the grid anyway. This
// is why there is no aptBlockId in the payload.
async function checkAvailability(resortCode: string, unitNo: string, days: Date[]): Promise<string | null> {
  const start = days[0];
  const end = days[days.length - 1];
  const blocks = await prisma.aptBlock.findMany({
    where: { resortCode, unitNo, startDate: { lte: end }, endDate: { gte: start } },
    select: { id: true, startDate: true, endDate: true },
  });
  if (blocks.length === 0) {
    return `No availability set up for unit ${unitNo} over ${ymd(start)} to ${ymd(end)}. `
         + 'Add it in Resorts Unit Availability/Inventory Setup (fn 5) first.';
  }
  const uncovered = days.filter(d => !blocks.some(b => b.startDate <= d && b.endDate >= d));
  if (uncovered.length) {
    return `Availability for unit ${unitNo} does not cover ${uncovered.map(ymd).join(', ')} `
         + '- the whole RCI week must sit inside the unit availability.';
  }
  return null;
}

// Overlap with an existing bulk bank record for the same unit. RCI weeks never partially
// overlap each other (consecutive friStarts are 7 days apart and a week spans 6), so the
// unique index alone would normally do - this exists to give a readable 409 and to catch
// a legacy row whose range isn't a clean week.
async function findOverlap(resortCode: string, unitNo: string, start: Date, end: Date, excludeId?: string) {
  return prisma.rciBulkBank.findFirst({
    where: {
      resortCode,
      unitNo,
      checkIn: { lte: end },
      checkOut: { gte: start },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true, serialNo: true, weekYear: true, weekNo: true, checkIn: true, checkOut: true },
  });
}

// A unit under maintenance is out of the booking pool; banking it to RCI would deduct
// balNight a SECOND time for the same physical unit-night (or clamp at 0 and lose the
// deduction). Business decision: refuse 409. The mirror guard lives in
// resort-maintenance.controller.ts.
async function maintenanceOverlap(resortCode: string, unitNo: string, start: Date, end: Date): Promise<number> {
  return prisma.resortMaintenance.count({
    where: { resortCode, unitNo, startDate: { lte: end }, endDate: { gte: start } },
  });
}

// Days in the week where the apartment type is already fully committed (balNight = 0).
// Banking one of those would promise RCI a unit that is already spoken for, and
// applyBankDelta's floor at 0 would swallow the deduction silently - so the record would
// claim seven nights while the grid only gave up five.
//
// Business decision 2026-08-26: REFUSE rather than clamp. Unlike fn 6 maintenance - an
// internal call that is sometimes a legitimate emergency override - banking is an external
// commercial promise to RCI, and it must not be possible to make one the estate cannot
// honour. Refusing also avoids the delete asymmetry: a clamped day gives a night back on
// delete that was never taken, inventing availability that does not exist.
//
// Days with no grid row are NOT flagged here - checkAvailability has already required the
// whole week to sit inside the unit's fn 5 availability, and a missing row means the unit
// is not in the pool that day, which is a different (already-reported) problem.
async function fullDays(resortCode: string, apartmentType: string, days: Date[]): Promise<Date[]> {
  const rows = await prisma.resAvailMast.findMany({
    where: {
      resortCode,
      apartmentType,
      date: { gte: days[0], lte: days[days.length - 1] },
      balNight: { lte: 0 },
    },
    select: { date: true },
    orderBy: { date: 'asc' },
  });
  return rows.map(r => r.date);
}

// Migrated rows always carry an apartmentType (the importer skips units that aren't
// registered), but fall back to the ResortUnit register defensively so the grid can
// always be maintained.
async function resolveType(resortCode: string, unitNo: string, current: string | null): Promise<string | null> {
  if (current) return current;
  const unit = await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode, unitNo } } });
  return unit?.apartmentType ?? null;
}

const weekLabel = (weekYear: number | null, weekNo: number | null) =>
  weekYear && weekNo ? `${weekYear} week ${weekNo}` : 'its week';

export async function listRciBulkBank(req: Request, res: Response): Promise<void> {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const unitNo = typeof req.query.unitNo === 'string' ? req.query.unitNo.trim() : '';
  const season = typeof req.query.season === 'string' ? req.query.season.trim() : '';
  const weekYear = parseInt(String(req.query.weekYear), 10);
  const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize), 10) || 50));

  const where = {
    ...(resortCode ? { resortCode } : {}),
    ...(unitNo ? { unitNo } : {}),
    ...(season ? { season } : {}),
    ...(weekYear >= MIN_YEAR && weekYear <= MAX_YEAR ? { weekYear } : {}),
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

  const [total, records] = await Promise.all([
    prisma.rciBulkBank.count({ where }),
    prisma.rciBulkBank.findMany({
      where,
      include: { resort: resortSelect },
      orderBy: [{ checkIn: 'desc' }, { resortCode: 'asc' }, { unitNo: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  res.json({ data: records, total, page, pageSize });
}

// Distinct years present in the register, newest first - feeds the Year filter dropdown.
export async function getRciBulkBankYears(_req: Request, res: Response): Promise<void> {
  const rows = await prisma.rciBulkBank.groupBy({
    by: ['weekYear'],
    where: { weekYear: { not: null } },
    orderBy: { weekYear: 'desc' },
  });
  res.json({ data: rows.map(r => r.weekYear).filter((y): y is number => y !== null) });
}

// RCI-qualified units at one resort, each with its fn 5 availability ranges. A unit with
// an empty blocks[] has no availability and cannot be banked - the picker lists it
// disabled, the same treatment fn 6 gives. Filtering to rciReserved='Y' happens HERE, in
// the same file as the 400 guard in createRciBulkBank, so the two cannot drift.
export async function listBulkBankUnits(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  if (!resortCode) { res.status(400).json({ error: 'resortCode is required' }); return; }

  const [units, blocks] = await Promise.all([
    prisma.resortUnit.findMany({
      where: { resortCode, rciReserved: 'Y' },
      select: { unitNo: true, apartmentType: true, occupancy: true },
      orderBy: { unitNo: 'asc' },
    }),
    prisma.aptBlock.findMany({
      where: { resortCode },
      select: { id: true, unitNo: true, startDate: true, endDate: true },
      orderBy: [{ unitNo: 'asc' }, { startDate: 'desc' }],
    }),
  ]);

  const byUnit = new Map<string, { id: string; startDate: Date; endDate: Date }[]>();
  for (const b of blocks) {
    const entry = { id: b.id, startDate: b.startDate, endDate: b.endDate };
    const list = byUnit.get(b.unitNo);
    if (list) list.push(entry); else byUnit.set(b.unitNo, [entry]);
  }

  res.json({
    data: units.map(u => ({ ...u, blocks: byUnit.get(u.unitNo) ?? [] })),
  });
}

// Per-day availability grid (ResAvailMast) for a banked week's resort + apartment type,
// scoped to its 7 days. The grid is keyed by apartment type (aggregate across all units
// of that type), not by the individual unit.
export async function getRciBulkBankAvailability(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const record = await prisma.rciBulkBank.findUnique({ where: { id } });
  if (!record) { res.status(404).json({ error: 'Bulk bank record not found' }); return; }

  const apartmentType = await resolveType(record.resortCode, record.unitNo, record.apartmentType);

  const rows = apartmentType
    ? await prisma.resAvailMast.findMany({
        where: { resortCode: record.resortCode, apartmentType, date: { gte: record.checkIn, lte: record.checkOut } },
        orderBy: { date: 'asc' },
        select: { date: true, actNight: true, balNight: true },
      })
    : [];

  res.json({
    resortCode: record.resortCode,
    unitNo: record.unitNo,
    apartmentType,
    startDate: record.checkIn,
    endDate: record.checkOut,
    data: rows,
  });
}

export async function createRciBulkBank(req: Request, res: Response): Promise<void> {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { resortCode, unitNo, weekYear, weekNo, season } = parsed.data;

  try {
    const resort = await prisma.resort.findUnique({ where: { resortCode } });
    if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }

    const unit = await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode, unitNo } } });
    if (!unit) { res.status(400).json({ error: 'Unit not set up for this resort' }); return; }
    if (unit.rciReserved !== 'Y') {
      res.status(400).json({
        error: `Unit ${unitNo} is not RCI-qualified (RCI Reserved = N). `
             + "Tick RCI Reserved in Apartment's Unit No. Maintenance and Setup (fn 4) first.",
      });
      return;
    }
    const apartmentType = unit.apartmentType;

    const { checkIn, checkOut, days } = await resolveWeek(weekYear, weekNo);

    const clash = await findOverlap(resortCode, unitNo, checkIn, checkOut);
    if (clash) {
      const sameWeek = clash.checkIn.getTime() === checkIn.getTime() && clash.checkOut.getTime() === checkOut.getTime();
      res.status(409).json({
        error: sameWeek
          ? `Unit ${unitNo} is already banked for week ${weekNo} of ${weekYear} (serial ${clash.serialNo}).`
          : `Week ${weekNo} of ${weekYear} overlaps an existing bulk bank record for this unit `
            + `(${ymd(clash.checkIn)} to ${ymd(clash.checkOut)}, serial ${clash.serialNo}).`,
      });
      return;
    }

    const availabilityError = await checkAvailability(resortCode, unitNo, days);
    if (availabilityError) { res.status(400).json({ error: availabilityError }); return; }

    const maint = await maintenanceOverlap(resortCode, unitNo, checkIn, checkOut);
    if (maint > 0) {
      res.status(409).json({
        error: `Unit ${unitNo} is under maintenance during week ${weekNo} of ${weekYear} `
             + `(${maint} record(s)). Clear it in Resorts Unit Under Maintenance (fn 6) first.`,
      });
      return;
    }

    const full = await fullDays(resortCode, apartmentType, days);
    if (full.length) {
      res.status(409).json({
        error: `No ${apartmentType} availability left at ${resortCode} on ${full.map(ymd).join(', ')} `
             + `- every unit of this type is already committed. Week ${weekNo} of ${weekYear} cannot be `
             + 'banked to RCI until the conflict is cleared.',
      });
      return;
    }

    const { created, delta } = await prisma.$transaction(async (tx) => {
      // serialNo continues the Informix sequence (max was 39261 at cutover). Allocated
      // inside the transaction; the unique index is the backstop against a concurrent add.
      const agg = await tx.rciBulkBank.aggregate({ _max: { serialNo: true } });
      const serialNo = (agg._max.serialNo ?? 0) + 1;

      const row = await tx.rciBulkBank.create({
        data: {
          id: randomUUID(), serialNo, resortId: resort.id, resortCode, unitNo, apartmentType,
          checkIn, checkOut, weekYear, weekNo, season, updatedAt: new Date(),
        } as never,
        include: { resort: resortSelect },
      });
      const d = await applyBankDelta(tx, resortCode, apartmentType, days, -1);
      return { created: row, delta: d };
    }, { maxWait: 15_000, timeout: 120_000 });

    await writeAudit({
      userId: req.user.id,
      action: `Created RCI bulk bank week: ${resortCode} ${unitNo} (${weekYear} wk${weekNo}, `
            + `${ymd(checkIn)} to ${ymd(checkOut)}, ${SEASON_LABELS[season]})`,
      actionType: 'CREATE',
      targetType: 'RciBulkBank',
      metadata: { serialNo: created.serialNo, days: days.length, adjusted: delta.adjusted, clamped: delta.clamped },
    });
    res.status(201).json({ data: created, clamped: delta.clamped });
  } catch (e: unknown) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); }
    else if ((e as { code?: string }).code === 'P2002') {
      const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? '');
      res.status(409).json({
        error: target.includes('serialNo')
          ? 'Serial number already in use - please retry'
          : 'This unit is already banked for that week.',
      });
    } else { throw e; }
  }
}

export async function updateRciBulkBank(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { weekYear, weekNo, season } = parsed.data;

  try {
    const existing = await prisma.rciBulkBank.findUnique({ where: { id } });
    if (!existing) { res.status(404).json({ error: 'Bulk bank record not found' }); return; }

    const { checkIn, checkOut, days } = await resolveWeek(weekYear, weekNo);
    const { resortCode, unitNo } = existing;

    // A season-only edit needs no grid work at all: reversing then re-applying the same
    // days nets to zero but costs 14 round-trips.
    const weekChanged = checkIn.getTime() !== existing.checkIn.getTime()
                     || checkOut.getTime() !== existing.checkOut.getTime();

    if (weekChanged) {
      const clash = await findOverlap(resortCode, unitNo, checkIn, checkOut, id);
      if (clash) {
        res.status(409).json({
          error: `Week ${weekNo} of ${weekYear} overlaps an existing bulk bank record for this unit `
               + `(${ymd(clash.checkIn)} to ${ymd(clash.checkOut)}, serial ${clash.serialNo}).`,
        });
        return;
      }

      const availabilityError = await checkAvailability(resortCode, unitNo, days);
      if (availabilityError) { res.status(400).json({ error: availabilityError }); return; }

      const maint = await maintenanceOverlap(resortCode, unitNo, checkIn, checkOut);
      if (maint > 0) {
        res.status(409).json({
          error: `Unit ${unitNo} is under maintenance during week ${weekNo} of ${weekYear} `
               + `(${maint} record(s)). Clear it in Resorts Unit Under Maintenance (fn 6) first.`,
        });
        return;
      }

      // Only reachable when the week actually moved. RCI weeks are 7 inclusive days and
      // consecutive friStarts are 7 days apart, so the new week never shares a day with the
      // old one - this record's own deduction can't mask a full day in the new week.
      const typeForCheck = await resolveType(resortCode, unitNo, existing.apartmentType);
      if (typeForCheck) {
        const full = await fullDays(resortCode, typeForCheck, days);
        if (full.length) {
          res.status(409).json({
            error: `No ${typeForCheck} availability left at ${resortCode} on ${full.map(ymd).join(', ')} `
                 + `- every unit of this type is already committed. Week ${weekNo} of ${weekYear} cannot be `
                 + 'banked to RCI until the conflict is cleared.',
          });
          return;
        }
      }
    }

    const apartmentType = await resolveType(resortCode, unitNo, existing.apartmentType);

    const record = await prisma.$transaction(async (tx) => {
      if (weekChanged && apartmentType) {
        // Reverse the old week, then apply the new one - days in both net to zero
        await applyBankDelta(tx, resortCode, apartmentType, eachUtcDay(existing.checkIn, existing.checkOut), 1);
        await applyBankDelta(tx, resortCode, apartmentType, days, -1);
      }
      return tx.rciBulkBank.update({
        where: { id },
        data: { weekYear, weekNo, checkIn, checkOut, season, apartmentType, updatedAt: new Date() } as never,
        include: { resort: resortSelect },
      });
    }, { maxWait: 15_000, timeout: 120_000 });

    await writeAudit({
      userId: req.user.id,
      action: `Updated RCI bulk bank week: ${resortCode} ${unitNo} (${weekYear} wk${weekNo}, `
            + `${ymd(checkIn)} to ${ymd(checkOut)}, ${SEASON_LABELS[season]})`,
      actionType: 'UPDATE',
      targetType: 'RciBulkBank',
      metadata: { serialNo: existing.serialNo, weekChanged },
    });
    res.json({ data: record });
  } catch (e: unknown) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); }
    else if ((e as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'This unit is already banked for that week.' });
    } else { throw e; }
  }
}

// Hard delete with NO usage guard - nothing references RciBulkBank yet. Add one when the
// Resorts Reservation module starts booking against a banked week.
export async function deleteRciBulkBank(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  const existing = await prisma.rciBulkBank.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: 'Bulk bank record not found' }); return; }

  const apartmentType = await resolveType(existing.resortCode, existing.unitNo, existing.apartmentType);

  const delta = await prisma.$transaction(async (tx) => {
    let d = { adjusted: 0, clamped: false };
    if (apartmentType) {
      d = await applyBankDelta(tx, existing.resortCode, apartmentType, eachUtcDay(existing.checkIn, existing.checkOut), 1);
    }
    await tx.rciBulkBank.delete({ where: { id } });
    return d;
  }, { maxWait: 15_000, timeout: 120_000 });

  await writeAudit({
    userId: req.user.id,
    action: `Deleted RCI bulk bank week: ${existing.resortCode} ${existing.unitNo} `
          + `(${weekLabel(existing.weekYear, existing.weekNo)}, ${ymd(existing.checkIn)} to ${ymd(existing.checkOut)})`,
    actionType: 'DELETE',
    targetType: 'RciBulkBank',
    metadata: { serialNo: existing.serialNo, adjusted: delta.adjusted, clamped: delta.clamped },
  });
  res.json({ message: 'Bulk bank record deleted' });
}
