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
// THE SCREEN IS A WHOLE-YEAR GRID, not a record list (2026-08-28). Staff pick resort +
// unit + year and see weeks 1..52/53 with an editable season beside each, mirroring fn 8's
// month grid; there is ONE write endpoint, saveRciBulkBankYear, which reconciles the year:
// blank -> season creates, season -> season updates, season -> blank deletes. That shape
// follows the data - each (resort, unit, year) is banked for essentially the whole year
// (51 of 52 weeks in 2026, the gap always being the year's last week), so the old
// one-week-at-a-time modal cost 52 round trips and ~1,000 queries to key a single year.
//
// The save is SET-BASED and all-or-nothing: every guard runs as one query for the whole
// batch before the transaction opens, and a single failing week aborts the lot. A year
// save is ~12-15 queries regardless of how many weeks changed.
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

// Replace-all within one (resort, unit, year): the client sends EVERY week the grid
// shows, with season null meaning "not banked". The server diffs that against what is
// stored and works out the creates / updates / deletes itself, so the client never has to
// know which of the three a cell edit turned into.
const yearSaveSchema = z.object({
  resortCode: z.string().trim().min(1).max(8),
  unitNo:     z.string().trim().min(1).max(20),
  weekYear:   z.number().int().min(MIN_YEAR).max(MAX_YEAR),
  weeks: z.array(z.object({
    weekNo: z.number().int().min(1).max(53),
    season: z.enum(SEASONS).nullable(),
  })).min(1).max(53),
});

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

// Adjust the per-day ResAvailMast grid for a set of banked days.
// sign=-1: weeks banked to RCI -> balNight -= 1 (floor 0)
// sign=+1: weeks withdrawn      -> balNight += 1 (ceiling actNight)
// Rows are never created or deleted, and actNight is never changed: a day with no grid
// row simply means the unit isn't in the availability pool then, so there is nothing to
// reduce. `clamped` flags days where the floor/ceiling blocked the change.
//
// TWO queries for the whole save, whatever the day count - read the affected rows, decide
// in memory which may move, then one updateMany with an atomic increment/decrement. The
// per-day read+write form this replaced cost 14 round-trips per week, which a 52-week year
// save would have turned into ~730.
//
// Do NOT rewrite this as $executeRaw. The obvious version - "date" IN (...) with the Date
// objects bound directly - silently matches NOTHING: `date` is a plain TIMESTAMP holding
// UTC midnight, a bound JS Date arrives as timestamptz, and comparing the two makes
// Postgres convert using the server zone (Asia/Kuala_Lumpur), shifting every value 8 hours
// off. Measured 2026-08-28: 0 rows updated where 7 should have been. Prisma's own
// date: { in: days } binding gets this right, so the read stays in Prisma.
//
// Semantically identical to applyMaintDelta in resort-maintenance.controller.ts, which is
// still the per-day form. Extract to utils/availabilityGrid.ts when the Resorts
// Reservation module becomes the third caller.
async function applyBankDelta(
  tx: Prisma.TransactionClient,
  resortCode: string,
  apartmentType: string,
  days: Date[],
  sign: 1 | -1,
): Promise<{ adjusted: number; clamped: boolean }> {
  if (days.length === 0) return { adjusted: 0, clamped: false };

  const rows = await tx.resAvailMast.findMany({
    where: { resortCode, apartmentType, date: { in: days } },
    select: { id: true, actNight: true, balNight: true },
  });

  // A day can go unadjusted for two very different reasons - no grid row at all (the unit
  // isn't in the pool, a legitimate skip, and those rows simply aren't in `rows`) or the
  // floor/ceiling blocked it. Only the second is `clamped`.
  const movable = sign === -1
    ? rows.filter(r => r.balNight > 0)
    : rows.filter(r => r.balNight < r.actNight);

  if (movable.length) {
    await tx.resAvailMast.updateMany({
      where: { id: { in: movable.map(r => r.id) } },
      data: { balNight: sign === -1 ? { decrement: 1 } : { increment: 1 }, updatedAt: new Date() },
    });
  }
  return { adjusted: movable.length, clamped: movable.length < rows.length };
}

