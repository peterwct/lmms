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
// VERSIONS, NOT YEARS: a chart is all rows sharing (resortCode, effectiveDate) and stays
// in force until a later version supersedes it. A new version is created only when a rate
// changes or a room type is introduced — never annually. There is ONE effective date per
// resort per version, so the screen edits a whole version at a time. The chart in force
// for a stay date D is the version with the greatest effectiveDate <= D.
//
// Dates are UTC-midnight business dates, parsed with Date.UTC, never `new Date(str)`.

const SEASONS = ['G', 'S', 'D'] as const;
const POINTS_TYPES = ['HOME', 'AWAY'] as const;
const CP_CO_CODE = '02';

type PointsType = (typeof POINTS_TYPES)[number];

const pointsType = z.enum(POINTS_TYPES);
const dateStr = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}/, 'Date must be YYYY-MM-DD');
const pts = z.number().int().min(0).max(9999);

// Bulk save of one version — both the "new version" and the "edit an existing version"
// path. effectiveDate sits on the envelope, not the rows: one date per resort per version.
// `replaces` names the version being edited, so its date can be corrected in place.
const saveVersionSchema = z.object({
  pointsType,
  resortCode:    z.string().trim().min(1).max(8),
  effectiveDate: dateStr,
  // The version currently stored under this date, when editing. Omitted when creating.
  replaces:      dateStr.optional(),
  // AWAY only: the product whose members these points are charged to. '02' on every
  // imported row; editable so a future non-CP exchange direction can be set up.
  // Ignored on HOME, which stores null.
  lvcCoCode:  z.string().trim().min(1).max(2).default(CP_CO_CODE),
  rows: z.array(z.object({
    apartmentType: z.string().trim().min(1).max(10),
    season:        z.enum(SEASONS),
    ptsSun: pts, ptsMon: pts, ptsTue: pts, ptsWed: pts, ptsThu: pts, ptsFri: pts, ptsSat: pts,
  })).min(1).max(120),
});

