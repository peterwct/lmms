/**
 * LHB MMS — CP Season Points Migration
 * Source: migrate/ps_seasonapt.txt — pipe-delimited Informix UNLOAD
 *
 * The Informix ps_seasonapt table has 24 columns; only the first 12 are imported
 * (business decision). Columns 13-19 (pssa_lvcpts0..6) are ZERO on all 253 rows,
 * and 20-24 are legacy audit/lock columns dropped everywhere else in this codebase.
 *
 *  [0]    pssa_resort_code -> resortCode    (CP-PBR on every row)
 *  [1]    pssa_apt_type    -> apartmentType (SLEEP2 / SLEEP4 / SLEEP6)
 *  [2]    pssa_year        -> (collapse key only, NOT stored — see below)
 *  [3]    pssa_effdate     -> effectiveDate (dd-mm-yyyy -> UTC midnight business date)
 *  [4]    pssa_season      -> season        (G=Gold, S=Silver, D=Diamond)
 *  [5-11] pssa_norpts0..6  -> ptsSun..ptsSat  (0 = Sunday ... 6 = Saturday)
 *
 * The day-of-week mapping is confirmed against the legacy screen: SLEEP6/S is
 * 29,29,29,29,29,51,51 and the screen shows "Total Points Per Week: 247"
 * (= 29 x 5 + 51 x 2). The weekly total is derived, never stored.
 *
 * Unique key: (resortCode, effectiveDate, apartmentType, season).
 *
 * VERSIONS, NOT YEARS. SeasonPoint no longer stores a chart per calendar year — a chart is
 * an effective-dated version that stays in force until a newer one supersedes it. So only
 * the source's LATEST year per resort is imported (the chart in force), stamped with ONE
 * date: the latest effectiveDate among its rows. See collapseToLatestVersion() below.
 *
 * The source's year dimension was near-pure duplication — 1,062 resort-years across both
 * files held only 303 chronologically distinct charts, and its effectiveDate was really a
 * per-apartment-type "rate set on" stamp, constant across years in 226 of 265 resorts.
 *
 * PRODUCT SCOPE: CP only. Season grades come from CpSeasonDate (fn 8); the
 * The Holiday calendar (public + school) is LHC-only and unrelated.
 *
 * Does NOT truncate — the caller does (migrate-table.ps1 -Table CpSeasonPoint,
 * refresh-test-db.ps1), matching migrate-cp-seasons.ts / migrate-resort-units.ts.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-cp-season-points.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const MIGRATE_DIR = path.join(__dirname, '..', 'migrate');
const DELIM = '|';
const DRY_RUN = process.argv.includes('--dry-run');

const SEASONS = new Set(['G', 'S', 'D']);

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

// Informix dates are dd-mm-yyyy; store as UTC midnight (business-date convention)
function d(s: string | null): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
}

// Points columns are plain smallints; a blank/garbage cell counts as zero
const n = (s: string | undefined): number => {
  const v = parseInt((s ?? '').trim(), 10);
  return Number.isNaN(v) ? 0 : v;
};

const BATCH = Number(process.env.MIGRATE_BATCH) || 100;

// The Informix source is per-year; SeasonPoint stores effective-dated VERSIONS. Keep only
// each resort's LATEST year — that is the chart in force, and under the version model it
// stays in force until the app creates a newer one — then stamp the whole kept set with
// ONE date per resort (the latest among its rows), because the source carries a separate
// "rate set on" stamp per apartment type while a version has a single effective date.
//
// The two importers keep their own copy: they read different files with different column
// layouts, which is genuine difference, not duplicated logic.
type Staged = { resortCode: string; year: number; effectiveDate: Date };

function collapseToLatestVersion<T extends Staged>(staged: T[]): any[] {
  const maxYear = new Map<string, number>();
  for (const r of staged) {
    const cur = maxYear.get(r.resortCode);
    if (cur === undefined || r.year > cur) maxYear.set(r.resortCode, r.year);
  }
  const kept = staged.filter(r => r.year === maxYear.get(r.resortCode));

  const versionDate = new Map<string, Date>();
  for (const r of kept) {
    const cur = versionDate.get(r.resortCode);
    if (!cur || r.effectiveDate > cur) versionDate.set(r.resortCode, r.effectiveDate);
  }

  return kept.map(row => {
    const { year, ...rest } = row;
    return { ...rest, effectiveDate: versionDate.get(row.resortCode)! };
  });
}

async function* readLines(filename: string): AsyncGenerator<string[]> {
  const fp = path.join(MIGRATE_DIR, filename);
  if (!fs.existsSync(fp)) throw new Error(`File not found: ${fp}`);
  const rl = readline.createInterface({
    input: fs.createReadStream(fp, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield line.split(DELIM);
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — CP Season Points Migration (ps_seasonapt.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  // SeasonPoint denormalizes the resort's own product, so carry coCode too
  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true, coCode: true } });
  const byCode = new Map(resorts.map(r => [r.resortCode, r]));

  let total = 0, skipped = 0;
  const counts: Record<string, number> = { G: 0, S: 0, D: 0 };
  const batch: any[] = [];

  for await (const c of readLines('ps_seasonapt.txt')) {
    const resortCode = t(c[0]);
    const apartmentType = t(c[1]);
    if (!resortCode || !apartmentType) { skipped++; continue; }

    const resortRow = byCode.get(resortCode);
    if (!resortRow) {
      console.log(`  WARN unknown resort ${resortCode} — skipped ${apartmentType} ${c[2]}`);
      skipped++;
      continue;
    }

    // pssa_year is a decimal(4,0) exported as "2000.0" — parseFloat, not parseInt
    const year = Math.round(parseFloat((c[2] ?? '').trim()));
    if (!Number.isFinite(year)) {
      console.log(`  WARN unparseable year "${c[2]}" for ${resortCode}/${apartmentType} — skipped`);
      skipped++;
      continue;
    }

    const effectiveDate = d(t(c[3]));
    if (!effectiveDate) {
      console.log(`  WARN unparseable effective date "${c[3]}" for ${resortCode}/${apartmentType}/${year} — skipped`);
      skipped++;
      continue;
    }

    const season = (t(c[4]) ?? '').toUpperCase();
    if (!SEASONS.has(season)) {
      console.log(`  WARN unknown season "${c[4]}" for ${resortCode}/${apartmentType}/${year} — skipped`);
      skipped++;
      continue;
    }

    batch.push({
      id:        randomUUID(),
      updatedAt: new Date(),
      // These rows are the HOME chart: the member's own product's resort
      pointsType: 'HOME',
      resortId:  resortRow.id,
      resortCode,
      coCode:    resortRow.coCode,
      lvcCoCode: null,
      apartmentType,
      year,
      effectiveDate,
      season,
      ptsSun: n(c[5]),
      ptsMon: n(c[6]),
      ptsTue: n(c[7]),
      ptsWed: n(c[8]),
      ptsThu: n(c[9]),
      ptsFri: n(c[10]),
      ptsSat: n(c[11]),
    });
    counts[season]++;
    total++;
  }

  // SeasonPoint stores effective-dated VERSIONS, not per-year charts, so only the source's
  // latest year survives: it is the chart in force, and it stays in force until a newer
  // version is created in the app. The whole year's rows are then stamped with one date —
  // the latest among them — because a version has ONE effective date, while the source
  // carries a separate "rate set on" stamp per apartment type.
  //
  // This MUST happen before createMany: under the (resortCode, effectiveDate,
  // apartmentType, season) key, `skipDuplicates` would otherwise silently drop the
  // surplus years instead of erroring.
  const rows = collapseToLatestVersion(batch);

  if (!DRY_RUN && rows.length) {
    // Chunked like migrate-lvc-season-points.ts — a large createMany becomes one INSERT
    // with rows x columns bind params and can kill the PG backend with SQLSTATE 53200
    // ("out of memory in CachedPlan"). 253 rows is safe unbatched, but one convention wins.
    for (let i = 0; i < rows.length; i += BATCH) {
      await prisma.seasonPoint.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
    }
  }

  console.log(`\n  OK CP season points: ${rows.length} inserted, ${skipped} skipped`);
  console.log(`     (${total} source rows collapsed to the latest version per resort)`);
  console.log(`     Diamond ${counts.D}, Gold ${counts.G}, Silver ${counts.S} (source totals)`);

  if (!DRY_RUN) {
    const count = await prisma.seasonPoint.count({ where: { pointsType: 'HOME' } });
    const agg = await prisma.seasonPoint.aggregate({
      where: { pointsType: 'HOME' }, _min: { effectiveDate: true }, _max: { effectiveDate: true },
    });
    console.log(`  DB count (HOME): ${count}`);
    if (agg._min.effectiveDate && agg._max.effectiveDate) {
      console.log(`  Versions effective ${agg._min.effectiveDate.toISOString().slice(0, 10)} to ${agg._max.effectiveDate.toISOString().slice(0, 10)}`);
    }
  }

  console.log('\nCP season points migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
