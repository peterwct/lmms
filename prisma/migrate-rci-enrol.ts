/**
 * LHB MMS — RCI Enrollment Backfill (Agreement columns)
 * Source: migrate/rci_enrol.txt  (pipe-delimited, no header)
 *
 * Updates existing Agreement records with rciRefNo / rciNominee / rciEnrolDate /
 * rciExpiryDate. Match key: coCode + membershipNo + agreementNo (natural key).
 *
 * NOT the same thing as prisma/migrate-rci-enrolment.ts, which loads the full
 * rci_enrol table into the RciEnrolment model for the RCI Enrolment CRUD (RCI fn 1).
 * This script only backfills the four RCI fields shown on the Agreement Detail card.
 *
 * TWO SOURCE LAYOUTS — detected from the field count of the first row:
 *
 *  A) FULL TABLE (44 fields = 43 columns + trailing empty), the current export:
 *       UNLOAD TO 'rci_enrol.txt' DELIMITER '|' SELECT * FROM rci_enrol;
 *     coCode[0], serial[1], batch[2], membershipNo[3], agreementNo[4], rciNo[5],
 *     actDate[6], expiryDate[7], ...
 *     It has NO salutation/name columns from si_entitlement, so rciNominee is left
 *     ALONE rather than being overwritten with a differently-shaped value (the stored
 *     value is 'MR WONG YIT MENG'; re_name1 would be 'WONG YIT MENG'). The full names
 *     live in RciEnrolment.name1 instead.
 *
 *  B) LEGACY JOINED (30 fields), the export this script was originally written for:
 *     coCode[0], membershipNo[1], agreementNo[2], rciNo[3], actDate[4], expiryDate[5],
 *     ... e_rci_salutation[27], e_rci_name[28] (joined with si_entitlement).
 *
 * Run: npx ts-node --transpile-only prisma/migrate-rci-enrol.ts
 *      npx ts-node --transpile-only prisma/migrate-rci-enrol.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma  = new PrismaClient();
const FILE    = path.join(__dirname, '..', 'migrate', 'rci_enrol.txt');
const BATCH   = 500;
const DRY_RUN = process.argv.includes('--dry-run');

// Column positions per layout. `salutation`/`name` are absent from the full-table
// export, which is what leaves rciNominee untouched there.
type Layout = {
  name: string;
  coCode: number; membershipNo: number; agreementNo: number;
  rciNo: number; actDate: number; expiryDate: number;
  salutation?: number; rciName?: number;
};

const FULL_TABLE: Layout = {
  name: 'full-table (43 cols)',
  coCode: 0, membershipNo: 3, agreementNo: 4, rciNo: 5, actDate: 6, expiryDate: 7,
};

const LEGACY_JOINED: Layout = {
  name: 'legacy joined (29 cols)',
  coCode: 0, membershipNo: 1, agreementNo: 2, rciNo: 3, actDate: 4, expiryDate: 5,
  salutation: 27, rciName: 28,
};

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

// Informix dates are dd-mm-yyyy
const d = (s: string | undefined): Date | null => {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const dt = new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return isNaN(dt.getTime()) ? null : dt;
};

function detectLayout(): Layout {
  const first = fs.readFileSync(FILE, { encoding: 'latin1' }).split('\n')[0];
  const fields = first.split('|').length;
  // 44 = 43 columns + the trailing empty field an UNLOAD leaves behind
  const layout = fields >= 40 ? FULL_TABLE : LEGACY_JOINED;
  console.log(`  Layout: ${layout.name} — ${fields} fields per row`);
  if (!layout.salutation) {
    console.log('  NOTE: this export has no salutation/name columns; rciNominee left unchanged.');
  }
  return layout;
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — RCI Enrollment Backfill (Agreement columns)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  if (!fs.existsSync(FILE)) {
    console.error(`\n  ERROR: ${FILE} not found.`);
    process.exit(1);
  }

  console.log('');
  const L = detectLayout();

  // Build agreement lookup: "coCode:membershipNo:agreementNo" → agreementId
  console.log('\n[1/3] Building agreement lookup map...');
  const agmtMap = new Map<string, string>();
  if (!DRY_RUN) {
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
    console.log(`  ${agmtMap.size} agreements indexed`);
  }

  // Parse and update
  console.log('\n[2/3] Reading rci_enrol.txt...');
  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  let total = 0;
  let updated = 0;
  let skipped = 0;
  const batch: { id: string; data: Record<string, unknown> }[] = [];

  async function flushBatch() {
    if (!batch.length || DRY_RUN) { batch.length = 0; return; }
    await prisma.$transaction(
      batch.map(row =>
        prisma.agreement.update({
          where: { id: row.id },
          data: { ...row.data, updatedAt: new Date() },
        })
      )
    );
    batch.length = 0;
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = line.split('|');
    total++;

    const coCode       = t(c[L.coCode]);
    const membershipNo = t(c[L.membershipNo]);
    const agreementNo  = t(c[L.agreementNo]);
    const rciNo        = t(c[L.rciNo]);
    const actDate      = d(c[L.actDate]);
    const expiryDate   = d(c[L.expiryDate]);
    const salutation   = L.salutation !== undefined ? t(c[L.salutation]) : null;
    const rciName      = L.rciName !== undefined ? t(c[L.rciName]) : null;

    if (!coCode || !membershipNo || !agreementNo) { skipped++; continue; }

    const key = `${coCode}:${membershipNo}:${agreementNo}`;
    const agmtId = agmtMap.get(key);
    if (!agmtId) { skipped++; continue; }

    const data: Record<string, unknown> = {};
    if (rciNo)      data.rciRefNo = rciNo;
    const rciNominee = [salutation, rciName].filter(Boolean).join(' ') || null;
    if (rciNominee) data.rciNominee = rciNominee;
    if (actDate)    data.rciEnrolDate = actDate;
    if (expiryDate) data.rciExpiryDate = expiryDate;

    if (!Object.keys(data).length) { skipped++; continue; }

    batch.push({ id: agmtId, data });
    if (batch.length >= BATCH) {
      await flushBatch();
      if (updated % 2000 < BATCH) process.stdout.write(`  ... ${updated + batch.length} updated\r`);
    }
    updated++;
  }

  await flushBatch();

  console.log(`\n[3/3] Summary`);
  console.log(`  Total rows read : ${total}`);
  console.log(`  Updated         : ${updated}`);
  console.log(`  Skipped         : ${skipped}`);
  console.log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