// Parse a YYYY-MM-DD string to a UTC-midnight Date (business-date convention)
function toUtcMidnight(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

// Today as a UTC-midnight business date, so it compares against stored effectiveDates
// without the server's +08 offset pushing it a day either way.
function utcToday(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
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

// One version at a time, so this returns every row of it with NO pagination. The
// apartment types come along so the client can scaffold the full type x season grid in a
// single round trip; combos with no row yet aren't in `data`.
//
// `apartmentTypes` is the UNION of the resort's registered types and the types already
// stored here, each flagged `registered` — scaffolding from ApartmentType alone would
// render an empty grid for every partner resort.
//
// effectiveDate is optional: omitted, it returns the version in force TODAY (the greatest
// effectiveDate <= now), which is what the editor opens on by default.
export async function listSeasonPoints(req: Request, res: Response): Promise<void> {
  const parsedType = pointsType.safeParse(req.query.type);
  if (!parsedType.success) { res.status(400).json({ error: 'type must be HOME or AWAY' }); return; }
  const type = parsedType.data;

  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }

  const effParam = typeof req.query.effectiveDate === 'string' ? req.query.effectiveDate.trim() : '';
  if (effParam && !/^\d{4}-\d{2}-\d{2}/.test(effParam)) {
    res.status(400).json({ error: 'effectiveDate must be YYYY-MM-DD' }); return;
  }

  const check = await requireResortOfType(resortCode, type);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  // No date given -> the version in force today; none in force yet -> the earliest one
  let effectiveDate: Date | null = effParam ? toUtcMidnight(effParam) : null;
  if (!effectiveDate) {
    const inForce =
      (await prisma.seasonPoint.findFirst({
        where: { resortCode, effectiveDate: { lte: utcToday() } },
        orderBy: { effectiveDate: 'desc' },
        select: { effectiveDate: true },
      })) ??
      (await prisma.seasonPoint.findFirst({
        where: { resortCode },
        orderBy: { effectiveDate: 'asc' },
        select: { effectiveDate: true },
      }));
    effectiveDate = inForce?.effectiveDate ?? null;
  }

  const [rows, registered, inUse] = await Promise.all([
    effectiveDate
      ? prisma.seasonPoint.findMany({
          where: { resortCode, effectiveDate },
          orderBy: [{ apartmentType: 'asc' }, { season: 'asc' }],
        })
      : Promise.resolve([]),
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
    effectiveDate,
    pointsType: type,
    resort: { resortCode: rc, resortName, shortName, coCode },
    // The version's stored charged-to product, so the header select opens on the right
    // value. Meaningless for HOME, which stores null.
    lvcCoCode: type === 'AWAY' ? (rows[0]?.lvcCoCode ?? CP_CO_CODE) : null,
    apartmentTypes,
    data: rows,
  });
}

// Every version set up for a resort, newest first — this is the landing view. `isCurrent`
// marks the one in force today (greatest effectiveDate <= today); a version dated ahead of
// today is Scheduled, and the ones before the current are Superseded.
export async function getSeasonPointVersions(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }

  const rows = await prisma.seasonPoint.findMany({
    where: { resortCode },
    select: { effectiveDate: true, apartmentType: true, season: true, lvcCoCode: true },
  });

  type Version = {
    effectiveDate: Date;
    rows: number;
    apartmentTypes: Set<string>;
    seasons: Set<string>;
    lvcCoCode: string | null;
  };
  const byDate = new Map<number, Version>();
  for (const r of rows) {
    const k = r.effectiveDate.getTime();
    let v = byDate.get(k);
    if (!v) {
      v = {
        effectiveDate: r.effectiveDate, rows: 0,
        apartmentTypes: new Set(), seasons: new Set(), lvcCoCode: r.lvcCoCode,
      };
      byDate.set(k, v);
    }
    v.rows += 1;
    v.apartmentTypes.add(r.apartmentType);
    v.seasons.add(r.season);
  }

  const today = utcToday().getTime();
  const past = [...byDate.values()].filter(v => v.effectiveDate.getTime() <= today);
  const currentKey = past.length ? Math.max(...past.map(v => v.effectiveDate.getTime())) : null;

  const data = [...byDate.values()]
    .sort((a, b) => b.effectiveDate.getTime() - a.effectiveDate.getTime())
    .map(v => ({
      effectiveDate: v.effectiveDate,
      rows: v.rows,
      apartmentTypes: v.apartmentTypes.size,
      seasons: v.seasons.size,
      lvcCoCode: v.lvcCoCode,
      isCurrent: v.effectiveDate.getTime() === currentKey,
    }));

  res.json({ data });
}

