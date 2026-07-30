/**
 * LHB MMS — Resort Master Migration
 * Source: migrate/resort_mast.txt — pipe-delimited Informix UNLOAD
 *   (SELECT * FROM resort_mast)  <- UNFILTERED since 2026-07-30
 *
 * The original export was filtered to `re_resort_status = 'A' AND re_cocode IN ('03','15','02')`
 * (7 rows). It was re-extracted unfiltered on 2026-07-30 to 324 rows so the LVC exchange
 * resorts (the `V-*` codes, e.g. V-SGI1 / V-MAE1 / V-CLC1) exist for LVC Resorts Season
 * Point Setup (Resorts Setup fn 12) to reference. Breakdown: ours (03/15/02) 7 active +
 * 45 inactive; partner/LVC 42 active + 230 inactive.
 *
 * Column mapping (26 cols):
 *  [0]  re_resort_code    -> resortCode (unique)
 *  [1]  re_cocode         -> coCode (any Product coCode, not just 03/15/02)
 *  [2]  re_short_name     -> shortName
 *  [3]  re_resort_name    -> resortName
 *  [4]  re_exc_reg        -> (skipped — per business decision)
 *  [5]  re_rci_aff        -> rciAffiliate (Y/N — indicator for RCI affiliation)
 *  [6]  re_rci_code       -> rciCode
 *  [7]  re_rci_release    -> (skipped — per business decision)
 *  [8]  re_lock_onoff     -> lockOnOff (Y/N — resort's rooms have the lock-on/lock-off
 *                            feature: a single apartment can be split/combined as
 *                            Sleep2 / Sleep4 / Sleep6. Used by reservation/booking later)
 *  [9]  re_resort_mgmt    -> resortMgmt
 *  [10] re_contact_person -> contactPerson
 *  [11] re_add1           -> add1
 *  [12] re_add2           -> add2
 *  [13] re_add3           -> add3
 *  [14] re_city           -> city
 *  [15] re_state          -> state
 *  [16] re_country        -> country
 *  [17] re_telno          -> telNo
 *  [18] re_faxno          -> faxNo
 *  [19] re_resort_status  -> status (Informix 'A'/'I'; 'I' is MAPPED TO 'U' — this codebase's
 *                            A=Active / U=Inactive convention, which the A/U toggle and the
 *                            Active/Inactive badge both depend on. Only 'A' stays 'A'.)
 *  [20] re_paymt          -> paymt
 *  [21] re_create_user    -> legacyCreateUser
 *  [22] re_create_date    -> legacyCreateDate (dd-mm-yyyy)
 *  [23] re_mod_user       -> legacyModUser
 *  [24] re_mod_date       -> legacyModDate (dd-mm-yyyy)
 *  [25] re_lock_status    -> lockStatus
 *
 * checkInTime / checkOutTime are NOT in the Informix source — they were supplied
 * by the business (2026-07-23) and are applied from CHECK_TIMES below so a
 * re-import does not wipe them.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-resorts.ts
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

// Informix date: dd-mm-yyyy -> UTC midnight (project convention)
const d = (s: string | undefined): Date | null => {
  const v = s?.trim();
  if (!v) return null;
  const m = v.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
};

// Business-supplied apartment types per resort (not from an UNLOAD file) — 2026-07-23.
// lockType: LM=Master Unit, LS=Split Unit, LN=Normal Unit. Only lock-on/lock-off
// resorts (lockOnOff='Y', currently CP-PBR) use LM/LS; everything else is LN.
const APARTMENT_TYPES: { resortCode: string; apartmentType: string; description: string; lockType: string }[] = [
  { resortCode: 'CP-PBR',  apartmentType: 'SLEEP6', description: 'MAXIMUM 6 PAX ONLY',            lockType: 'LM' },
  { resortCode: 'CP-PBR',  apartmentType: 'SLEEP4', description: 'MAX 4 PAX ONLY',                lockType: 'LS' },
  { resortCode: 'CP-PBR',  apartmentType: 'SLEEP2', description: 'MAX 2 PAX ONLY',                lockType: 'LS' },
  { resortCode: 'L-10016', apartmentType: '2BR',    description: '2 BEDROOM APARTMENT',           lockType: 'LN' },
  { resortCode: 'L-10024', apartmentType: '3BR',    description: '3 BEDROOM APARTMENT',           lockType: 'LN' },
  { resortCode: 'L-10025', apartmentType: '3BR',    description: '3 BEDROOM APARTMENT',           lockType: 'LN' },
  { resortCode: 'L-10026', apartmentType: '2BR',    description: '2 BEDROOM APARTMENT',           lockType: 'LN' },
  { resortCode: 'L-101',   apartmentType: '1BR',    description: '1 BEDROOM APT',                 lockType: 'LN' },
  { resortCode: 'L-103A',  apartmentType: '3BR',    description: 'MAXI 6 PAX INCLUDING CHILDREN', lockType: 'LN' },
];

// Business-supplied check-in/check-out times (not in resort_mast) — 2026-07-23
const CHECK_TIMES: Record<string, { checkIn: string; checkOut: string }> = {
  'CP-PBR':  { checkIn: '2PM - 11PM', checkOut: '12PM' },
  'L-10016': { checkIn: '2PM - 10PM', checkOut: '12PM' },
  'L-10024': { checkIn: '2PM - 11PM', checkOut: '12PM' },
  'L-10025': { checkIn: '2PM - 10PM', checkOut: '12PM' },
  'L-10026': { checkIn: '3PM - 11PM', checkOut: '12PM' },
  'L-101':   { checkIn: '2PM-5PM',    checkOut: '10AM' },
  'L-103A':  { checkIn: '3.00PM',     checkOut: '12.00PM' },
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
  console.log('LHB MMS — Resort Master Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  let total = 0, skipped = 0;
  const byStatus: Record<string, number> = { A: 0, U: 0 };
  const rawStatuses = new Set<string>();
  const batch: any[] = [];

  for await (const c of readLines('resort_mast.txt')) {
    const resortCode = t(c[0]);
    const coCode = t(c[1]);
    const rawStatus = (t(c[19]) ?? 'A').toUpperCase();

    // The export is unfiltered since 2026-07-30 — every coCode and both statuses load,
    // so the LVC 'V-*' exchange resorts are available to fn 12. Only structurally
    // unusable rows are skipped.
    if (!resortCode) { skipped++; continue; }
    if (!coCode) {
      console.log(`  WARN ${resortCode} has no coCode — skipped`);
      skipped++;
      continue;
    }

    // Informix uses 'A'/'I'; this codebase's convention is 'A'/'U' (the status toggle
    // and the Active/Inactive badge both key off it). Anything not 'A' becomes 'U'.
    rawStatuses.add(rawStatus);
    const status = rawStatus === 'A' ? 'A' : 'U';
    byStatus[status]++;

    batch.push({
      id:               randomUUID(),
      updatedAt:        new Date(),
      resortCode,
      coCode,
      shortName:        t(c[2]),
      resortName:       t(c[3]) ?? '(no name)',
      // c[4] re_exc_reg and c[7] re_rci_release intentionally skipped
      rciAffiliate:     t(c[5]),
      rciCode:          t(c[6]),
      lockOnOff:        t(c[8]),
      resortMgmt:       t(c[9]),
      contactPerson:    t(c[10]),
      add1:             t(c[11]),
      add2:             t(c[12]),
      add3:             t(c[13]),
      city:             t(c[14]),
      state:            t(c[15]),
      country:          t(c[16]),
      telNo:            t(c[17]),
      faxNo:            t(c[18]),
      status,
      checkInTime:      CHECK_TIMES[resortCode]?.checkIn ?? null,
      checkOutTime:     CHECK_TIMES[resortCode]?.checkOut ?? null,
      paymt:            t(c[20]),
      legacyCreateUser: t(c[21]),
      legacyCreateDate: d(c[22]),
      legacyModUser:    t(c[23]),
      legacyModDate:    d(c[24]),
      lockStatus:       t(c[25]),
    });
    total++;
  }

  if (!DRY_RUN && batch.length) {
    await prisma.resort.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`\n  OK Resorts: ${total} parsed, ${skipped} skipped`);
  console.log(`     Active ${byStatus.A}, Inactive ${byStatus.U}` +
              `  (raw Informix statuses seen: ${[...rawStatuses].sort().join(', ')})`);
  console.log(`     createMany uses skipDuplicates on resortCode, so existing rows and any`);
  console.log(`     app edits / cascade-dependent data are left untouched.`);

  // Apartment types (business-supplied, keyed by resortCode) — resolve FK then insert
  if (!DRY_RUN) {
    const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true } });
    const idByCode = new Map(resorts.map(r => [r.resortCode, r.id]));
    const atBatch = APARTMENT_TYPES
      .filter(a => idByCode.has(a.resortCode))
      .map(a => ({
        id:         randomUUID(),
        updatedAt:  new Date(),
        resortId:   idByCode.get(a.resortCode)!,
        ...a,
      }));
    await prisma.apartmentType.createMany({ data: atBatch, skipDuplicates: true });
    console.log(`  OK Apartment types: ${atBatch.length} inserted (of ${APARTMENT_TYPES.length})`);
  } else {
    console.log(`  Apartment types (dry run): ${APARTMENT_TYPES.length} pending`);
  }

  if (!DRY_RUN) {
    const count = await prisma.resort.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nResort migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
