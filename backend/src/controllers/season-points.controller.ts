import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// Season Points (Resorts Setup fn 9) — ONE chart for the points deducted per night, by
// resort x apartment type x season x day of week, discriminated by pointsType:
//
//   HOME — the member's own product's resort (coCode '02', CP-PBR today). CpSeasonDate
//          (fn 8) grades the day G/S/D; this table turns that grade into a number.
//   AWAY — every other resort: our own LHC resorts and the partner/exchange V-* codes,
//          reached through an LVC exchange programme. This is the counterpart of HOME
//          and the reason pssa_lvcpts0..6 are zero in ps_seasonapt — the away points
//          lived in their own Informix table (ps_lvcapt).
//
// RESORT SCOPE: a resort is home or away by its coCode, never both. Every endpoint takes
// the kind the caller believes it is editing and rejects a mismatch, so a URL naming a
// CP resort on the away tab (or vice-versa) can't silently write to the wrong chart.
// It deliberately does NOT check status: an inactive resort's points stay readable and
// editable by URL (237 of the 264 away resorts are inactive) — the picker is what
// filters to active resorts.
//
// The screen edits a whole resort-year at a time. effectiveDate is part of the natural
// key, not a per-year stamp: a year may hold more than one effective-dated revision of
// the same (type, season) combo — the migrated HOME 2015/SLEEP4/G does.
//
// Dates are UTC-midnight business dates, parsed with Date.UTC, never `new Date(str)`.

const SEASONS = ['G', 'S', 'D'] as const;
const POINTS_TYPES = ['HOME', 'AWAY'] as const;
const CP_CO_CODE = '02';

type PointsType = (typeof POINTS_TYPES)[number];

const pointsType = z.enum(POINTS_TYPES);
const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD');
const pts = z.number().int().min(0).max(9999);

// Bulk save of one resort-year — this is both the "add a new year" and the
// "edit an existing year" path, since the screen edits a year at a time.
const saveYearSchema = z.object({
  pointsType,
  resortCode: z.string().trim().min(1).max(8),
  year:       z.number().int().min(1900).max(2999),
  // AWAY only: the product whose members these points are charged to. '02' on every
  // imported row; editable so a future non-CP exchange direction can be set up.
  // Ignored on HOME, which stores null.
  lvcCoCode:  z.string().trim().min(1).max(2).default(CP_CO_CODE),
  rows: z.array(z.object({
    apartmentType: z.string().trim().min(1).max(10),
    season:        z.enum(SEASONS),
    effectiveDate: dateStr,
    ptsSun: pts, ptsMon: pts, ptsTue: pts, ptsWed: pts, ptsThu: pts, ptsFri: pts, ptsSat: pts,
  })).min(1).max(120),
});

