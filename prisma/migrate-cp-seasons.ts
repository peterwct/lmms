/**
 * LHB MMS — CP Season Calendar Migration
 * Source: migrate/ps_seasondate.txt — pipe-delimited Informix UNLOAD
 *
 *  [0] ps_date    -> date   (dd-mm-yyyy -> UTC midnight business date)
 *  [1] ps_season  -> season (G=Gold, S=Silver, D=Diamond)
 *  (trailing empty field, so NF=3)
 *
 * One row per calendar day — the source is a full daily calendar, not ranges.
 * The 2026-01-01..2027-02-28 export is 424 rows, fully contiguous (no gaps).
 *
 * PRODUCT SCOPE: this calendar is read by CP booking only. PublicHoliday and
 * SchoolHoliday are LHC-only — the three are parallel, unrelated calendars.
 *
 * Does NOT truncate — the caller does (migrate-table.ps1 -Table CpSeasonDate,
 * refresh-test-db.ps1), matching migrate-resort-units.ts.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-cp-seasons.ts
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
  console.log('LHB MMS — CP Season Calendar Migration (ps_seasondate.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  let total = 0, skipped = 0;
  const counts: Record<string, number> = { G: 0, S: 0, D: 0 };
  const batch: any[] = [];

  for await (const c of readLines('ps_seasondate.txt')) {
    const date = d(t(c[0]));
    const season = (t(c[1]) ?? '').toUpperCase();

    if (!date) {
      console.log(`  WARN unparseable date "${c[0]}" — skipped`);
      skipped++;
      continue;
    }
    if (!SEASONS.has(season)) {
      console.log(`  WARN unknown season "${c[1]}" on ${c[0]} — skipped`);
      skipped++;
      continue;
    }

    batch.push({
      id:        randomUUID(),
      updatedAt: new Date(),
      date,
      season,
      year:      date.getUTCFullYear(),
    });
    counts[season]++;
    total++;
  }

  if (!DRY_RUN && batch.length) {
    await prisma.cpSeasonDate.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`\n  OK CP season dates: ${total} inserted, ${skipped} skipped`);
  console.log(`     Diamond ${counts.D}, Gold ${counts.G}, Silver ${counts.S}`);

  if (!DRY_RUN) {
    const count = await prisma.cpSeasonDate.count();
    const agg = await prisma.cpSeasonDate.aggregate({ _min: { date: true }, _max: { date: true } });
    console.log(`  DB count: ${count}`);
    if (agg._min.date && agg._max.date) {
      console.log(`  Range: ${agg._min.date.toISOString().slice(0, 10)} to ${agg._max.date.toISOString().slice(0, 10)}`);
    }
  }

  console.log('\nCP season calendar migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
