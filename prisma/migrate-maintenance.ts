/**
 * LHB MMS — Resorts Maintenance Migration
 * Source: migrate/resmt.txt — pipe-delimited Informix UNLOAD of table `resmt`
 *
 * A maintenance record withdraws one apartment unit from the booking pool over a
 * date range (housekeeping, buffer, upgrading, repairs). Only columns [0..5] are
 * migrated (rm_user_name[6], rm_sys_date[7], rm_lock_status[8] skipped —
 * lock_status is 'U' on every one of the 13,396 source rows):
 *  [0] rm_serial_no   -> serialNo
 *  [1] rm_resort_code -> resortCode
 *  [2] rm_apt_code    -> unitNo (incl. compound lock-off codes like "3231/3232")
 *  [3] rm_checkin     -> startDate (dd-mm-yyyy, UTC midnight)
 *  [4] rm_checkout    -> endDate   (dd-mm-yyyy, UTC midnight)
 *  [5] rm_remarks     -> remarks (BUFFER / HOUSEKEEPING / UPGRADING / ...)
 *
 * apartmentType is derived from ResortUnit (resortCode + unitNo) where the unit
 * exists in the partial apt_mast export; left null otherwise. This script must
 * therefore run AFTER migrate-resort-units.ts.
 *
 * Rows for resorts absent from the Resort table (retired codes L-10020, L-10027,
 * L-10013, ...) are skipped — the FK cannot be satisfied.
 *
 * *** THIS SCRIPT DOES NOT TOUCH ResAvailMast. ***
 * res_avail_mast.txt was exported from Informix with maintenance ALREADY deducted
 * from ram_bal_night (verified: L-10016/2BR/2026-07-27 -> act 20, 4 maintenance
 * units, bal 16). Applying grid deltas here would double-count. Grid deltas happen
 * only on app CRUD, in backend/src/controllers/resort-maintenance.controller.ts.
 *
 * Unique key: (resortCode, unitNo, startDate) — Informix index rm_idx1.
 * Expected: 7,327 inserted / 6,069 skipped (unknown resort) / 291 with null type.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-maintenance.ts
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
  console.log('LHB MMS — Resorts Maintenance Migration (resmt.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true } });
  const idByCode = new Map(resorts.map(r => [r.resortCode, r.id]));

  const units = await prisma.resortUnit.findMany({ select: { resortCode: true, unitNo: true, apartmentType: true } });
  const typeByKey = new Map(units.map(u => [`${u.resortCode}|${u.unitNo}`, u.apartmentType]));

  let total = 0, skipped = 0, badRow = 0, noType = 0;
  const unknownResorts = new Map<string, number>();
  const batch: any[] = [];

  for await (const c of readLines('resmt.txt')) {
    const serial     = parseInt((c[0] ?? '').trim(), 10);
    const resortCode = t(c[1]);
    const unitNo     = t(c[2]);
    const startDate  = d(c[3]);
    const endDate    = d(c[4]);
    const remarks    = t(c[5]);

    if (!resortCode || !unitNo || !startDate || !endDate) { badRow++; continue; }

    const resortId = idByCode.get(resortCode);
    if (!resortId) {
      unknownResorts.set(resortCode, (unknownResorts.get(resortCode) ?? 0) + 1);
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
      remarks,
      serialNo:  Number.isNaN(serial) ? null : serial,
    });
    total++;
  }

  if (!DRY_RUN && batch.length) {
    await prisma.resortMaintenance.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`\n  OK Maintenance records: ${total} inserted, ${skipped} skipped (unknown resort)`);
  if (badRow) console.log(`  ${badRow} rows skipped (missing resort/unit/date)`);
  if (unknownResorts.size) {
    const list = [...unknownResorts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([code, n]) => `${code}(${n})`)
      .join(', ');
    console.log(`  WARN resorts not in the Resort table: ${list}`);
  }
  console.log(`  (${noType} rows had no matching ResortUnit -> apartmentType left null)`);
  console.log('  NOTE: ResAvailMast untouched — the imported grid already has maintenance deducted.');

  if (!DRY_RUN) {
    const count = await prisma.resortMaintenance.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nResorts maintenance migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
