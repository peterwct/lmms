/**
 * LHB MMS — CP Season Calendar Migration
 * Source: migrate/ps_seasondate.txt — pipe-delimited Informix UNLOAD
 *
 * TWO LAYOUTS EXIST — the column offset is DETECTED from the first data row.
 *
 *   Full table (since the 2026-08-27 export), NF=9:
 *     [0] ps_cocode  (always '02' — not stored, the ps_ prefix already marks it CP)
 *     [1] ps_date    -> date   (dd-mm-yyyy -> UTC midnight business date)
 *     [2] ps_season  -> season (G=Gold, S=Silver, D=Diamond)
 *     [3..7] user/date audit + lock_status trailer — NOT migrated
 *
 *   Old 2-column export, NF=3:
 *     [0] ps_date, [1] ps_season
 *
 * Detection is by value, not field count: whichever of [0]/[1] parses as a
 * dd-mm-yyyy date is the date column. Without this the full-table export
 * silently skips EVERY row (cocode '02' fails the date parse) — which is
 * exactly what happened on the 2026-08-27 refresh, leaving CpSeasonDate empty.
 *
 * One row per calendar day — the source is a full daily calendar, not ranges.
 * The 2026-01-01..2027-02-28 export is 424 rows, fully contiguous (no gaps).
 *
 * PRODUCT SCOPE: this calendar is read by CP booking only. The Holiday calendar
 * (public + school) is LHC-only — the two are parallel, unrelated calendars.
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

  // Column offset: 0 for the old 2-col export, 1 for the full table (leading cocode).
  let off: number | null = null;

  for await (const c of readLines('ps_seasondate.txt')) {
    if (off === null) {
      off = d(t(c[0])) ? 0 : d(t(c[1])) ? 1 : -1;
      if (off === -1) {
        throw new Error(
          `Cannot locate the date column in ps_seasondate.txt — neither ` +
          `"${c[0]}" nor "${c[1]}" parses as dd-mm-yyyy. First row: ${c.join('|')}`
        );
      }
      console.log(
        `  Layout: ${off === 1 ? 'full table (NF=9, leading cocode)' : 'old 2-column export'} ` +
        `— date at [${off}], season at [${off + 1}]`
      );
    }

    const date = d(t(c[off]));
    const season = (t(c[off + 1]) ?? '').toUpperCase();

    if (!date) {
      console.log(`  WARN unparseable date "${c[off]}" — skipped`);
      skipped++;
      continue;
    }
    if (!SEASONS.has(season)) {
      console.log(`  WARN unknown season "${c[off + 1]}" on ${c[off]} — skipped`);
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
