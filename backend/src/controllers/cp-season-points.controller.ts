import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { writeAudit } from '../utils/audit';

// CP Season Points (Resorts Setup fn 9) — the points deducted per night for a CP
// booking, by resort x apartment type x season x day of week. CpSeasonDate (fn 8)
// grades the day G/S/D; this table turns that grade into a number.
//
// PRODUCT SCOPE: CP only. Every endpoint here rejects a resort whose coCode isn't
// '02' — the LHC holiday calendars are a separate, unrelated concept.
//
// The screen edits a whole year at a time (resort + year), like fn 8 edits a month.
// effectiveDate is part of the natural key, not a per-year stamp: a year may hold
// more than one effective-dated revision of the same (type, season) combo — the
// migrated 2015/SLEEP4/G does. Each grid row therefore carries its own date.
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
  rows: z.array(z.object({
    apartmentType: z.string().trim().min(1).max(10),
    season:        z.enum(SEASONS),
    effectiveDate: dateStr,
    ptsSun: pts, ptsMon: pts, ptsTue: pts, ptsWed: pts, ptsThu: pts, ptsFri: pts, ptsSat: pts,
  })).min(1).max(60),
});

// Parse a YYYY-MM-DD string to a UTC-midnight Date (business-date convention)
function toUtcMidnight(s: string): Date {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)!;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

const resortSelect = { select: { resortCode: true, resortName: true, shortName: true, coCode: true } };

// Season points are a CP concept — never let an LHC resort into this table.
// Returns { resort } on success, or { error, status } to respond with.
type Resort = NonNullable<Awaited<ReturnType<typeof prisma.resort.findUnique>>>;
type CpResortCheck =
  | { ok: true; resort: Resort }
  | { ok: false; error: string; status: number };

async function requireCpResort(resortCode: string): Promise<CpResortCheck> {
  const resort = await prisma.resort.findUnique({ where: { resortCode } });
  if (!resort) return { ok: false, error: 'Resort not found', status: 404 };
  if (resort.coCode !== CP_CO_CODE) {
    return { ok: false, error: 'Season points apply to CP resorts only', status: 400 };
  }
  return { ok: true, resort };
}

// The apartment type must be set up for that resort (natural-key check — no hard
// FK: apartment types are renamable/deletable via their own CRUD)
async function apartmentTypeExists(resortCode: string, apartmentType: string): Promise<boolean> {
  const at = await prisma.apartmentType.findUnique({
    where: { resortCode_apartmentType: { resortCode, apartmentType } },
  });
  return !!at;
}

// One resort-year at a time, so this returns every row for that pair with NO
// pagination. The resort's apartment types come along so the client can scaffold
// the full type x season grid in a single round trip; combos with no row yet
// simply aren't in `data`.
export async function listCpSeasonPoints(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const year = parseInt(String(req.query.year), 10);
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }
  if (!(year >= 1900 && year <= 2999)) { res.status(400).json({ error: 'A valid year is required' }); return; }

  const check = await requireCpResort(resortCode);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }

  const [rows, apartmentTypes] = await Promise.all([
    prisma.cpSeasonPoint.findMany({
      where: { resortCode, year },
      orderBy: [{ apartmentType: 'asc' }, { season: 'asc' }, { effectiveDate: 'asc' }],
    }),
    prisma.apartmentType.findMany({
      where: { resortCode },
      select: { apartmentType: true, description: true },
      orderBy: { apartmentType: 'asc' },
    }),
  ]);

  const { resortCode: rc, resortName, shortName, coCode } = check.resort;
  res.json({
    resortCode,
    year,
    resort: { resortCode: rc, resortName, shortName, coCode },
    apartmentTypes,
    data: rows,
  });
}

// Distinct years set up for a resort, newest first — feeds the Year quick-picker
export async function getCpSeasonPointYears(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }

  const rows = await prisma.cpSeasonPoint.groupBy({
    by: ['year'],
    where: { resortCode },
    orderBy: { year: 'desc' },
  });
  res.json({ data: rows.map(r => r.year) });
}

