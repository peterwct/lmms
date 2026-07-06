/**
 * LHB MMS — Booking Entitlement Migration
 * Source: migrate/booking_ent1.txt — pipe-delimited, 24,835 rows, 207 fields/row
 *   (206 real + 1 trailing empty). Records nights already USED per agreement year.
 *
 * Column mapping (0-indexed):
 *  [0]        coCode        -> only '03' / '15' (LHC) are imported; '02'/'12' skipped
 *  [1]        membershipNo  -> e.g. '00002-KL-Y-0001/M/I'
 *  [2]        agreementNo   -> e.g. '00457'
 *  [3..52]    be_year1..50  -> nightsUsed per year (total nights used; max observed 10)
 *  [53..102]  block 2       -> other category, IGNORED
 *  [103..152] block 3       -> other category, IGNORED
 *  [153..202] be_wk1..50    -> weekendUsed per year (0/1)
 *  [203..205] trailer totals-> IGNORED
 *
 * Emits one BookingEntitlement row per (agreement, yearSeq) where nightsUsed>0 OR
 * weekendUsed>0 (zero-usage years are omitted; the app treats a missing year as 0 used).
 * yearSeq N (1..50) => calendar year = agreementDate.getFullYear() + N - 1.
 * agreementId resolved by natural key coCode + membershipNo + agreementNo.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-booking-entitlement.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const MIGRATE_DIR = path.join(__dirname, '..', 'migrate');
const DELIM = '|';
const BATCH = 500;
const YEARS = 50;
const YEAR_BASE = 3;   // be_year1 = c[3]
const WK_BASE = 153;   // be_wk1   = c[153]
const DRY_RUN = process.argv.includes('--dry-run');

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

const n = (s: string | undefined): number => {
  const v = parseInt((s ?? '').trim(), 10);
  return Number.isFinite(v) ? v : 0;
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
  console.log('LHB MMS — Booking Entitlement Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  // Build natural-key -> agreementId map (coCode:membershipNo:agreementNo)
  console.log('  Loading agreements...');
  const agmtMap = new Map<string, string>();
  let offset = 0;
  while (true) {
    const rows = await prisma.agreement.findMany({
      select: { id: true, coCode: true, membershipNo: true, agreementNo: true },
      skip: offset, take: 5000,
    });
    if (!rows.length) break;
    rows.forEach(r => agmtMap.set(`${r.coCode}:${r.membershipNo}:${r.agreementNo}`, r.id));
    offset += rows.length;
  }
  console.log(`  Loaded ${agmtMap.size} agreements.`);

  let fileRows = 0, agmts = 0, entRows = 0, skippedCo = 0, skippedNoMatch = 0;
  const batch: any[] = [];

  const flush = async () => {
    if (DRY_RUN || !batch.length) return;
    await prisma.bookingEntitlement.createMany({ data: batch, skipDuplicates: true });
    batch.length = 0;
  };

  for await (const c of readLines('booking_ent1.txt')) {
    fileRows++;
    const coCode = t(c[0]);
    if (coCode !== '03' && coCode !== '15') { skippedCo++; continue; }

    const membershipNo = t(c[1]);
    const agreementNo = t(c[2]);
    if (!membershipNo || !agreementNo) { skippedNoMatch++; continue; }

    const agreementId = agmtMap.get(`${coCode}:${membershipNo}:${agreementNo}`);
    if (!agreementId) { skippedNoMatch++; continue; }
    agmts++;

    for (let N = 1; N <= YEARS; N++) {
      const nightsUsed = n(c[YEAR_BASE + N - 1]);
      const weekendUsed = n(c[WK_BASE + N - 1]);
      if (nightsUsed === 0 && weekendUsed === 0) continue;
      batch.push({
        id: randomUUID(),
        updatedAt: new Date(),
        agreementId,
        coCode,
        agreementNo,
        membershipNo,
        yearSeq: N,
        nightsUsed,
        weekendUsed,
      });
      entRows++;
      if (batch.length >= BATCH) await flush();
    }

    if (agmts % 1000 === 0) process.stdout.write(`\r  matched ${agmts} agreements, ${entRows} year-rows...`);
  }
  await flush();

  console.log(`\n  File rows read:        ${fileRows}`);
  console.log(`  Skipped (not 03/15):   ${skippedCo}`);
  console.log(`  Skipped (no match):    ${skippedNoMatch}`);
  console.log(`  Agreements matched:    ${agmts}`);
  console.log(`  Entitlement rows:      ${entRows} ${DRY_RUN ? '(not written)' : 'inserted'}`);

  if (!DRY_RUN) {
    const count = await prisma.bookingEntitlement.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nBooking entitlement migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