// Apartment types that may NOT be banked at this resort - the lock-off halves - or null
// when the resort has no such restriction.
//
// A lock-on/lock-off resort (Resort.lockOnOff='Y' -- CP-PBR today) sells ONE physical
// apartment three ways: the whole unit and each of its two halves are separate ResortUnit
// rows with separate apartment types. At CP-PBR that is 3201/3202 SLEEP6 (lockType LM,
// the whole unit) alongside 3201 SLEEP4 and 3202 SLEEP2 (lockType **LS**, the halves).
//
// Only whole units may be banked to RCI (business rule 2026-08-26): the SPLIT (LS) types
// are excluded. Banking a half and the whole would promise the same physical apartment to
// RCI twice, and the ResAvailMast grid could not even express it -- the halves and the
// whole are separate apartment types, so deducting one leaves the others untouched and the
// double-commitment is invisible.
//
// The rule excludes LS specifically rather than allowing only LM, because the hazard is the
// master/half relationship. An LN (normal, non-splitting) apartment at a lock-off resort is
// a whole unit with no half to clash with, so it stays bankable. CP-PBR has no LN type
// today, so the two readings currently give the identical result: SLEEP6 only.
//
// Resorts with lockOnOff='N' are unrestricted -- their types are all LN.
async function splitUnitTypes(resortCode: string, lockOnOff: string | null): Promise<string[] | null> {
  if (lockOnOff !== 'Y') return null;
  const types = await prisma.apartmentType.findMany({
    where: { resortCode, lockType: 'LS' },
    select: { apartmentType: true },
  });
  return types.map(t => t.apartmentType);
}

// One year's RCI week calendar (fn 2), keyed by week number. Every date this module writes
// is derived from it, so a banked week can never disagree with fn 2.
async function loadCalendar(weekYear: number) {
  const weeks = await prisma.rciWeek.findMany({
    where: { year: weekYear },
    select: { weekNo: true, friStart: true },
    orderBy: { weekNo: 'asc' },
  });
  return new Map(weeks.map(w => [w.weekNo, w.friStart]));
}

const checkOutOf = (friStart: Date) => new Date(friStart.getTime() + (WEEK_DAYS - 1) * DAY_MS);

// One (resort, unit, year)'s banked weeks - the grid's read.
//
// Rows are matched on checkIn against the year's Friday starts rather than on the
// denormalized weekYear column, so a legacy row whose weekYear never resolved still shows
// up in the year it actually falls in. saveRciBulkBankYear matches identically, so what the
// grid displays is exactly what the save diffs against.
export async function listRciBulkBank(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const unitNo = typeof req.query.unitNo === 'string' ? req.query.unitNo.trim() : '';
  const weekYear = parseInt(String(req.query.weekYear), 10);

  if (!resortCode || !unitNo) { res.status(400).json({ error: 'resortCode and unitNo are required' }); return; }
  if (!(weekYear >= MIN_YEAR && weekYear <= MAX_YEAR)) { res.status(400).json({ error: 'A valid year is required' }); return; }

  const calendar = await loadCalendar(weekYear);
  if (calendar.size === 0) { res.json({ data: [], resortCode, unitNo, weekYear }); return; }

  const records = await prisma.rciBulkBank.findMany({
    where: { resortCode, unitNo, checkIn: { in: [...calendar.values()] } },
    orderBy: { checkIn: 'asc' },
  });

  res.json({ data: records, resortCode, unitNo, weekYear });
}

