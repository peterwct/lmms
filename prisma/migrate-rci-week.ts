/**
 * LHB MMS - RCI Week Calendar Migration
 * Source: migrate/rci_week.txt  (pipe-delimited, 2,055 rows, no header)
 *
 * Loads Informix `rci_week` into the RciWeek table (RCI fn 2, Weekly Interval).
 *
 * The file is 8 columns + a trailing empty field, so NF=9:
 *  [0] rw_year         -> year
 *  [1] rw_week         -> weekNo
 *  [2] rw_fri_start    -> friStart   (always a Friday)
 *  [3] rw_fri_end      -> friEnd     (= friStart + 7)
 *  [4] rw_sat_start    -> satStart   (= friStart + 1)
 *  [5] rw_sat_end      -> satEnd     (= friEnd + 1)
 *  [6] rw_user_create      NOT migrated (business decision)
 *  [7] rw_date_create      NOT migrated (business decision)
 *
 * ONLY YEARS >= MIN_YEAR ARE IMPORTED (business decision). That is 209 of the 2,055
 * rows: 2026:52, 2027:53, 2028:52, 2029:52. It also happens to exclude every anomalous
 * row in the file - 24 rows with null dates, 213 whose Saturday pair has drifted off
 * Friday+1 (1994/2000/2005/2011), and a 2021 gap. Nothing at or after 2026 deviates.
 *
 * UNLOAD: UNLOAD TO 'rci_week.txt' DELIMITER '|' SELECT * FROM rci_week;
 *
 * Run: npx ts-node --transpile-only prisma/migrate-rci-week.ts
 *      npx ts-node --transpile-only prisma/migrate-rci-week.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma   = new PrismaClient();
const FILE     = path.join(__dirname, '..', 'migrate', 'rci_week.txt');
const BATCH    = Number(process.env.MIGRATE_BATCH) || 100;
const MIN_YEAR = 2026;
const DRY_RUN  = process.argv.includes('--dry-run');
const DAY_MS   = 86_400_000;

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

// Informix dates are dd-mm-yyyy; business dates are stored at UTC midnight.
const d = (s: string | undefined): Date | null => {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return isNaN(dt.getTime()) ? null : dt;
};

const int = (s: string | undefined): number | null => {
  const v = t(s);
  if (v === null) return null;
  const n = Math.round(parseFloat(v));
  return isNaN(n) ? null : n;
};

const iso = (dt: Date) => dt.toISOString().slice(0, 10);

// Same derivation the controller uses to GENERATE a year. Here it is only a check:
// rows import verbatim, and a mismatch is reported as a WARN rather than corrected,
// so a re-import can never disagree with Informix.
function firstFriday(year: number): Date {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  return new Date(jan1.getTime() + ((5 - jan1.getUTCDay() + 7) % 7) * DAY_MS);
}

function derive(year: number, weekNo: number) {
  const friStart = new Date(firstFriday(year).getTime() + (weekNo - 1) * 7 * DAY_MS);
  const friEnd   = new Date(friStart.getTime() + 7 * DAY_MS);
  return {
    friStart, friEnd,
    satStart: new Date(friStart.getTime() + DAY_MS),
    satEnd:   new Date(friEnd.getTime() + DAY_MS),
  };
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS - RCI Week Calendar Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log(`  Importing years >= ${MIN_YEAR}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(FILE)) {
    console.error(`\n  ERROR: ${FILE} not found.`);
    process.exit(1);
  }

  if (!DRY_RUN) {
    console.log('\n[1/3] Clearing RciWeek...');
    const del = await prisma.rciWeek.deleteMany({});
    console.log(`  ${del.count} existing rows removed`);
  } else {
    console.log('\n[1/3] (dry run - table not cleared)');
  }

  console.log('\n[2/3] Reading rci_week.txt...');
  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  let total = 0, loaded = 0, oldYear = 0, skipped = 0, deviated = 0;
  const perYear = new Map<number, number>();
  const seen = new Set<string>();
  const warns: string[] = [];
  let rows: any[] = [];

  async function flush() {
    if (!rows.length) return;
    if (!DRY_RUN) await prisma.rciWeek.createMany({ data: rows, skipDuplicates: true });
    loaded += rows.length;
    rows = [];
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = line.split('|');
    total++;

    const year   = int(c[0]);
    const weekNo = int(c[1]);
    if (year === null || weekNo === null) {
      skipped++;
      if (warns.length < 10) warns.push(`row ${total}: unparseable year/week`);
      continue;
    }
    if (year < MIN_YEAR) { oldYear++; continue; }

    const friStart = d(c[2]), friEnd = d(c[3]), satStart = d(c[4]), satEnd = d(c[5]);
    if (!friStart || !friEnd || !satStart || !satEnd) {
      skipped++;
      if (warns.length < 10) warns.push(`row ${total}: ${year} wk${weekNo} has a null date`);
      continue;
    }

    const key = `${year}:${weekNo}`;
    if (seen.has(key)) {
      skipped++;
      if (warns.length < 10) warns.push(`row ${total}: duplicate ${key}`);
      continue;
    }
    seen.add(key);

    const want = derive(year, weekNo);
    if (friStart.getTime() !== want.friStart.getTime() ||
        friEnd.getTime()   !== want.friEnd.getTime()   ||
        satStart.getTime() !== want.satStart.getTime() ||
        satEnd.getTime()   !== want.satEnd.getTime()) {
      deviated++;
      if (warns.length < 10) {
        warns.push(`row ${total}: ${year} wk${weekNo} deviates from the derived dates ` +
                   `(file ${iso(friStart)}..${iso(friEnd)}, derived ${iso(want.friStart)}..${iso(want.friEnd)}) - imported as-is`);
      }
    }

    perYear.set(year, (perYear.get(year) ?? 0) + 1);
    rows.push({
      id: randomUUID(),
      year, weekNo, friStart, friEnd, satStart, satEnd,
      updatedAt: new Date(),
    });

    if (rows.length >= BATCH) await flush();
  }

  await flush();

  console.log('\n[3/3] Summary');
  console.log(`  Total rows read     : ${total}`);
  console.log(`  Skipped (year < ${MIN_YEAR}): ${oldYear}`);
  console.log(`  Skipped (bad data)  : ${skipped}`);
  console.log(`  Loaded              : ${loaded}`);
  console.log(`  Deviating from rule : ${deviated}`);
  console.log('  Weeks per year      :');
  [...perYear.keys()].sort().forEach(y => console.log(`    ${y}: ${perYear.get(y)}`));
  if (warns.length) {
    console.log(`  WARN (first ${warns.length}):`);
    warns.forEach(w => console.log(`    - ${w}`));
  }
  console.log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