// Parse a YYYY-MM-DD string to a UTC-midnight Date (business-date convention)
function toUtcMidnight(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

type Resort = NonNullable<Awaited<ReturnType<typeof prisma.resort.findUnique>>>;
type ResortCheck =
  | { ok: true; resort: Resort }
  | { ok: false; error: string; status: number };

// A resort's kind is a fact about its product, never something the client asserts
const kindOf = (resort: Resort): PointsType => (resort.coCode === CP_CO_CODE ? 'HOME' : 'AWAY');

const label = (t: PointsType) => (t === 'HOME' ? 'home' : 'away');

// Load the resort and confirm it belongs on the chart the caller is editing.
// Replaces the old requireCpResort / requireLvcResort pair — the inversion is data now.
async function requireResortOfType(resortCode: string, expected: PointsType): Promise<ResortCheck> {
  const resort = await prisma.resort.findUnique({ where: { resortCode } });
  if (!resort) return { ok: false, error: 'Resort not found', status: 404 };

  const actual = kindOf(resort);
  if (actual !== expected) {
    return {
      ok: false,
      status: 400,
      error: expected === 'HOME'
        ? 'Home season points apply to CP resorts only — this is an exchange resort, priced on the Non-Home Resorts tab'
        : 'Non-home season points apply to exchange resorts only — a CP resort is a home resort, priced on the Home Resorts tab',
    };
  }
  return { ok: true, resort };
}

// lvcCoCode must name a real product. Kept as a lookup rather than a DB FK, matching
// how every other coCode column in this codebase is stored (see lvc-codes.controller).
async function productMissing(coCode: string): Promise<boolean> {
  const p = await prisma.product.findUnique({ where: { coCode } });
  return !p;
}

// A submitted apartment type is accepted when it is either set up for the resort in
// Apartment Types Setup (fn 3), or already in use by a stored SeasonPoint row.
//
// The grandfathering matters on AWAY: only 5 of the 412 (resort, type) pairs in the
// Informix source exist in ApartmentType — partner apartment types like SLEEPA /
// HOTEL UNIT are the partner's own nomenclature and were never registered in fn 3.
// Without this, 22 of the 27 populated pickable away resorts would be permanently
// read-only. It is applied to HOME too rather than keeping two rules: CP-PBR's
// SLEEP2/SLEEP4/SLEEP6 are all registered, so HOME behaves exactly as before.
// Genuinely NEW apartment types still have to go through fn 3.
async function allowedApartmentTypes(resortCode: string): Promise<Set<string>> {
  const [registered, inUse] = await Promise.all([
    prisma.apartmentType.findMany({ where: { resortCode }, select: { apartmentType: true } }),
    prisma.seasonPoint.findMany({
      where: { resortCode },
      select: { apartmentType: true },
      distinct: ['apartmentType'],
    }),
  ]);
  return new Set([...registered, ...inUse].map(r => r.apartmentType));
}

// One resort-year at a time, so this returns every row for that pair with NO
// pagination. The apartment types come along so the client can scaffold the full
// type x season grid in a single round trip; combos with no row yet aren't in `data`.
//
// `apartmentTypes` is the UNION of the resort's registered types and the types already
// stored here, each flagged `registered` — scaffolding from ApartmentType alone would
// render an empty grid for every partner resort.
export async function listSeasonPoints(req: Request, res: Response): Promise<void> {
  const parsedType = pointsType.safeParse(req.query.type);
  if (!parsedType.success) { res.status(400).json({ error: 'type must be HOME or AWAY' }); return; }
  const type = parsedType.data;

  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const year = parseInt(String(req.query.year), 10);
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }
  if (!(year >= 1900 && year <= 2999)) { res.status(400).json({ error: 'A valid year is required' }); return; }

  const check = await requireResortOfType(resortCode, type);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const [rows, registered, inUse] = await Promise.all([
    prisma.seasonPoint.findMany({
      where: { resortCode, year },
      orderBy: [{ apartmentType: 'asc' }, { season: 'asc' }, { effectiveDate: 'asc' }],
    }),
    prisma.apartmentType.findMany({
      where: { resortCode },
      select: { apartmentType: true, description: true },
      orderBy: { apartmentType: 'asc' },
    }),
    prisma.seasonPoint.findMany({
      where: { resortCode },
      select: { apartmentType: true },
      distinct: ['apartmentType'],
      orderBy: { apartmentType: 'asc' },
    }),
  ]);

  const registeredNames = new Set(registered.map(r => r.apartmentType));
  const apartmentTypes = [
    ...registered.map(r => ({ apartmentType: r.apartmentType, description: r.description, registered: true })),
    ...inUse
      .filter(r => !registeredNames.has(r.apartmentType))
      .map(r => ({ apartmentType: r.apartmentType, description: null, registered: false })),
  ].sort((a, b) => a.apartmentType.localeCompare(b.apartmentType));

  const { resortCode: rc, resortName, shortName, coCode } = check.resort;
  res.json({
    resortCode,
    year,
    pointsType: type,
    resort: { resortCode: rc, resortName, shortName, coCode },
    // The year's stored charged-to product, so the header select opens on the right
    // value. Meaningless for HOME, which stores null.
    lvcCoCode: type === 'AWAY' ? (rows[0]?.lvcCoCode ?? CP_CO_CODE) : null,
    apartmentTypes,
    data: rows,
  });
}

// Distinct years set up for a resort, newest first — feeds the Year quick-picker
export async function getSeasonPointYears(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }

  const rows = await prisma.seasonPoint.groupBy({
    by: ['year'],
    where: { resortCode },
    orderBy: { year: 'desc' },
  });
  res.json({ data: rows.map(r => r.year) });
}