// Units at one resort that the grid may show, each with its fn 5 availability ranges.
//
// Two kinds are returned. `bankable` units (rciReserved='Y' and not a lock-off half) can
// have weeks banked. Units that are NOT bankable but already hold banked weeks are returned
// too, flagged, so their history stays visible and removable - fn 4's RCI_RESERVED
// whitelist un-flagged three units that between them still hold 205 records (CP-PBR
// 3205/3206 and 3227/3228, L-10024 A8), and hiding them would strand those rows with no way
// to reach them from the app. Everything else is omitted.
//
// A unit with an empty blocks[] has no availability and cannot be banked - the picker lists
// it disabled, the same treatment fn 6 gives.
export async function listBulkBankUnits(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  if (!resortCode) { res.status(400).json({ error: 'resortCode is required' }); return; }

  const resort = await prisma.resort.findUnique({ where: { resortCode }, select: { lockOnOff: true } });
  if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }

  // null = unrestricted; an array = these lock-off half types are NOT bankable
  const splitTypes = await splitUnitTypes(resortCode, resort.lockOnOff);

  const [units, blocks, banked] = await Promise.all([
    prisma.resortUnit.findMany({
      where: { resortCode },
      select: { unitNo: true, apartmentType: true, occupancy: true, rciReserved: true },
      orderBy: { unitNo: 'asc' },
    }),
    prisma.aptBlock.findMany({
      where: { resortCode },
      select: { id: true, unitNo: true, startDate: true, endDate: true },
      orderBy: [{ unitNo: 'asc' }, { startDate: 'desc' }],
    }),
    prisma.rciBulkBank.groupBy({ by: ['unitNo'], where: { resortCode }, _count: { _all: true } }),
  ]);

  const byUnit = new Map<string, { id: string; startDate: Date; endDate: Date }[]>();
  for (const b of blocks) {
    const entry = { id: b.id, startDate: b.startDate, endDate: b.endDate };
    const list = byUnit.get(b.unitNo);
    if (list) list.push(entry); else byUnit.set(b.unitNo, [entry]);
  }
  const bankedBy = new Map(banked.map(b => [b.unitNo, b._count._all]));

  const data = units
    .map(u => ({
      ...u,
      bankable: u.rciReserved === 'Y' && !splitTypes?.includes(u.apartmentType),
      bankedCount: bankedBy.get(u.unitNo) ?? 0,
      blocks: byUnit.get(u.unitNo) ?? [],
    }))
    .filter(u => u.bankable || u.bankedCount > 0);

  res.json({
    data,
    // Lets the form explain WHY the split types are missing, instead of the picker just
    // looking short. null when the resort is not lock-on/lock-off.
    splitTypes,
  });
}

// A week the save refuses, and why. Failures are COLLECTED rather than thrown on the first
// one: a year save touches up to 53 weeks, and being told about them one round trip at a
// time would be miserable.
interface WeekFailure { weekNo: number; status: 400 | 409; reason: string }

const FAILURES_SHOWN = 10;

function failureMessage(failures: WeekFailure[]): string {
  const shown = failures.slice(0, FAILURES_SHOWN)
    .map(f => `week ${f.weekNo} - ${f.reason}`)
    .join('; ');
  const more = failures.length > FAILURES_SHOWN ? `, and ${failures.length - FAILURES_SHOWN} more` : '';
  return `Nothing was saved. ${failures.length} week(s) cannot be banked: ${shown}${more}.`;
}

