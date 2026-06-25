/**
 * LHB MMS — RCI Enrollment Migration
 * Source: migrate/rci_enrol.txt  (pipe-delimited, ~17,909 rows, no header)
 *
 * Updates existing Agreement records with rciNominee (salutation + name).
 * Match key: coCode + membershipNo + agreementNo (natural key).
 *
 * Column mapping (0-indexed, 29 tokens per row incl. trailing):
 *  [0]  re_cocode
 *  [1]  re_membership_no
 *  [2]  re_agreement_no
 *  [3]  re_rci_no            (RCI ID)
 *  [4]  re_act_date          (dd-mm-yyyy — joint/activation date)
 *  [5]  re_expiry_date       (dd-mm-yyyy)
 *  [6]  re_rci_fees
 *  [7]  re_resort_code
 *  [8]  re_first_name1
 *  [9]  re_last_name1
 *  [10] re_name1             (full name of person 1)
 *  [11] re_name1_no
 *  [12] re_agmt_no
 *  [13] re_first_name2
 *  [14] re_last_name2
 *  [15] re_name2             (full name of person 2)
 *  [16] re_name2_no
 *  [17] re_mail_add1
 *  [18] re_mail_add2
 *  [19] re_mail_add3
 *  [20] re_mail_city_state
 *  [21] re_mail_postcode
 *  [22] re_malaysia          (Y/N)
 *  [23] re_telno1
 *  [24] re_telno2
 *  [25] re_co_owner
 *  [26] re_old_rci_no
 *  [27] e_rci_salutation     (from si_entitlement JOIN)
 *  [28] e_rci_name           (from si_entitlement JOIN)
 *  [29] (trailing)
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

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — RCI Enrollment Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

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

    const coCode       = t(c[0]);
    const membershipNo = t(c[1]);
    const agreementNo  = t(c[2]);
    const rciNo        = t(c[3]);
    const actDate      = d(c[4]);
    const expiryDate   = d(c[5]);
    const salutation   = t(c[27]);
    const rciName      = t(c[28]);

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