// Save a whole resort-year in one go. The client omits rows left entirely blank,
// so opening an untouched year and saving cannot create zero-point rows.
export async function saveSeasonPointYear(req: Request, res: Response): Promise<void> {
  const parsed = saveYearSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const { pointsType: type, resortCode, year, rows } = parsed.data;

  const check = await requireResortOfType(resortCode, type);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const resort = check.resort;

  // Charged-to is an away-only concept; a home row stores null whatever the client sent
  const lvcCoCode = type === 'AWAY' ? parsed.data.lvcCoCode : null;
  if (lvcCoCode && await productMissing(lvcCoCode)) {
    res.status(400).json({ error: `Product ${lvcCoCode} does not exist` }); return;
  }

  // Every apartment type must be registered for this resort or already in use here
  const allowed = await allowedApartmentTypes(resortCode);
  for (const t of new Set(rows.map(r => r.apartmentType))) {
    if (!allowed.has(t)) {
      res.status(400).json({ error: `Apartment type ${t} is not set up for this resort` });
      return;
    }
  }

  const prepared = rows.map(r => ({ ...r, effectiveDate: toUtcMidnight(r.effectiveDate) }));

  // A stale form must not submit the same natural key twice — the upserts would
  // race within the transaction and the last write would silently win.
  const seen = new Set(prepared.map(r => `${r.apartmentType}|${r.season}|${r.effectiveDate.getTime()}`));
  if (seen.size !== prepared.length) {
    res.status(400).json({ error: 'The same apartment type, season and effective date appears more than once' });
    return;
  }

  const before = await prisma.seasonPoint.count({ where: { resortCode, year } });

  await prisma.$transaction(async (tx) => {
    for (const r of prepared) {
      const points = {
        ptsSun: r.ptsSun, ptsMon: r.ptsMon, ptsTue: r.ptsTue, ptsWed: r.ptsWed,
        ptsThu: r.ptsThu, ptsFri: r.ptsFri, ptsSat: r.ptsSat,
      };
      await tx.seasonPoint.upsert({
        where: {
          resortCode_apartmentType_year_effectiveDate_season: {
            resortCode, apartmentType: r.apartmentType, year, effectiveDate: r.effectiveDate, season: r.season,
          },
        },
        update: { ...points, lvcCoCode, updatedAt: new Date() },
        create: {
          id: randomUUID(),
          // Both the kind and the resort's own product come from Resort, never the payload
          pointsType: type,
          resortId: resort.id,
          resortCode,
          coCode: resort.coCode,
          lvcCoCode,
          apartmentType: r.apartmentType,
          year,
          effectiveDate: r.effectiveDate,
          season: r.season,
          ...points,
          updatedAt: new Date(),
        },
      });
    }
  }, { maxWait: 15_000, timeout: 120_000 });

  const after = await prisma.seasonPoint.count({ where: { resortCode, year } });
  const created = after - before;
  const result = { resortCode, year, rows: prepared.length, created, updated: prepared.length - created };

  await writeAudit({
    userId: req.user.id,
    action: `Saved ${label(type)} season points ${resortCode} ${year} (${prepared.length} rows)`,
    actionType: before > 0 ? 'UPDATE' : 'CREATE',
    targetType: 'SeasonPoint',
    metadata: { ...result, pointsType: type, lvcCoCode },
  });

  res.status(before > 0 ? 200 : 201).json({ data: result });
}

// Delete every row for a resort-year — the year-scoped counterpart of the save
export async function deleteSeasonPointYear(req: Request, res: Response): Promise<void> {
  const parsedType = pointsType.safeParse(req.query.type);
  if (!parsedType.success) { res.status(400).json({ error: 'type must be HOME or AWAY' }); return; }
  const type = parsedType.data;

  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const year = parseInt(String(req.query.year), 10);
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }
  if (!(year >= 1900 && year <= 2999)) { res.status(400).json({ error: 'A valid year is required' }); return; }

  // The old CP delete-year skipped this check while the LVC one ran it — closed in the merge
  const check = await requireResortOfType(resortCode, type);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const result = await prisma.seasonPoint.deleteMany({ where: { resortCode, year } });
  if (result.count === 0) { res.status(404).json({ error: `No season points found for ${resortCode} ${year}` }); return; }

  await writeAudit({
    userId: req.user.id,
    action: `Deleted ${label(type)} season points ${resortCode} ${year} (${result.count} rows)`,
    actionType: 'DELETE',
    targetType: 'SeasonPoint',
    metadata: { pointsType: type, resortCode, year, deleted: result.count },
  });

  res.json({ data: { resortCode, year, deleted: result.count } });
}

// Delete a single row. Needed to drop a superseded effective-dated revision
// (e.g. the migrated HOME 2015/SLEEP4/G duplicate) without wiping the whole year.
export async function deleteSeasonPoint(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const row = await prisma.seasonPoint.delete({ where: { id } });
    await writeAudit({
      userId: req.user.id,
      action: `Deleted ${label(row.pointsType as PointsType)} season points row: ${row.resortCode} ${row.apartmentType} ${row.year} ${row.season}`,
      actionType: 'DELETE',
      targetType: 'SeasonPoint',
    });
    res.json({ message: 'Season points row deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Season points row not found' }); }
    else { throw e; }
  }
}
