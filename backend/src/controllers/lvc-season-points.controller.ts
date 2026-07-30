import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// LVC Season Points — "CP Points Deduction for Non-Home Resorts" (Resorts Setup fn 11,
// swapped with the LVC Code screen on 2026-07-30) — the points charged to a CP member per
// night when they book a resort OTHER than their home resort. A home resort is
// coCode '02' (CP-PBR); everything else — our own LHC resorts and the partner /
// exchange V-* resorts — is an LVC booking priced from this chart. It is the
// counterpart of CpSeasonPoint (fn 10), and the reason pssa_lvcpts0..6 are zero in
// ps_seasonapt: the LVC points live in their own table.
//
// RESORT SCOPE: every endpoint rejects a coCode '02' resort — those are priced by
// CP Resorts Season Points Setup instead.
//
// The screen edits a whole resort-year at a time, like fn 10. effectiveDate is part
// of the natural key, not a per-year stamp: a year may hold more than one
// effective-dated revision of the same (type, season) combo.
//
// Dates are UTC-midnight business dates, parsed with Date.UTC, never `new Date(str)`.

const SEASONS = ['G', 'S', 'D'] as const;
const CP_CO_CODE = '02';

const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD');
const pts = z.number().int().min(0).max(9999);

// Bulk save of one resort-year — this is both the "add a new year" and the
// "edit an existing year" path, since the screen edits a year at a time.
const saveYearSchema = z.object({
  resortCode: z.string().trim().min(1).max(8),
  year:       z.number().int().min(1900).max(2999),
  // The product whose members these points are charged to. '02' on every imported
  // row; editable so a future non-CP exchange direction can be set up.
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

// LVC points price a booking AWAY from home, so a CP-02 resort is out of scope here.
// Deliberately does NOT check status: an inactive resort's points stay readable and
// editable by URL (237 of the 264 imported resorts are inactive) — the picker is what
// filters to active resorts, matching fn 10.
type Resort = NonNullable<Awaited<ReturnType<typeof prisma.resort.findUnique>>>;
type LvcResortCheck =
  | { ok: true; resort: Resort }
  | { ok: false; error: string; status: number };

async function requireLvcResort(resortCode: string): Promise<LvcResortCheck> {
  const resort = await prisma.resort.findUnique({ where: { resortCode } });
  if (!resort) return { ok: false, error: 'Resort not found', status: 404 };
  if (resort.coCode === CP_CO_CODE) {
    return {
      ok: false,
      status: 400,
      error: 'LVC season points apply to exchange resorts only — a CP resort is a home resort, priced by CP Resorts Season Points Setup',
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
// Apartment Types Setup (fn 3), or already in use by a stored LvcSeasonPoint row.
//
// The grandfathering matters: only 5 of the 412 (resort, type) pairs in the Informix
// source exist in ApartmentType — partner apartment types like SLEEPA / HOTEL UNIT are
// the partner's own nomenclature and were never registered in fn 3. Without this,
// 22 of the 27 populated pickable resorts would be permanently read-only. Genuinely
// NEW apartment types still have to go through fn 3.
async function allowedApartmentTypes(resortCode: string): Promise<Set<string>> {
  const [registered, inUse] = await Promise.all([
    prisma.apartmentType.findMany({ where: { resortCode }, select: { apartmentType: true } }),
    prisma.lvcSeasonPoint.findMany({
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
export async function listLvcSeasonPoints(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const year = parseInt(String(req.query.year), 10);
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }
  if (!(year >= 1900 && year <= 2999)) { res.status(400).json({ error: 'A valid year is required' }); return; }

  const check = await requireLvcResort(resortCode);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const [rows, registered, inUse] = await Promise.all([
    prisma.lvcSeasonPoint.findMany({
      where: { resortCode, year },
      orderBy: [{ apartmentType: 'asc' }, { season: 'asc' }, { effectiveDate: 'asc' }],
    }),
    prisma.apartmentType.findMany({
      where: { resortCode },
      select: { apartmentType: true, description: true },
      orderBy: { apartmentType: 'asc' },
    }),
    prisma.lvcSeasonPoint.findMany({
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
    resort: { resortCode: rc, resortName, shortName, coCode },
    // The year's stored charged-to product, so the header select opens on the right value
    lvcCoCode: rows[0]?.lvcCoCode ?? CP_CO_CODE,
    apartmentTypes,
    data: rows,
  });
}

// Distinct years set up for a resort, newest first — feeds the Year quick-picker
export async function getLvcSeasonPointYears(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }

  const rows = await prisma.lvcSeasonPoint.groupBy({
    by: ['year'],
    where: { resortCode },
    orderBy: { year: 'desc' },
  });
  res.json({ data: rows.map(r => r.year) });
}

// Save a whole resort-year in one go. The client omits rows left entirely blank,
// so opening an untouched year and saving cannot create zero-point rows.
export async function saveLvcSeasonPointYear(req: Request, res: Response): Promise<void> {
  const parsed = saveYearSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const { resortCode, year, lvcCoCode, rows } = parsed.data;

  const check = await requireLvcResort(resortCode);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const resort = check.resort;

  if (await productMissing(lvcCoCode)) {
    res.status(400).json({ error: `Product ${lvcCoCode} does not exist` }); return;
  }

  // Every apartment type must be registered for this resort or already in use here
  const allowed = await allowedApartmentTypes(resortCode);
  for (const type of new Set(rows.map(r => r.apartmentType))) {
    if (!allowed.has(type)) {
      res.status(400).json({ error: `Apartment type ${type} is not set up for this resort` });
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

  const before = await prisma.lvcSeasonPoint.count({ where: { resortCode, year } });

  await prisma.$transaction(async (tx) => {
    for (const r of prepared) {
      const points = {
        ptsSun: r.ptsSun, ptsMon: r.ptsMon, ptsTue: r.ptsTue, ptsWed: r.ptsWed,
        ptsThu: r.ptsThu, ptsFri: r.ptsFri, ptsSat: r.ptsSat,
      };
      await tx.lvcSeasonPoint.upsert({
        where: {
          resortCode_apartmentType_year_effectiveDate_season: {
            resortCode, apartmentType: r.apartmentType, year, effectiveDate: r.effectiveDate, season: r.season,
          },
        },
        update: { ...points, lvcCoCode, updatedAt: new Date() },
        create: {
          id: randomUUID(),
          resortId: resort.id,
          resortCode,
          // The resort's own product is denormalized from Resort, never taken from the payload
          coCode: resort.coCode,
          apartmentType: r.apartmentType,
          lvcCoCode,
          year,
          effectiveDate: r.effectiveDate,
          season: r.season,
          ...points,
          updatedAt: new Date(),
        },
      });
    }
  }, { maxWait: 15_000, timeout: 120_000 });

  const after = await prisma.lvcSeasonPoint.count({ where: { resortCode, year } });
  const created = after - before;
  const result = { resortCode, year, rows: prepared.length, created, updated: prepared.length - created };

  await writeAudit({
    userId: req.user.id,
    action: `Saved LVC season points ${resortCode} ${year} (${prepared.length} rows)`,
    actionType: before > 0 ? 'UPDATE' : 'CREATE',
    targetType: 'LvcSeasonPoint',
    metadata: { ...result, lvcCoCode },
  });

  res.status(before > 0 ? 200 : 201).json({ data: result });
}

// Delete every row for a resort-year — the year-scoped counterpart of the save
export async function deleteLvcSeasonPointYear(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const year = parseInt(String(req.query.year), 10);
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }
  if (!(year >= 1900 && year <= 2999)) { res.status(400).json({ error: 'A valid year is required' }); return; }

  const check = await requireLvcResort(resortCode);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const result = await prisma.lvcSeasonPoint.deleteMany({ where: { resortCode, year } });
  if (result.count === 0) { res.status(404).json({ error: `No LVC season points found for ${resortCode} ${year}` }); return; }

  await writeAudit({
    userId: req.user.id,
    action: `Deleted LVC season points ${resortCode} ${year} (${result.count} rows)`,
    actionType: 'DELETE',
    targetType: 'LvcSeasonPoint',
    metadata: { resortCode, year, deleted: result.count },
  });

  res.json({ data: { resortCode, year, deleted: result.count } });
}

// Delete a single row. Needed to drop a superseded effective-dated revision without
// wiping the whole year.
export async function deleteLvcSeasonPoint(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const row = await prisma.lvcSeasonPoint.delete({ where: { id } });
    await writeAudit({
      userId: req.user.id,
      action: `Deleted LVC season points row: ${row.resortCode} ${row.apartmentType} ${row.year} ${row.season}`,
      actionType: 'DELETE',
      targetType: 'LvcSeasonPoint',
    });
    res.json({ message: 'LVC season points row deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'LVC season points row not found' }); }
    else { throw e; }
  }
}
