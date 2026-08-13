/**
 * LHB MMS — LVC Season Points Migration
 * Source: migrate/ps_lvcapt.txt — pipe-delimited Informix UNLOAD
 *
 * The points deducted from a CP member per night when they book a resort OTHER than
 * their home resort. Home = coCode '02' (CP-PBR); everything else — our own LHC
 * resorts and the partner/exchange V-* resorts — is an LVC booking priced from here.
 * This is the counterpart of migrate-cp-season-points.ts, and the reason
 * pssa_lvcpts0..6 are zero in ps_seasonapt: the LVC points live in their own table.
 *
 * The Informix ps_lvcapt table has 20 columns; only the first 14 are imported
 * (business decision). Columns 15-20 are the usual legacy audit/lock trailer
 * (user, date, blanks, lock_status) dropped everywhere else in this codebase.
 *
 *  [0]     resort code   -> resortCode    (264 distinct; all resolve against Resort)
 *  [1]     resort cocode -> coCode        (the resort's OWN product; constant per resort)
 *  [2]     apt type      -> apartmentType (SLEEP2/4/6, 1BR/2BR/3BR, HOTEL UNIT, SLEEPA-E)
 *  [3]     lvc cocode    -> lvcCoCode     ('02' on all 4,513 rows — the CP member charged)
 *  [4]     year          -> (collapse key only, NOT stored — see below)
 *  [5]     eff date      -> effectiveDate (dd-mm-yyyy -> UTC midnight business date)
 *  [6]     season        -> season        (G=Gold, S=Silver, D=Diamond)
 *  [7-13]  points 0..6   -> ptsSun..ptsSat  (0 = Sunday ... 6 = Saturday)
 *
 * The day-of-week mapping matches ps_seasonapt: SLEEP6/S is 29,29,29,29,29,51,51,
 * i.e. "Total Points Per Week: 247" (= 29 x 5 + 51 x 2). The total is derived, never stored.
 *
 * Unique key: (resortCode, effectiveDate, apartmentType, season).
 *
 * VERSIONS, NOT YEARS. SeasonPoint no longer stores a chart per calendar year — a chart is
 * an effective-dated version that stays in force until a newer one supersedes it. So only
 * the source's LATEST year per resort is imported (the chart in force), stamped with ONE
 * date: the latest effectiveDate among its rows. See collapseToLatestVersion() below.
 * V-LDBR is the clearest example of why: its SLEEP4 rows carry 2002-02-15 in every one of
 * its 17 years, and its SLEEP6 rows 2012-07-26 — per-room-type stamps, not per-year dates.
 *
 * Apartment type is NOT validated here — only 5 of the 412 (resort, type) pairs exist
 * in ApartmentType (a 9-row business-supplied seed covering our own resorts). Partner
 * apartment types are the partner's nomenclature. The CRUD validates new types against
 * ApartmentType and grandfathers pairs already stored here. Same as migrate-cp-season-points.ts,
 * which also validates only the resort FK.
 *
 * Does NOT truncate — the caller does (migrate-table.ps1 -Table LvcSeasonPoint,
 * refresh-test-db.ps1).
 *
 * Run: npx ts-node --transpile-only prisma/migrate-lvc-season-points.ts [--dry-run]
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

// 4,513 rows x 16 columns. Kept small on purpose: a large createMany becomes one
// INSERT with rows x cols bind parameters whose cached plan kills the PostgreSQL
// backend with SQLSTATE 53200 "out of memory in CachedPlan" partway through a run.
const BATCH = Number(process.env.MIGRATE_BATCH) || 100;

// The Informix source is per-year; SeasonPoint stores effective-dated VERSIONS. Keep only
// each resort's LATEST year — that is the chart in force, and under the version model it
// stays in force until the app creates a newer one — then stamp the whole kept set with
// ONE date per resort (the latest among its rows), because the source carries a separate
// "rate set on" stamp per apartment type while a version has a single effective date.
//
// This MUST run over the WHOLE file before any insert, which is why this script no longer
// flushes incrementally: under the (resortCode, effectiveDate, apartmentType, season) key,
// `skipDuplicates` would otherwise silently drop the surplus years instead of erroring.
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

const SEASONS = new Set(['G', 'S', 'D']);
const DEFAULT_LVC_CO_CODE = '02';

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
  console.log('LHB MMS — LVC Season Points Migration (ps_lvcapt.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log(`  Batch size: ${BATCH}`);
  console.log('='.repeat(60));

  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true } });
  const idByCode = new Map(resorts.map(r => [r.resortCode, r.id]));

  let total = 0, skipped = 0, inserted = 0;
  const counts: Record<string, number> = { G: 0, S: 0, D: 0 };
  const resortCodes = new Set<string>();
  // The whole file is staged before anything is written — the collapse to one version per
  // resort needs every row in hand, so this can no longer flush as it parses.
  const batch: any[] = [];

  for await (const c of readLines('ps_lvcapt.txt')) {
    const resortCode = t(c[0]);
    const apartmentType = t(c[2]);
    if (!resortCode || !apartmentType) { skipped++; continue; }

    const resortId = idByCode.get(resortCode);
    if (!resortId) {
      console.log(`  WARN unknown resort ${resortCode} — skipped ${apartmentType} ${c[4]}`);
      skipped++;
      continue;
    }

    // The year is a decimal(4,0) exported as "2000.0" — parseFloat, not parseInt
    const year = Math.round(parseFloat((c[4] ?? '').trim()));
    if (!Number.isFinite(year)) {
      console.log(`  WARN unparseable year "${c[4]}" for ${resortCode}/${apartmentType} — skipped`);
      skipped++;
      continue;
    }

    const effectiveDate = d(t(c[5]));
    if (!effectiveDate) {
      console.log(`  WARN unparseable effective date "${c[5]}" for ${resortCode}/${apartmentType}/${year} — skipped`);
      skipped++;
      continue;
    }

    const season = (t(c[6]) ?? '').toUpperCase();
    if (!SEASONS.has(season)) {
      console.log(`  WARN unknown season "${c[6]}" for ${resortCode}/${apartmentType}/${year} — skipped`);
      skipped++;
      continue;
    }

    batch.push({
      id:        randomUUID(),
      updatedAt: new Date(),
      // These rows are the AWAY chart: a resort other than the member's home
      pointsType: 'AWAY',
      resortId,
      resortCode,
      coCode:    t(c[1]) ?? '',
      apartmentType,
      lvcCoCode: t(c[3]) ?? DEFAULT_LVC_CO_CODE,
      year,
      effectiveDate,
      season,
      ptsSun: n(c[7]),
      ptsMon: n(c[8]),
      ptsTue: n(c[9]),
      ptsWed: n(c[10]),
      ptsThu: n(c[11]),
      ptsFri: n(c[12]),
      ptsSat: n(c[13]),
    });
    counts[season]++;
    resortCodes.add(resortCode);
    total++;
  }

  const rows = collapseToLatestVersion(batch);

  if (!DRY_RUN && rows.length) {
    // Chunked — a large createMany becomes one INSERT with rows x cols bind parameters
    // whose cached plan kills the PG backend with SQLSTATE 53200 (CachedPlan OOM).
    for (let i = 0; i < rows.length; i += BATCH) {
      const r = await prisma.seasonPoint.createMany({ data: rows.slice(i, i + BATCH), skipDuplicates: true });
      inserted += r.count;
    }
  }

  console.log(`\n  OK away season points: ${total} parsed, ${skipped} skipped`);
  console.log(`     ${rows.length} kept after collapsing to the latest version per resort`);
  console.log(`     Diamond ${counts.D}, Gold ${counts.G}, Silver ${counts.S} (source totals)`);
  console.log(`     Across ${resortCodes.size} resorts`);
  if (!DRY_RUN) console.log(`     ${inserted} inserted`);

  if (!DRY_RUN) {
    const count = await prisma.seasonPoint.count({ where: { pointsType: 'AWAY' } });
    const agg = await prisma.seasonPoint.aggregate({
      where: { pointsType: 'AWAY' }, _min: { effectiveDate: true }, _max: { effectiveDate: true },
    });
    console.log(`  DB count (AWAY): ${count}`);
    if (agg._min.effectiveDate && agg._max.effectiveDate) {
      console.log(`  Versions effective ${agg._min.effectiveDate.toISOString().slice(0, 10)} to ${agg._max.effectiveDate.toISOString().slice(0, 10)}`);
    }
  }

  console.log('\nLVC season points migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
