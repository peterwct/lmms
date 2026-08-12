/**
 * LHB MMS — Resort Unit (Apartments/Units) Migration
 * Sources: migrate/apt_mast.txt         — pipe-delimited Informix UNLOAD (partial export)
 *          migrate/apt_mast_active.txt  — OPTIONAL second export, same layout
 *
 * The Informix apt_mast table has 15 columns, but the export deliberately
 * carries only 5 (business decision — dates/audit/lock_status skipped):
 *  [0] apt_code         -> unitNo (e.g. "3227/3228" lock-off pair, "1.12A")
 *  [1] apt_resort_code  -> resortCode
 *  [2] apt_rci_reserved -> rciReserved (Y/N)
 *  [3] apt_unit_type    -> apartmentType (matches ApartmentType.apartmentType)
 *  [4] apt_occupancy    -> occupancy
 *
 * TWO SOURCE FILES, ONE LAYOUT
 *  apt_mast.txt (required) is produced by migrate/apt_mast_unload.sql, which
 *  pins an explicit unit whitelist for the four resorts whose registers were
 *  trimmed to the live inventory (L-10024 Greenhill, L-10025 Golden City,
 *  L-10026 Leisure Cove, CP-PBR Perdana Beach) and exports the rest in full.
 *
 *  apt_mast_active.txt (optional) is produced by migrate/apt_mast_active_unload.sql,
 *  which sweeps in every OTHER resort that is Active in resort_mast, so no active
 *  resort can end up without its units. It is skipped with a note when absent, so
 *  a migrate run never depends on it.
 *
 *  The two overlap by design. Rows are de-duplicated in memory on
 *  (resortCode, unitNo) — first file wins — before the createMany, which also
 *  carries skipDuplicates for rows already in the table.
 *
 * Unique key: (resortCode, unitNo) — apt_code is NOT globally unique
 * (codes 1-21 repeat across L-10024 / L-10025 / L-101).
 *
 * Run: npx ts-node --transpile-only prisma/migrate-resort-units.ts
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

// Same column layout in both; apt_mast_active.txt is optional.
const SOURCES: { file: string; required: boolean }[] = [
  { file: 'apt_mast.txt',        required: true  },
  { file: 'apt_mast_active.txt', required: false },
];

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

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
  console.log('LHB MMS — Resort Unit Migration (apt_mast.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true } });
  const idByCode = new Map(resorts.map(r => [r.resortCode, r.id]));

  let total = 0, skipped = 0, dupes = 0;
  const batch: any[] = [];
  const seen = new Set<string>();

  for (const src of SOURCES) {
    if (!fs.existsSync(path.join(MIGRATE_DIR, src.file))) {
      if (src.required) throw new Error(`File not found: ${path.join(MIGRATE_DIR, src.file)}`);
      console.log(`\n  ${src.file}: not present — skipped (optional)`);
      continue;
    }

    let read = 0, taken = 0;
    for await (const c of readLines(src.file)) {
      read++;
      const unitNo = t(c[0]);
      const resortCode = t(c[1]);
      if (!unitNo || !resortCode) { skipped++; continue; }

      const resortId = idByCode.get(resortCode);
      if (!resortId) {
        console.log(`  WARN unknown resort ${resortCode} — skipped unit ${unitNo}`);
        skipped++;
        continue;
      }

      // (resortCode, unitNo) is the unique key — the two exports overlap on purpose.
      const key = `${resortCode}\u0000${unitNo}`;
      if (seen.has(key)) { dupes++; continue; }
      seen.add(key);

      const occ = parseInt((c[4] ?? '').trim(), 10);
      batch.push({
        id:            randomUUID(),
        updatedAt:     new Date(),
        resortId,
        resortCode,
        unitNo,
        rciReserved:   t(c[2]) ?? 'N',
        apartmentType: t(c[3]) ?? '',
        occupancy:     Number.isNaN(occ) ? null : occ,
      });
      taken++;
      total++;
    }
    console.log(`\n  ${src.file}: ${read} rows read, ${taken} new`);
  }

  if (!DRY_RUN && batch.length) {
    await prisma.resortUnit.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`\n  OK Resort units: ${total} inserted, ${skipped} skipped, ${dupes} duplicate`);

  if (!DRY_RUN) {
    const count = await prisma.resortUnit.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nResort unit migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
