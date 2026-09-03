/**
 * LHB MMS - RCI Enrolment Migration
 * Source: migrate/rci_enrol.txt  (pipe-delimited, 17,915 rows, no header)
 *
 * Loads Informix `rci_enrol` into the RciEnrolment table (RCI fn 1).
 *
 * RciEnrolment is the SINGLE SOURCE OF TRUTH for RCI data and this is the only script
 * that reads rci_enrol.txt. A sibling, migrate-rci-enrol.ts, used to read the same file
 * to backfill four RCI columns on Agreement; those columns were dropped by migration
 * 20260902090000_drop_agreement_rci_columns and the script is gone. Agreement Detail now
 * renders the current enrolment read-only, resolved by natural key.
 *
 * The file is a FULL-TABLE unload: 43 columns + a trailing empty field, so NF=44.
 * (An earlier, narrower export of the same name had 30 columns and was joined with
 * si_entitlement.)
 *
 * Column mapping (0-indexed; only the 25 columns below are migrated):
 *  [0]  re_cocode           -> coCode
 *  [1]  re_serial_no        -> serialNo        (Informix PK; the only unique key)
 *  [2]  re_batch_no             not migrated
 *  [3]  re_membership_no    -> membershipNo
 *  [4]  re_agreement_no     -> agreementNo
 *  [5]  re_rci_no           -> rciNo
 *  [6]  re_act_date         -> renewalDate     (information only)
 *  [7]  re_expiry_date      -> expiryDate      (information only)
 *  [8]  re_rci_fees         -> rciFees
 *  [9]  re_resort_code      -> resortCode
 *  [10] re_first_name1      -> firstName1
 *  [11] re_last_name1       -> lastName1
 *  [12] re_name1            -> name1
 *  [13] re_name1_no             not migrated
 *  [14] re_agmt_no              not migrated
 *  [15] re_first_name2      -> firstName2
 *  [16] re_last_name2       -> lastName2
 *  [17] re_name2                not migrated (business decision - first/last only)
 *  [18] re_name2_no             not migrated
 *  [19] re_mail_add1        -> mailAdd1
 *  [20] re_mail_add2        -> mailAdd2
 *  [21] re_mail_add3        -> mailAdd3
 *  [22] re_mail_city_state  -> mailCityState
 *  [23] re_mail_postcode    -> mailPostcode
 *  [24] re_malaysia         -> malaysia
 *  [25] re_telno1           -> telNo1
 *  [26] re_telno2           -> telNo2
 *  [27] re_co_owner         -> coOwner
 *  [28] re_rci_status       -> rciStatus
 *  [29] re_tot_interval     -> totInterval
 *  [30..42]                     not migrated (print/audit/lock trailer, re_old_rci_no)
 *
 * UNLOAD: UNLOAD TO 'rci_enrol.txt' DELIMITER '|' SELECT * FROM rci_enrol;
 *
 * Run: npx ts-node --transpile-only prisma/migrate-rci-enrolment.ts
 *      npx ts-node --transpile-only prisma/migrate-rci-enrolment.ts --dry-run
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma  = new PrismaClient();
const FILE    = path.join(__dirname, '..', 'migrate', 'rci_enrol.txt');
const BATCH   = Number(process.env.MIGRATE_BATCH) || 100;
const DRY_RUN = process.argv.includes('--dry-run');

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

// Informix dates are dd-mm-yyyy; store business dates at UTC midnight.
const d = (s: string | undefined): Date | null => {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return isNaN(dt.getTime()) ? null : dt;
};

// decimal(8,2) exports as a float string ("44.0"), like the LvcCode counters.
const dec = (s: string | undefined): Prisma.Decimal | null => {
  const v = t(s);
  if (v === null) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : new Prisma.Decimal(n.toFixed(2));
};

const int = (s: string | undefined, dflt: number): number => {
  const v = t(s);
  if (v === null) return dflt;
  const n = Math.round(parseFloat(v));
  return isNaN(n) ? dflt : n;
};

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS - RCI Enrolment Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  if (!fs.existsSync(FILE)) {
    console.error(`\n  ERROR: ${FILE} not found.`);
    process.exit(1);
  }

  if (!DRY_RUN) {
    console.log('\n[1/3] Clearing RciEnrolment...');
    const del = await prisma.rciEnrolment.deleteMany({});
    console.log(`  ${del.count} existing rows removed`);
  } else {
    console.log('\n[1/3] (dry run - table not cleared)');
  }

  console.log('\n[2/3] Reading rci_enrol.txt...');
  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  let total = 0, loaded = 0, skipped = 0;
  const seenSerial = new Set<number>();
  const warns: string[] = [];
  let rows: any[] = [];

  async function flush() {
    if (!rows.length) return;
    if (!DRY_RUN) {
      await prisma.rciEnrolment.createMany({ data: rows, skipDuplicates: true });
    }
    loaded += rows.length;
    rows = [];
    process.stdout.write(`  ... ${loaded} loaded\r`);
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = line.split('|');
    total++;

    const coCode       = t(c[0]);
    const serialNo     = int(c[1], NaN as unknown as number);
    const membershipNo = t(c[3]);
    const agreementNo  = t(c[4]);

    if (!coCode || !membershipNo || !agreementNo || !Number.isFinite(serialNo)) {
      skipped++;
      if (warns.length < 10) warns.push(`row ${total}: missing key (cocode/serial/membership/agreement)`);
      continue;
    }
    if (seenSerial.has(serialNo)) {
      skipped++;
      if (warns.length < 10) warns.push(`row ${total}: duplicate serial_no ${serialNo}`);
      continue;
    }
    seenSerial.add(serialNo);

    rows.push({
      id: randomUUID(),
      serialNo,
      coCode,
      membershipNo,
      agreementNo,
      rciNo:         t(c[5]),
      renewalDate:   d(c[6]),
      expiryDate:    d(c[7]),
      rciFees:       dec(c[8]),
      resortCode:    t(c[9]),
      firstName1:    t(c[10]),
      lastName1:     t(c[11]),
      name1:         t(c[12]),
      firstName2:    t(c[15]),
      lastName2:     t(c[16]),
      mailAdd1:      t(c[19]),
      mailAdd2:      t(c[20]),
      mailAdd3:      t(c[21]),
      mailCityState: t(c[22]),
      mailPostcode:  t(c[23]),
      malaysia:      t(c[24]),
      telNo1:        t(c[25]),
      telNo2:        t(c[26]),
      coOwner:       t(c[27]),
      rciStatus:     t(c[28]),
      totInterval:   int(c[29], 1),
      updatedAt: new Date(),
    });

    if (rows.length >= BATCH) await flush();
  }

  await flush();

  console.log(`\n\n[3/3] Summary`);
  console.log(`  Total rows read : ${total}`);
  console.log(`  Loaded          : ${loaded}`);
  console.log(`  Skipped         : ${skipped}`);
  if (warns.length) {
    console.log(`  WARN (first ${warns.length}):`);
    warns.forEach(w => console.log(`    - ${w}`));
  }
  console.log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
