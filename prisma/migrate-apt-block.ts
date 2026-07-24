/**
 * LHB MMS — Apartment Availability Block Migration
 * Source: migrate/apt_block.txt — pipe-delimited Informix UNLOAD
 *
 * The block table is the input record for Units Availability Setup by Dates:
 * one row per (resort, unit, date-range). Only columns [0..4] are migrated
 * (create-user[5], create-date[6], 'new'[7], blank[8], lock_status[9] skipped):
 *  [0] resort_code -> resortCode
 *  [1] apt_code    -> unitNo (incl. compound lock-off codes like "3005/3006")
 *  [2] start_date  -> startDate (dd-mm-yyyy, UTC midnight)
 *  [3] end_date    -> endDate (dd-mm-yyyy, UTC midnight)
 *  [4] block_no    -> blockNo (per-unit running block number)
 *
 * apartmentType is derived from ResortUnit (resortCode + unitNo) where the unit
 * exists in the partial apt_mast export; left null otherwise (not needed for
 * migrated rows — the per-day grid is loaded directly from res_avail_mast.txt).
 *
 * Unique key: (resortCode, unitNo, startDate, endDate).
 *
 * Run: npx ts-node --transpile-only prisma/migrate-apt-block.ts
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

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

// Informix dd-mm-yyyy -> UTC-midnight Date (business-date convention)
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
  console.log('LHB MMS — Apartment Availability Block Migration (apt_block.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true } });
  const idByCode = new Map(resorts.map(r => [r.resortCode, r.id]));

  const units = await prisma.resortUnit.findMany({ select: { resortCode: true, unitNo: true, apartmentType: true } });
  const typeByKey = new Map(units.map(u => [`${u.resortCode}|${u.unitNo}`, u.apartmentType]));

  let total = 0, skipped = 0, noType = 0;
  const batch: any[] = [];

  for await (const c of readLines('apt_block.txt')) {
    const resortCode = t(c[0]);
    const unitNo = t(c[1]);
    const startDate = d(c[2]);
    const endDate = d(c[3]);
    const blk = parseInt((c[4] ?? '').trim(), 10);

    if (!resortCode || !unitNo || !startDate || !endDate) { skipped++; continue; }

    const resortId = idByCode.get(resortCode);
    if (!resortId) {
      console.log(`  WARN unknown resort ${resortCode} — skipped unit ${unitNo}`);
      skipped++;
      continue;
    }

    const apartmentType = typeByKey.get(`${resortCode}|${unitNo}`) ?? null;
    if (!apartmentType) noType++;

    batch.push({
      id:        randomUUID(),
      updatedAt: new Date(),
      resortId,
      resortCode,
      unitNo,
      apartmentType,
      startDate,
      endDate,
      blockNo:   Number.isNaN(blk) ? null : blk,
    });
    total++;
  }

  if (!DRY_RUN && batch.length) {
    await prisma.aptBlock.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`\n  OK Availability blocks: ${total} inserted, ${skipped} skipped`);
  console.log(`  (${noType} rows had no matching ResortUnit -> apartmentType left null)`);

  if (!DRY_RUN) {
    const count = await prisma.aptBlock.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nApartment block migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