// Save a whole year for one unit - the grid's ONLY write path.
//
// The payload is every week the grid showed, so the diff against what is stored yields the
// creates, updates and deletes. Guards run over the CREATES only, which is what makes a
// non-RCI-qualified unit clear-only for free: blanking its weeks produces no creates, so
// the rciReserved guard never fires, while banking a new one is refused.
export async function saveRciBulkBankYear(req: Request, res: Response): Promise<void> {
  const parsed = yearSaveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }
  const { resortCode, unitNo, weekYear, weeks } = parsed.data;

  try {
    const seen = new Set<number>();
    for (const w of weeks) {
      if (seen.has(w.weekNo)) { res.status(400).json({ error: `Week ${w.weekNo} appears more than once` }); return; }
      seen.add(w.weekNo);
    }

    const resort = await prisma.resort.findUnique({ where: { resortCode } });
    if (!resort) { res.status(404).json({ error: 'Resort not found' }); return; }

    const unit = await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode, unitNo } } });
    if (!unit) { res.status(400).json({ error: 'Unit not set up for this resort' }); return; }
    const apartmentType = unit.apartmentType;

    const calendar = await loadCalendar(weekYear);
    if (calendar.size === 0) {
      res.status(400).json({
        error: `RCI weeks for ${weekYear} have not been set up. Add the year in RCI Weekly Interval (fn 2) first.`,
      });
      return;
    }
    for (const w of weeks) {
      const friStart = calendar.get(w.weekNo);
      if (!friStart) {
        res.status(400).json({ error: `RCI week ${w.weekNo} does not exist in the ${weekYear} calendar (fn 2).` });
        return;
      }
      // Defensive: fn 2 derives every Friday, so this can only fire on corrupt data.
      // NOTE getUTCDay(): Sunday=0 ... Friday=5 - the one easy off-by-one here.
      if (friStart.getUTCDay() !== 5) {
        res.status(400).json({
          error: `RCI week ${w.weekNo} of ${weekYear} does not start on a Friday - check the week calendar (fn 2).`,
        });
        return;
      }
    }

    // Matched on checkIn, exactly as listRciBulkBank does, so the diff is against what the
    // grid actually displayed.
    const friStarts = weeks.map(w => calendar.get(w.weekNo) as Date);
    const stored = await prisma.rciBulkBank.findMany({
      where: { resortCode, unitNo, checkIn: { in: friStarts } },
    });
    const byCheckIn = new Map(stored.map(r => [r.checkIn.getTime(), r]));

    const creates: { weekNo: number; season: string; checkIn: Date; checkOut: Date; days: Date[] }[] = [];
    const updates: { id: string; season: string }[] = [];
    const deletes: { id: string; checkIn: Date; checkOut: Date }[] = [];

    for (const w of weeks) {
      const checkIn = calendar.get(w.weekNo) as Date;
      const checkOut = checkOutOf(checkIn);
      const row = byCheckIn.get(checkIn.getTime());
      if (w.season && !row) {
        creates.push({ weekNo: w.weekNo, season: w.season, checkIn, checkOut, days: eachUtcDay(checkIn, checkOut) });
      } else if (w.season && row && row.season !== w.season) {
        updates.push({ id: row.id, season: w.season });
      } else if (!w.season && row) {
        deletes.push({ id: row.id, checkIn: row.checkIn, checkOut: row.checkOut });
      }
    }

    if (!creates.length && !updates.length && !deletes.length) {
      res.json({ data: { resortCode, unitNo, weekYear, created: 0, updated: 0, deleted: 0, clamped: false } });
      return;
    }

    const failures: WeekFailure[] = [];

    if (creates.length) {
      // Whole-unit rules first - one bad answer condemns every create, so report it once
      // rather than 52 times.
      if (unit.rciReserved !== 'Y') {
        res.status(400).json({
          error: `Unit ${unitNo} is not RCI-qualified (RCI Reserved = N), so no new weeks can be banked. `
               + "Tick RCI Reserved in Apartment's Unit No. Maintenance and Setup (fn 4) first. "
               + 'Weeks already banked can still be cleared.',
        });
        return;
      }
      const splitTypes = await splitUnitTypes(resortCode, resort.lockOnOff);
      if (splitTypes?.includes(apartmentType)) {
        res.status(400).json({
          error: `Unit ${unitNo} is a ${apartmentType} lock-off half. ${resortCode} has the `
               + 'lock-on/lock-off feature, so only whole units can be banked to RCI '
               + `(${splitTypes.join(', ')} are split types).`,
        });
        return;
      }

      const spanStart = creates.reduce((a, c) => (c.checkIn < a ? c.checkIn : a), creates[0].checkIn);
      const spanEnd = creates.reduce((a, c) => (c.checkOut > a ? c.checkOut : a), creates[0].checkOut);
      const deletedIds = new Set(deletes.map(d => d.id));

      // Four batch queries covering the whole span, then every per-week check is in memory.
      const [others, blocks, maintenance, fullRows] = await Promise.all([
        // Overlap with a record OUTSIDE this save's week set - a neighbouring year's last
        // week can reach into this one. Rows being deleted in the same save don't count.
        prisma.rciBulkBank.findMany({
          where: { resortCode, unitNo, checkIn: { lte: spanEnd }, checkOut: { gte: spanStart } },
          select: { id: true, serialNo: true, checkIn: true, checkOut: true },
        }),
        // Availability is by the UNION of the unit's fn 5 blocks, not one chosen block: fn 5
        // keys availability as a chain of yearly blocks, so a week crossing a year boundary
        // (2027 wk53 runs 31-12-2027 -> 06-01-2028) sits legitimately across two consecutive
        // records. That is also why there is no aptBlockId in the payload, unlike fn 6.
        prisma.aptBlock.findMany({
          where: { resortCode, unitNo, startDate: { lte: spanEnd }, endDate: { gte: spanStart } },
          select: { startDate: true, endDate: true },
        }),
        // A unit under maintenance is out of the booking pool; banking it would deduct
        // balNight a SECOND time for the same physical unit-night. The mirror guard lives in
        // resort-maintenance.controller.ts.
        prisma.resortMaintenance.findMany({
          where: { resortCode, unitNo, startDate: { lte: spanEnd }, endDate: { gte: spanStart } },
          select: { startDate: true, endDate: true },
        }),
        // Days where the apartment type is already fully committed. Business decision
        // 2026-08-26: REFUSE rather than clamp. Unlike fn 6 maintenance - an internal call
        // that is sometimes a legitimate emergency override - banking is an external
        // commercial promise to RCI, and it must not be possible to make one the estate
        // cannot honour. Refusing also avoids the delete asymmetry: a clamped day would give
        // a night back on delete that was never taken.
        prisma.resAvailMast.findMany({
          where: { resortCode, apartmentType, date: { gte: spanStart, lte: spanEnd }, balNight: { lte: 0 } },
          select: { date: true },
        }),
      ]);

      const fullSet = new Set(fullRows.map(r => r.date.getTime()));

      // Creates and deletes never share a day: RCI weeks are disjoint and one unit is in
      // play, so a delete in this same save cannot free up a day a create needs. The
      // balNight snapshot above therefore needs no in-flight adjustment.
      for (const c of creates) {
        const clash = others.find(o =>
          !deletedIds.has(o.id) && o.checkIn <= c.checkOut && o.checkOut >= c.checkIn);
        if (clash) {
          failures.push({
            weekNo: c.weekNo, status: 409,
            reason: `already banked as serial ${clash.serialNo} (${ymd(clash.checkIn)} to ${ymd(clash.checkOut)})`,
          });
          continue;
        }

        if (blocks.length === 0) {
          failures.push({
            weekNo: c.weekNo, status: 400,
            reason: `no availability set up for unit ${unitNo} - add it in Resorts Unit Availability/Inventory Setup (fn 5)`,
          });
          continue;
        }
        const uncovered = c.days.filter(d => !blocks.some(b => b.startDate <= d && b.endDate >= d));
        if (uncovered.length) {
          failures.push({
            weekNo: c.weekNo, status: 400,
            reason: `availability does not cover ${uncovered.map(ymd).join(', ')} (fn 5)`,
          });
          continue;
        }

        const maint = maintenance.filter(m => m.startDate <= c.checkOut && m.endDate >= c.checkIn);
        if (maint.length) {
          failures.push({
            weekNo: c.weekNo, status: 409,
            reason: `unit is under maintenance that week (${maint.length} record(s)) - clear it in Resorts Unit Under Maintenance (fn 6)`,
          });
          continue;
        }

        const full = c.days.filter(d => fullSet.has(d.getTime()));
        if (full.length) {
          failures.push({
            weekNo: c.weekNo, status: 409,
            reason: `no ${apartmentType} availability left at ${resortCode} on ${full.map(ymd).join(', ')} `
                  + '- every unit of this type is already committed',
          });
        }
      }
    }

    // All-or-nothing: one bad week means nothing is written, so a half-applied year can
    // never be left behind (the fn 6 maintenance batch and the fn 5 MAR batch both work
    // this way).
    if (failures.length) {
      const status = failures.some(f => f.status === 400) ? 400 : 409;
      res.status(status).json({ error: failureMessage(failures), weeks: failures.map(f => f.weekNo) });
      return;
    }

    const result = await prisma.$transaction(async (tx) => {
      let clamped = false;

      if (deletes.length) {
        await tx.rciBulkBank.deleteMany({ where: { id: { in: deletes.map(d => d.id) } } });
        const days = deletes.flatMap(d => eachUtcDay(d.checkIn, d.checkOut));
        const back = await applyBankDelta(tx, resortCode, apartmentType, days, 1);
        clamped = clamped || back.clamped;
      }

      // A regrade is season-only, so it needs no grid work at all - reversing then
      // re-applying the same days nets to zero at 14 round-trips a week. Grouping by target
      // season turns any number of regrades into at most three statements.
      for (const season of SEASONS) {
        const ids = updates.filter(u => u.season === season).map(u => u.id);
        if (ids.length) {
          await tx.rciBulkBank.updateMany({ where: { id: { in: ids } }, data: { season, updatedAt: new Date() } });
        }
      }

      if (creates.length) {
        // serialNo continues the Informix sequence (max was 39261 at cutover). Allocated
        // inside the transaction; the unique index is the backstop against a concurrent add.
        const agg = await tx.rciBulkBank.aggregate({ _max: { serialNo: true } });
        let serialNo = agg._max.serialNo ?? 0;
        await tx.rciBulkBank.createMany({
          data: creates.map(c => ({
            id: randomUUID(), serialNo: ++serialNo, resortId: resort.id, resortCode, unitNo, apartmentType,
            checkIn: c.checkIn, checkOut: c.checkOut, weekYear, weekNo: c.weekNo, season: c.season,
            updatedAt: new Date(),
          })) as never,
        });
        const days = creates.flatMap(c => c.days);
        const taken = await applyBankDelta(tx, resortCode, apartmentType, days, -1);
        clamped = clamped || taken.clamped;
      }

      return { created: creates.length, updated: updates.length, deleted: deletes.length, clamped };
    }, { maxWait: 15_000, timeout: 120_000 });

    await writeAudit({
      userId: req.user.id,
      action: `Saved RCI bulk bank year: ${resortCode} ${unitNo} ${weekYear} `
            + `(${result.created} banked, ${result.updated} regraded, ${result.deleted} cleared)`,
      actionType: 'UPDATE',
      targetType: 'RciBulkBank',
      metadata: {
        resortCode, unitNo, weekYear, apartmentType,
        created: result.created, updated: result.updated, deleted: result.deleted, clamped: result.clamped,
        bankedWeeks: creates.map(c => c.weekNo),
        clearedWeeks: deletes.map(d => ymd(d.checkIn)),
      },
    });

    res.json({ data: { resortCode, unitNo, weekYear, ...result } });
  } catch (e: unknown) {
    if (e instanceof HttpError) { res.status(e.status).json({ error: e.message }); }
    else if ((e as { code?: string }).code === 'P2002') {
      const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? '');
      res.status(409).json({
        error: target.includes('serialNo')
          ? 'Serial number already in use - please retry'
          : 'This unit is already banked for one of those weeks.',
      });
    } else { throw e; }
  }
}