// Save a whole resort-year in one go. The client omits rows left entirely blank,
// so opening an untouched year and saving cannot create zero-point rows.
export async function saveCpSeasonPointYear(req: Request, res: Response): Promise<void> {
  const parsed = saveYearSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() }); return; }

  const { resortCode, year, rows } = parsed.data;

  const check = await requireCpResort(resortCode);
  if (!check.ok) { res.status(check.status).json({ error: check.error }); return; }
  const resort = check.resort;

  // Every apartment type must be set up for this resort
  const types = [...new Set(rows.map(r => r.apartmentType))];
  for (const type of types) {
    if (!(await apartmentTypeExists(resortCode, type))) {
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

  const before = await prisma.cpSeasonPoint.count({ where: { resortCode, year } });

  await prisma.$transaction(async (tx) => {
    for (const r of prepared) {
      const points = {
        ptsSun: r.ptsSun, ptsMon: r.ptsMon, ptsTue: r.ptsTue, ptsWed: r.ptsWed,
        ptsThu: r.ptsThu, ptsFri: r.ptsFri, ptsSat: r.ptsSat,
      };
      await tx.cpSeasonPoint.upsert({
        where: {
          resortCode_apartmentType_year_effectiveDate_season: {
            resortCode, apartmentType: r.apartmentType, year, effectiveDate: r.effectiveDate, season: r.season,
          },
        },
        update: { ...points, updatedAt: new Date() },
        create: {
          id: randomUUID(),
          resortId: resort.id,
          resortCode,
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

  const after = await prisma.cpSeasonPoint.count({ where: { resortCode, year } });
  const created = after - before;
  const result = { resortCode, year, rows: prepared.length, created, updated: prepared.length - created };

  await writeAudit({
    userId: req.user.id,
    action: `Saved CP season points ${resortCode} ${year} (${prepared.length} rows)`,
    actionType: before > 0 ? 'UPDATE' : 'CREATE',
    targetType: 'CpSeasonPoint',
    metadata: result,
  });

  res.status(before > 0 ? 200 : 201).json({ data: result });
}

// Delete every row for a resort-year — the year-scoped counterpart of the save
export async function deleteCpSeasonPointYear(req: Request, res: Response): Promise<void> {
  const resortCode = typeof req.query.resortCode === 'string' ? req.query.resortCode.trim() : '';
  const year = parseInt(String(req.query.year), 10);
  if (!resortCode) { res.status(400).json({ error: 'A resort code is required' }); return; }
  if (!(year >= 1900 && year <= 2999)) { res.status(400).json({ error: 'A valid year is required' }); return; }

  const result = await prisma.cpSeasonPoint.deleteMany({ where: { resortCode, year } });
  if (result.count === 0) { res.status(404).json({ error: `No season points found for ${resortCode} ${year}` }); return; }

  await writeAudit({
    userId: req.user.id,
    action: `Deleted CP season points ${resortCode} ${year} (${result.count} rows)`,
    actionType: 'DELETE',
    targetType: 'CpSeasonPoint',
    metadata: { resortCode, year, deleted: result.count },
  });

  res.json({ data: { resortCode, year, deleted: result.count } });
}

// Delete a single row. Needed to drop a superseded effective-dated revision
// (e.g. the migrated 2015/SLEEP4/G duplicate) without wiping the whole year.
export async function deleteCpSeasonPoint(req: Request, res: Response): Promise<void> {
  const id = req.params.id;
  try {
    const row = await prisma.cpSeasonPoint.delete({ where: { id } });
    await writeAudit({
      userId: req.user.id,
      action: `Deleted CP season points row: ${row.resortCode} ${row.apartmentType} ${row.year} ${row.season}`,
      actionType: 'DELETE',
      targetType: 'CpSeasonPoint',
    });
    res.json({ message: 'Season points row deleted' });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'P2025') { res.status(404).json({ error: 'Season points row not found' }); }
    else { throw e; }
  }
}
