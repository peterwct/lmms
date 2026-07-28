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
 *  [2]    pssa_year        -> year          (exported as a FLOAT string, e.g. "2000.0")
 *  [3]    pssa_effdate     -> effectiveDate (dd-mm-yyyy -> UTC midnight business date)
 *  [4]    pssa_season      -> season        (G=Gold, S=Silver, D=Diamond)
 *  [5-11] pssa_norpts0..6  -> ptsSun..ptsSat  (0 = Sunday ... 6 = Saturday)
 *
 * The day-of-week mapping is confirmed against the legacy screen: SLEEP6/S is
 * 29,29,29,29,29,51,51 and the screen shows "Total Points Per Week: 247"
 * (= 29 x 5 + 51 x 2). The weekly total is derived, never stored.
 *
 * Unique key: (resortCode, apartmentType, year, effectiveDate, season) — mirrors
 * Informix u925_83. effectiveDate is part of the key because a year may hold more
 * than one effective-dated revision of the same combo (2015/SLEEP4/G has two:
 * 01-04-2014 -> 22/38 and 02-04-2014 -> 28/48). Dropping it would lose a row.
 *
 * PRODUCT SCOPE: CP only. Season grades come from CpSeasonDate (fn 8); the
 * PublicHoliday / SchoolHoliday calendars are LHC-only and unrelated.
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

  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true } });
  const idByCode = new Map(resorts.map(r => [r.resortCode, r.id]));

  let total = 0, skipped = 0;
  const counts: Record<string, number> = { G: 0, S: 0, D: 0 };
  const batch: any[] = [];

  for await (const c of readLines('ps_seasonapt.txt')) {
    const resortCode = t(c[0]);
    const apartmentType = t(c[1]);
    if (!resortCode || !apartmentType) { skipped++; continue; }

    const resortId = idByCode.get(resortCode);
    if (!resortId) {
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
      resortId,
      resortCode,
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

  if (!DRY_RUN && batch.length) {
    await prisma.cpSeasonPoint.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`\n  OK CP season points: ${total} inserted, ${skipped} skipped`);
  console.log(`     Diamond ${counts.D}, Gold ${counts.G}, Silver ${counts.S}`);

  if (!DRY_RUN) {
    const count = await prisma.cpSeasonPoint.count();
    const agg = await prisma.cpSeasonPoint.aggregate({ _min: { year: true }, _max: { year: true } });
    console.log(`  DB count: ${count}`);
    if (agg._min.year && agg._max.year) {
      console.log(`  Years: ${agg._min.year} to ${agg._max.year}`);
    }
  }

  console.log('\nCP season points migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
