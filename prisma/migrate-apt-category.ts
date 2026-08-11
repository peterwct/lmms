/**
 * LHB MMS — Apartment Sleep Type Migration
 * Source: migrate/apt_category.txt — pipe-delimited Informix UNLOAD (partial export)
 *
 * Resorts Setup fn 3 (Apartment Sleep Types Maintenance and Setup).
 *
 * The Informix apt_category table has 11 columns; the export deliberately carries
 * only 4 (business decision — the per-type check-in/out times and the audit/lock
 * trailer are skipped, as everywhere else in this codebase):
 *  [0] aptc_resort_code -> resortCode
 *  [1] aptc_type        -> apartmentType (e.g. SLEEP6, 2BR, "HOTEL UNIT")
 *  [2] aptc_remark      -> description
 *  [3] aptc_lock_type   -> lockType (LM=Master Unit, LS=Split Unit, LN=Normal Unit)
 *
 * NOT migrated: aptc_timein, aptc_timeout (per-type check-in/out times — the
 * resort-level checkInTime/checkOutTime on Resort cover this today), plus
 * aptc_user_name, aptc_sys_date, aptc_mod_user, aptc_mod_date, aptc_lock_status.
 *
 * Unique key: (resortCode, apartmentType) — mirrors Informix `aptc_idx1`.
 *
 * SUPERSEDES the 9 business-supplied rows that used to be hardcoded as
 * APARTMENT_TYPES in migrate-resorts.ts (2026-07-23). All 9 are reproduced
 * verbatim by this file, which also covers the other 311 resorts.
 *
 * Rows are imported VERBATIM. 3 rows (V-SS SLEEP2/4/6) carry LM/LS even though
 * V-SS has lockOnOff='N' — a legacy inconsistency (V-SS duplicates L-105, which
 * does have lockOnOff='Y'). They are loaded as-is and reported as a WARN rather
 * than coerced, so a re-import cannot disagree with Informix. The CRUD screen
 * still refuses to SET LM/LS on such a resort.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-apt-category.ts
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
// keep createMany batches small — see "CachedPlan out-of-memory" in CLAUDE.md
const BATCH = Number(process.env.MIGRATE_BATCH) || 100;

const LOCK_TYPES = new Set(['LM', 'LS', 'LN']);

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
  console.log('LHB MMS — Apartment Sleep Type Migration (apt_category.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  const resorts = await prisma.resort.findMany({
    select: { id: true, resortCode: true, lockOnOff: true },
  });
  const byCode = new Map(resorts.map(r => [r.resortCode, r]));

  let total = 0, skipped = 0;
  const unknownResorts = new Set<string>();
  const lockMismatch: string[] = [];
  const batch: any[] = [];

  for await (const c of readLines('apt_category.txt')) {
    const resortCode    = t(c[0]);
    const apartmentType = t(c[1]);
    if (!resortCode || !apartmentType) { skipped++; continue; }

    const resort = byCode.get(resortCode);
    if (!resort) {
      unknownResorts.add(resortCode);
      skipped++;
      continue;
    }

    let lockType = (t(c[3]) ?? 'LN').toUpperCase();
    if (!LOCK_TYPES.has(lockType)) {
      console.log(`  WARN unknown lock type "${lockType}" on ${resortCode} ${apartmentType} — stored as LN`);
      lockType = 'LN';
    }
    // Imported verbatim; only reported. See header note on V-SS.
    if (lockType !== 'LN' && resort.lockOnOff !== 'Y') {
      lockMismatch.push(`${resortCode} ${apartmentType} (${lockType})`);
    }

    batch.push({
      id:            randomUUID(),
      updatedAt:     new Date(),
      resortId:      resort.id,
      resortCode,
      apartmentType,
      description:   t(c[2]),
      lockType,
    });
    total++;
  }

  if (!DRY_RUN) {
    for (let i = 0; i < batch.length; i += BATCH) {
      await prisma.apartmentType.createMany({
        data: batch.slice(i, i + BATCH),
        skipDuplicates: true,
      });
    }
  }

  console.log(`\n  OK Apartment types: ${total} parsed, ${skipped} skipped`);
  if (unknownResorts.size) {
    console.log(`  WARN ${unknownResorts.size} unknown resort code(s) — rows skipped: ` +
                `${[...unknownResorts].sort().join(', ')}`);
  }
  if (lockMismatch.length) {
    console.log(`  WARN ${lockMismatch.length} row(s) carry LM/LS on a resort whose lockOnOff is not 'Y'`);
    console.log(`       (imported verbatim, not coerced): ${lockMismatch.join(', ')}`);
  }

  if (!DRY_RUN) {
    const count = await prisma.apartmentType.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nApartment sleep type migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
