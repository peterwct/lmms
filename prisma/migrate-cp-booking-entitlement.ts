/**
 * LHB MMS — CP Booking Entitlement Migration (Points-based, coCode 02)
 * Source: migrate/ps_bookent1.txt — pipe-delimited, ~279,062 rows.
 *   One row per (agreement, membership-year). Records the point BALANCE remaining
 *   per anniversary year (psb_balpts), unlike LHC which records nights USED.
 *
 * Column mapping (0-indexed) — verified against migrate/ps_bookent1.sql:
 *  [0]  psb_cocode      -> coCode        (always '02')
 *  [1]  psb_memno       -> membershipNo  (e.g. 'M00020/I' — matches Agreement.membershipNo)
 *  [2]  psb_agmtno      -> agreementNo   (e.g. 'P00020'   — matches Agreement.agreementNo)
 *  [3]  psb_useyear     -> useYear       (dd-mm-yyyy anniversary date of the membership year)
 *  [4]  psb_totalpts    -> totalPts      (annual point entitlement, e.g. 288)
 *  [5]  psb_curusepts   -> curUsePts     (current-year points used)
 *  [6]  psb_advusepts   -> advUsePts     (advance points used)
 *  [7]  psb_acrusepts   -> acrusePts     (accrued points used)
 *  [8]  psb_balpts      -> balPts        (balance points remaining — the value the card displays)
 *
 * ALL rows are imported (a fully-unused future year balPts=288 is exactly what the card
 * shows; the terminal '...|0|0|0|0|0' row is displayed as the expiry-year 0 balance).
 * agreementId is left null — the read path (getAgreement) uses the natural key
 * coCode + membershipNo + agreementNo, per the FK-vs-natural-key rule in CLAUDE.md.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-cp-booking-entitlement.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const MIGRATE_DIR = path.join(__dirname, '..', 'migrate');
const DELIM = '|';
// 1000 and 500 both blew the server's "CachedPlan" memory context (SQLSTATE 53200)
// on the stock-config test server — this is the largest table in the migration
// (279k rows), so it accumulates the most before hitting the ceiling.
// See the BATCH comment in migrate-informix.ts.
const BATCH = Number(process.env.MIGRATE_BATCH) || 100;
const DRY_RUN = process.argv.includes('--dry-run');

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

const n = (s: string | undefined): number => {
  const v = parseInt((s ?? '').trim(), 10);
  return Number.isFinite(v) ? v : 0;
};

// Informix dates are dd-mm-yyyy
const d = (s: string | undefined): Date | null => {
  const str = (s ?? '').trim();
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const dt = new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return isNaN(dt.getTime()) ? null : dt;
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
  console.log('LHB MMS — CP Booking Entitlement Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  let fileRows = 0, entRows = 0, skipped = 0;
  const batch: any[] = [];

  const flush = async () => {
    if (DRY_RUN || !batch.length) return;
    await prisma.cpBookingEntitlement.createMany({ data: batch, skipDuplicates: true });
    batch.length = 0;
  };

  for await (const c of readLines('ps_bookent1.txt')) {
    fileRows++;
    const coCode = t(c[0]);
    const membershipNo = t(c[1]);
    const agreementNo = t(c[2]);
    const useYear = d(c[3]);
    if (!coCode || !membershipNo || !agreementNo || !useYear) { skipped++; continue; }

    batch.push({
      id: randomUUID(),
      updatedAt: new Date(),
      agreementId: null,
      coCode,
      membershipNo,
      agreementNo,
      useYear,
      totalPts: n(c[4]),
      curUsePts: n(c[5]),
      advUsePts: n(c[6]),
      acrusePts: n(c[7]),
      balPts: n(c[8]),
    });
    entRows++;
    if (batch.length >= BATCH) await flush();
    if (entRows % 20000 === 0) process.stdout.write(`\r  ${entRows} rows...`);
  }
  await flush();

  console.log(`\n  File rows read:  ${fileRows}`);
  console.log(`  Skipped (bad):   ${skipped}`);
  console.log(`  Rows staged:     ${entRows} ${DRY_RUN ? '(not written)' : 'inserted'}`);

  if (!DRY_RUN) {
    const count = await prisma.cpBookingEntitlement.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nCP booking entitlement migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
