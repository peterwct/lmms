/**
 * LHB MMS — PBS Claims Migration
 * Source: migrate/maa_claim.txt  (pipe-delimited, no header)
 *
 * Column mapping (0-indexed):
 *  [0]  agmt_no
 *  [1]  cert_no
 *  [2]  ref_no          (serial)
 *  [3]  claimant
 *  [4]  claimant_ic
 *  [5]  acc_no
 *  [6]  bank_code
 *  [7]  relation_code
 *  [8]  remark
 *  [9]  loss_date       (dd-mm-yyyy)
 *  [10] claim_amt       (decimal)
 *  [11] pay_mode
 *  [12] doc_no
 *  [13] doc_date        (dd-mm-yyyy)
 *  [14] claim_type
 *  [15] claim_remark
 *  [16] trust_paid_date (dd-mm-yyyy)
 *  [17] user_create
 *  [18] date_create     (dd-mm-yyyy)
 *  [19] user_modify
 *  [20] date_modify     (dd-mm-yyyy)
 *
 * Run: npx ts-node --transpile-only prisma/migrate-maa-claim.ts
 *      npx ts-node --transpile-only prisma/migrate-maa-claim.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma  = new PrismaClient();
const FILE    = path.join(__dirname, '..', 'migrate', 'maa_claim.txt');
const BATCH   = 200;
const DRY_RUN = process.argv.includes('--dry-run');

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

const nullify = (s: string | null): string | null =>
  (!s || s === '(null)') ? null : s;

const d = (s: string | undefined): Date | null => {
  if (!s || !s.trim()) return null;
  const str = s.trim();
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const dt = new Date(`${m[3]}-${m[2]}-${m[1]}`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
};

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — PBS Claims Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  // Build PbsScheme lookup: "agreementNo" → pbsSchemeId
  // Claims link via agmt_no to PbsScheme.agreementNo
  console.log('\n[1/3] Building PbsScheme lookup map...');
  const pbsMap = new Map<string, string>();
  if (!DRY_RUN) {
    let offset = 0;
    while (true) {
      const rows = await prisma.pbsScheme.findMany({
        select: { id: true, agreementNo: true },
        skip: offset, take: 5000,
      });
      if (!rows.length) break;
      rows.forEach(r => pbsMap.set(r.agreementNo, r.id));
      offset += rows.length;
    }
    console.log(`  ${pbsMap.size} PBS schemes indexed`);
  }

  // Parse and import
  console.log('\n[2/3] Reading maa_claim.txt...');
  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  const batch: any[] = [];
  let processed = 0, imported = 0, skipped = 0, notFound = 0;

  const flush = async () => {
    if (DRY_RUN || !batch.length) { batch.length = 0; return; }
    await prisma.pbsClaim.createMany({ data: batch, skipDuplicates: true });
    batch.length = 0;
  };

  for await (const line of rl) {
    if (!line.trim()) continue;

    const c = line.split('|');
    const agmtNoRaw = t(c[0]);
    if (!agmtNoRaw) { skipped++; continue; }

    const agreementNo = agmtNoRaw;
    processed++;

    let pbsSchemeId = 'dry-run';
    if (!DRY_RUN) {
      pbsSchemeId = pbsMap.get(agreementNo) ?? '';

      if (!pbsSchemeId) {
        for (let pad = 1; pad <= 8; pad++) {
          const padded = agreementNo.padStart(pad, '0');
          pbsSchemeId = pbsMap.get(padded) ?? '';
          if (pbsSchemeId) break;
        }
      }

      if (!pbsSchemeId) {
        console.warn(`  ! Not found: agmt_no=${agreementNo}`);
        notFound++;
        continue;
      }
    }

    const refNoStr = t(c[2]);
    const refNo = refNoStr ? parseInt(refNoStr, 10) : 0;

    const dateCreate = d(c[18]);
    const dateModify = d(c[20]);

    batch.push({
      id:            randomUUID(),
      pbsSchemeId,
      agreementNo,
      certNo:        nullify(t(c[1])),
      refNo,
      claimant:      nullify(t(c[3])),
      claimantIc:    nullify(t(c[4])),
      accNo:         nullify(t(c[5])),
      bankCode:      nullify(t(c[6])),
      relationCode:  nullify(t(c[7])),
      remark:        nullify(t(c[8])),
      lossDate:      d(c[9]),
      claimAmt:      parseFloat((t(c[10]) ?? '0').replace(/,/g, '')) || 0,
      payMode:       nullify(t(c[11])),
      docNo:         nullify(t(c[12])),
      docDate:       d(c[13]),
      claimType:     nullify(t(c[14])),
      claimRemark:   nullify(t(c[15])),
      trustPaidDate: d(c[16]),
      createdAt:     dateCreate ?? new Date(),
      updatedAt:     dateModify ?? dateCreate ?? new Date(),
    });
    imported++;

    if (batch.length >= BATCH) {
      await flush();
      process.stdout.write(`\r  processed ${processed}, imported ${imported}...`);
    }
  }
  await flush();

  console.log(`\n  Processed : ${processed}`);
  console.log(`  Imported  : ${imported}`);
  console.log(`  Not found : ${notFound}`);
  console.log(`  Skipped   : ${skipped}`);

  // Validation
  console.log('\n[3/3] Validation...');
  if (!DRY_RUN) {
    const total = await prisma.pbsClaim.count();
    const types = await prisma.pbsClaim.groupBy({ by: ['claimType'], _count: true, orderBy: { claimType: 'asc' } });
    console.log(`  Total PBS claims : ${total}`);
    console.log(`  Claim types:`);
    types.forEach(s => console.log(`    ${s.claimType ?? '(null)'}: ${s._count}`));
  }

  console.log('\nPBS claims migration complete.\n');
}

main()
  .catch(e => { console.error('Migration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
