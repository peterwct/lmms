/**
 * Patch script — populate compCityState, compPostcode, compStateCode,
 * telOffice2, faxOffice for all individual members from the re-exported
 * si_ind_mast.txt (new columns at [61]–[65]).
 *
 * Run: npx ts-node prisma/patch-ind-mast-new-fields.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const FILE  = path.join(__dirname, '..', 'migrate', 'si_ind_mast.txt');
const BATCH = 500;

const t = (s: string): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

async function main() {
  console.log('Patching individual members: compCityState, compPostcode, compStateCode, telOffice2, faxOffice...');

  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  type Row = {
    membershipNo: string;
    compCityState: string | null;
    compPostcode:  string | null;
    compStateCode: string | null;
    telOffice2:    string | null;
    faxOffice:     string | null;
  };

  let batch: Row[] = [];
  let processed = 0, updated = 0, notFound = 0;

  const flush = async (rows: Row[]) => {
    for (const row of rows) {
      const result = await prisma.member.updateMany({
        where: { membershipNo: row.membershipNo },
        data: {
          compCityState: row.compCityState,
          compPostcode:  row.compPostcode,
          compStateCode: row.compStateCode,
          telOffice2:    row.telOffice2,
          faxOffice:     row.faxOffice,
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
    if (!membershipNo) continue;

    batch.push({
      membershipNo,
      compCityState: t(c[61] ?? ''),
      compPostcode:  t(c[62] ?? ''),
      compStateCode: t(c[63] ?? ''),
      telOffice2:    t(c[64] ?? ''),
      faxOffice:     t(c[65] ?? ''),
    });
    processed++;

    if (batch.length >= BATCH) {
      await flush(batch);
      batch = [];
      process.stdout.write(`\r  processed ${processed}, updated ${updated}...`);
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