// Save a whole version in one go — REPLACE-ALL within the version, the same shape as
// PUT /api/resorts/:id/info. Rows dropped from the payload are deleted, so clearing a
// retired room type is just blanking its cells. The client omits rows left entirely
// blank, so opening an untouched grid and saving cannot create zero-point rows.
export async function saveSeasonPointVersion(req: Request, res: Response): Promise<void> {
  const parsed = saveVersionSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const { pointsType: type, resortCode, rows } = parsed.data;
  const effectiveDate = toUtcMidnight(parsed.data.effectiveDate);
  const replaces = parsed.data.replaces ? toUtcMidnight(parsed.data.replaces) : null;

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

  // One date per version means the natural key reduces to (apartmentType, season), so a
  // stale form must not submit that pair twice.
  const seen = new Set(rows.map(r => `${r.apartmentType}|${r.season}`));
  if (seen.size !== rows.length) {
    res.status(400).json({ error: 'The same apartment type and season appears more than once' });
    return;
  }

  // Landing on a date another version already occupies would silently merge two charts
  const movingDate = !replaces || replaces.getTime() !== effectiveDate.getTime();
  if (movingDate) {
    const clash = await prisma.seasonPoint.findFirst({ where: { resortCode, effectiveDate } });
    if (clash) {
      res.status(409).json({
        error: `${resortCode} already has a rate effective ${parsed.data.effectiveDate}. Edit that rate, or pick another date.`,
      });
      return;
    }
  }

  // A NEW rate must start AFTER the resort's latest existing one — versions supersede in
  // date order, so backdating one behind the current rate would make it dead on arrival.
  // Editing an existing rate is exempt: an older superseded rate must stay correctable,
  // and the clash guard above already stops two rates sharing a date.
  if (!replaces) {
    const latest = await prisma.seasonPoint.aggregate({
      where: { resortCode }, _max: { effectiveDate: true },
    });
    const latestEff = latest._max.effectiveDate;
    if (latestEff && effectiveDate <= latestEff) {
      res.status(400).json({
        error: `${resortCode} already has a rate effective ${latestEff.toISOString().slice(0, 10)}. A new rate must take effect after that date.`,
      });
      return;
    }
  }

  const target = replaces ?? effectiveDate;
  const before = await prisma.seasonPoint.count({ where: { resortCode, effectiveDate: target } });

  await prisma.$transaction(async (tx) => {
    // Replace-all: drop the version being edited (at its OLD date when it is being moved),
    // then write the payload at the new date.
    await tx.seasonPoint.deleteMany({ where: { resortCode, effectiveDate: target } });
    await tx.seasonPoint.createMany({
      data: rows.map(r => ({
        id: randomUUID(),
        // Both the kind and the resort's own product come from Resort, never the payload
        pointsType: type,
        resortId: resort.id,
        resortCode,
        coCode: resort.coCode,
        lvcCoCode,
        apartmentType: r.apartmentType,
        effectiveDate,
        season: r.season,
        ptsSun: r.ptsSun, ptsMon: r.ptsMon, ptsTue: r.ptsTue, ptsWed: r.ptsWed,
        ptsThu: r.ptsThu, ptsFri: r.ptsFri, ptsSat: r.ptsSat,
        updatedAt: new Date(),
      })),
    });
  }, { maxWait: 15_000, timeout: 120_000 });

  const result = {
    resortCode,
    effectiveDate: parsed.data.effectiveDate,
    rows: rows.length,
    replaced: before,
  };

  await writeAudit({
    userId: req.user.id,
    action: `Saved ${label(type)} season points ${resortCode} effective ${parsed.data.effectiveDate} (${rows.length} rows)`,
    actionType: before > 0 ? 'UPDATE' : 'CREATE',
    targetType: 'SeasonPoint',
    metadata: {
      ...result,
      pointsType: type,
      lvcCoCode,
      movedFrom: replaces && movingDate ? parsed.data.replaces : undefined,
    },
  });

  res.status(before > 0 ? 200 : 201).json({ data: result });
}

// Delete a whole version. There is no per-row delete: a version is edited as a unit, and
// dropping one (type, season) is done by blanking its cells and re-saving.
export async function deleteSeasonPointVersion(req: Request, res: Response): Promise<void> {
  const parsedType = pointsType.safeParse(req.query.type);
  if (!parsedType.success) { res.status(400).json({ error: 'type must be HOME or AWAY' }); return; }
  const type = parsedType.data;

  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const effParam = typeof req.query.effectiveDate === 'string' ? req.query.effectiveDate.trim() : '';
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }
  if (!/^\d{4}-\d{2}-\d{2}/.test(effParam)) { res.status(400).json({ error: 'effectiveDate must be YYYY-MM-DD' }); return; }

  const check = await requireResortOfType(resortCode, type);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const effectiveDate = toUtcMidnight(effParam);
  const result = await prisma.seasonPoint.deleteMany({ where: { resortCode, effectiveDate } });
  if (result.count === 0) {
    res.status(404).json({ error: `No season points found for ${resortCode} effective ${effParam}` });
    return;
  }

  await writeAudit({
    userId: req.user.id,
    action: `Deleted ${label(type)} season points ${resortCode} effective ${effParam} (${result.count} rows)`,
    actionType: 'DELETE',
    targetType: 'SeasonPoint',
    metadata: { pointsType: type, resortCode, effectiveDate: effParam, deleted: result.count },
  });

  res.json({ data: { resortCode, effectiveDate: effParam, deleted: result.count } });
}
