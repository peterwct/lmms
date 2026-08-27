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
 * RCI-RESERVED SET IS BUSINESS-SUPPLIED FOR THE RESORTS IT NAMES.
 * apt_rci_reserved in the source is stale — nearly every unit at our own resorts exported
 * as 'Y'. RCI_RESERVED below overrides it for the resorts listed there: at those resorts a
 * unit is 'Y' only if it is named, and every other unit is forced to 'N'. Resorts ABSENT
 * from the map keep whatever the source says — today that is the V-* partner resorts only,
 * since the map covers all six resorts on our own products (02/03).
 *
 * Deliberately RECONCILING, not insert-only: the flag is applied to fresh inserts AND
 * swept over the whole table afterwards, so the set holds whether the caller truncated
 * first (migrate-table.ps1 -Table ResortUnit / -Table Resort, refresh-test-db.ps1) or the
 * script is re-run additively. A re-run therefore RESETS any rciReserved change made
 * through Apartments/Units Setup (fn 4) at those four resorts -- that is the intent.
 *
 * To change the set, edit RCI_RESERVED and re-run -- do not tick the box in fn 4 and
 * expect it to survive the next refresh.
 *
 * Existing RciBulkBank history is NOT affected: rciReserved='Y' is a SAVE-TIME rule, so
 * migrate-rci-bulk-bank.ts imports a banked week on an un-flagged unit verbatim with a
 * WARN. Un-flagging a unit only stops NEW weeks being banked against it.
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

/**
 * Units that are RCI-reserved, per resort. Business decision, 2026-08-27.
 * A resort listed here has its whole register forced to 'N' except the units named;
 * an empty array means NO unit at that resort is RCI-reserved.
 * Resorts NOT listed here are left exactly as apt_rci_reserved has them.
 */
const RCI_RESERVED: Record<string, string[]> = {
  'L-10016': [],                            // KEMANG INDAH  -- none
  'L-10025': [],                            // GOLDEN CITY   -- none
  'L-101':   [],                            // SANTANA       -- none
  'L-10024': ['A6', 'A7'],                  // GREENHILL
  'L-10026': ['504', '506'],                // LEISURE COVE
  'CP-PBR':  ['3201/3202', '3203/3204'],    // PERDANA (lock-off whole units)
};

/** 'Y'/'N' for a unit, or null when the resort is not covered by RCI_RESERVED. */
function rciOverride(resortCode: string, unitNo: string): 'Y' | 'N' | null {
  const named = RCI_RESERVED[resortCode];
  if (!named) return null;
  return named.includes(unitNo) ? 'Y' : 'N';
}

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

  // ACTIVE resorts only. The active-resort join belongs in apt_mast_unload.sql, but it
  // is easy to lose when the UNLOAD is hand-run: an export carrying the four-resort unit
  // whitelist but NOT the resort_mast join loads 12,047 rows over 316 resorts, 11,659 of
  // them on retired resorts, which buries the fn 4 Units screen (it does not filter by
  // resort status). This is the backstop for that -- it costs nothing when the export is
  // already filtered, and the skip count in the summary makes a bad export obvious.
  // Resort.status is 'A'/'U' here; migrate-resorts.ts maps Informix 'I' -> 'U'.
  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true, status: true } });
  const idByCode = new Map(resorts.filter(r => r.status === 'A').map(r => [r.resortCode, r.id]));
  const knownCode = new Set(resorts.map(r => r.resortCode));
  console.log(`\n  ${idByCode.size} active resorts of ${resorts.length} -- units on retired resorts are skipped`);

  let total = 0, skipped = 0, dupes = 0, retired = 0;
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
        // Known but retired is the expected case for an under-filtered export -- count it
        // quietly. Genuinely unknown codes still warn, one line each.
        if (knownCode.has(resortCode)) { retired++; continue; }
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
        rciReserved:   rciOverride(resortCode, unitNo) ?? t(c[2]) ?? 'N',
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
  if (retired) {
    console.log(`  ${retired} row(s) skipped on RETIRED resorts -- the export is missing the`);
    console.log('  resort_mast active join; re-run migrate/apt_mast_unload.sql to shrink the file.');
  }

  // Reconcile rciReserved against RCI_RESERVED for the resorts it covers. Catches rows
  // that already existed (skipDuplicates leaves those untouched) and any flag changed
  // through Apartments/Units Setup since the last run.
  for (const [resortCode, named] of Object.entries(RCI_RESERVED)) {
    if (DRY_RUN) {
      const have = await prisma.resortUnit.count({ where: { resortCode } });
      console.log(`  RCI sweep (dry run) ${resortCode}: ${have} unit(s), ` +
                  `${named.length ? named.join(', ') : 'none'} reserved`);
      continue;
    }
    const on = named.length
      ? await prisma.resortUnit.updateMany({
          where: { resortCode, unitNo: { in: named }, rciReserved: { not: 'Y' } },
          data:  { rciReserved: 'Y', updatedAt: new Date() },
        })
      : { count: 0 };
    const off = await prisma.resortUnit.updateMany({
      where: { resortCode, unitNo: { notIn: named }, rciReserved: { not: 'N' } },
      data:  { rciReserved: 'N', updatedAt: new Date() },
    });
    console.log(`  RCI sweep ${resortCode}: ${on.count} set Y, ${off.count} set N`);
  }

  // Warn if RCI_RESERVED names a unit that does not exist at that resort.
  if (!DRY_RUN) {
    for (const [resortCode, named] of Object.entries(RCI_RESERVED)) {
      if (!named.length) continue;
      const found = await prisma.resortUnit.findMany({
        where: { resortCode, unitNo: { in: named } },
        select: { unitNo: true },
      });
      const have = new Set(found.map(f => f.unitNo));
      const gone = named.filter(u => !have.has(u));
      if (gone.length) {
        console.log(`  WARN RCI_RESERVED names ${resortCode} unit(s) ${gone.join(', ')} ` +
                    `- not in the register`);
      }
    }
  }

  if (!DRY_RUN) {
    const count = await prisma.resortUnit.count();
    const rci = await prisma.resortUnit.groupBy({
      by: ['resortCode'],
      where: { rciReserved: 'Y' },
      _count: { _all: true },
      orderBy: { resortCode: 'asc' },
    });
    console.log(`  DB count: ${count}`);
    console.log(`  RCI-reserved units by resort:`);
    for (const r of rci) console.log(`     ${r.resortCode.padEnd(10)} ${r._count._all}`);
  }

  console.log('\nResort unit migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