// Clear a unit's WHOLE year in one go - every banked week of that (resort, unit, year),
// with its ResAvailMast deduction given back. Provided for re-entry: correcting a badly
// keyed year through the grid means blanking up to 53 cells one at a time, and the
// bottom-up bin makes that deliberately slow.
//
// Unlike the year SAVE this is not a diff - it is unconditional, so it deletes weeks the
// save's guards would refuse to recreate (a week on a since-un-flagged unit, or one whose
// availability has lapsed). That is the point: it exists to get a unit back to a clean
// slate. It is also the only bulk path that can empty a clear-only unit.
export async function deleteRciBulkBankYear(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const unitNo = typeof req.query.unitNo === 'string' ? req.query.unitNo.trim() : '';
  const weekYear = parseInt(String(req.query.weekYear), 10);

  if (!resortCode || !unitNo) { res.status(400).json({ error: 'resortCode and unitNo are required' }); return; }
  if (!(weekYear >= MIN_YEAR && weekYear <= MAX_YEAR)) { res.status(400).json({ error: 'A valid year is required' }); return; }

  const calendar = await loadCalendar(weekYear);
  if (calendar.size === 0) { res.status(404).json({ error: `No RCI weeks found for ${weekYear}` }); return; }

  // Matched on checkIn, as everywhere else in this module
  const rows = await prisma.rciBulkBank.findMany({
    where: { resortCode, unitNo, checkIn: { in: [...calendar.values()] } },
    orderBy: { checkIn: 'asc' },
  });
  if (rows.length === 0) {
    res.status(404).json({ error: `Unit ${unitNo} has no banked weeks in ${weekYear}` });
    return;
  }

  // ---------------------------------------------------------------------------------
  // TODO (Resorts Reservation): REFUSE 409 when any week here has been taken in a
  // booking. A banked week that a guest has already exchanged into cannot simply be
  // withdrawn - deleting it would give back a unit-night that is physically occupied, and
  // the grid would then over-report availability for the rest of the year.
  //
  // This guard belongs HERE, before the transaction, and should name the booked weeks the
  // way the save's failures do. It is not written yet because the booking module does not
  // exist - there is no table to count. The sibling placeholder is `maintenanceWithin()`
  // in apt-blocks.controller.ts, which carries the same note for fn 5's delete.
  //
  // The per-week bin and the year save need the same guard once bookings exist: today a
  // booked week could equally be cleared one cell at a time. Add it to the year save's
  // `deletes` branch at the same time, not just here.
  // ---------------------------------------------------------------------------------

  const apartmentType = rows[0].apartmentType ?? (
    await prisma.resortUnit.findUnique({ where: { resortCode_unitNo: { resortCode, unitNo } } })
  )?.apartmentType ?? null;

  const result = await prisma.$transaction(async (tx) => {
    await tx.rciBulkBank.deleteMany({ where: { id: { in: rows.map(r => r.id) } } });
    let clamped = false;
    if (apartmentType) {
      const days = rows.flatMap(r => eachUtcDay(r.checkIn, r.checkOut));
      const back = await applyBankDelta(tx, resortCode, apartmentType, days, 1);
      clamped = back.clamped;
    }
    return { deleted: rows.length, clamped };
  }, { maxWait: 15_000, timeout: 120_000 });

  await writeAudit({
    userId: req.user.id,
    action: `Deleted RCI bulk bank year: ${resortCode} ${unitNo} ${weekYear} `
          + `(${result.deleted} week(s) cleared)`,
    actionType: 'DELETE',
    targetType: 'RciBulkBank',
    metadata: {
      resortCode, unitNo, weekYear, apartmentType,
      deleted: result.deleted, clamped: result.clamped,
      serialNos: rows.map(r => r.serialNo),
    },
  });

  res.json({ data: { resortCode, unitNo, weekYear, deleted: result.deleted, clamped: result.clamped } });
}
