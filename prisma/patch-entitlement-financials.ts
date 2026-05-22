/**
 * Patch script — populate sinkFund, govtTax, legacyModifiedAt
 * for all existing agreements from the re-exported si_entitlement.txt.
 *
 * New column layout (verified against re-exported file):
 *  [0]  e_membership_no
 *  [1]  e_agreement_no
 *  [14] e_sink_fund
 *  [15] e_govt_tax
 *  [62] e_mod_date
 *
 * Run: npx ts-node prisma/patch-entitlement-financials.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const FILE   = path.join(__dirname, '..', 'migrate', 'si_entitlement.txt');
const BATCH  = 500;

const n = (s: string): number | null => {
  const v = parseFloat(s.trim());
  return isNaN(v) ? null : v;
};

const d = (s: string): Date | null => {
  const str = s.trim();
  if (!str) return null;
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const dt = new Date(`${m[3]}-${m[2]}-${m[1]}`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
};

async function main() {
  console.log('Patching agreements with sinkFund, govtTax, legacyModifiedAt...');

  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  type PatchRow = { membershipNo: string; agreementNo: string; sinkFund: number | null; govtTax: number | null; legacyModifiedAt: Date | null };
  let batch: PatchRow[] = [];
  let processed = 0, updated = 0, notFound = 0;

  const flush = async (rows: PatchRow[]) => {
    for (const row of rows) {
      const result = await prisma.agreement.updateMany({
        where: {
          membershipNo: row.membershipNo,
          agreementNo:  row.agreementNo,
        },
        data: {
          sinkFund:         row.sinkFund,
          govtTax:          row.govtTax,
          legacyModifiedAt: row.legacyModifiedAt,
        },
      });
      if (result.count > 0) updated += result.count;
      else notFound++;
    }
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = line.split('|');

    const membershipNo = c[0]?.trim();
    const agreementNo  = c[1]?.trim();
    if (!membershipNo || !agreementNo) continue;

    batch.push({
      membershipNo,
      agreementNo,
      sinkFund:         n(c[14] ?? ''),
      govtTax:          n(c[15] ?? ''),
      legacyModifiedAt: d(c[62] ?? ''),
    });
    processed++;

    if (batch.length >= BATCH) {
      await flush(batch);
      batch = [];
      process.stdout.write(`\r  processed ${processed} rows, updated ${updated}...`);
    }
  }

  if (batch.length) await flush(batch);

  console.log(`\n\nDone.`);
  console.log(`  Rows read    : ${processed}`);
  console.log(`  Rows updated : ${updated}`);
  console.log(`  Not found    : ${notFound}`);
}

main()
  .catch(e => { console.error('Patch failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
