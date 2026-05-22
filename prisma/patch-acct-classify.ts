/**
 * Patch acctClassify mapping:
 *   CC  → TM  (was incorrectly mapped to NA on first import)
 *   RA  → NA  (already correct — no change needed)
 *   All others remain unchanged.
 *
 * Run: npx ts-node prisma/patch-acct-classify.ts
 *      npx ts-node prisma/patch-acct-classify.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma  = new PrismaClient();
const FILE    = path.join(__dirname, '..', 'migrate', 'si_entitlement.txt');
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`\n${'='.repeat(50)}`);
  console.log('Patch: acctClassify  CC→TM  |  RA→NA');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(50));

  // Build agreement lookup: "coCode:agreementNo" → agreementId
  console.log('\n[1/3] Building agreement lookup...');
  const agmtMap = new Map<string, string>();
  if (!DRY_RUN) {
    let offset = 0;
    while (true) {
      const rows = await prisma.agreement.findMany({
        select: { id: true, coCode: true, agreementNo: true },
        skip: offset, take: 5000,
      });
      if (!rows.length) break;
      rows.forEach(r => agmtMap.set(`${r.coCode}:${r.agreementNo}`, r.id));
      offset += rows.length;
    }
    console.log(`  ✔ ${agmtMap.size} agreements indexed`);
  }

  // Read file and collect IDs that need updating
  console.log('\n[2/3] Scanning si_entitlement.txt...');
  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  const toTM: string[] = [];  // agreementIds to set → TM
  let ccCount = 0, raCount = 0, skipped = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const c          = line.split('|');
    const coCode     = c[5]?.trim();
    const agreementNo = c[1]?.trim();
    const rawClassify = c[10]?.trim();

    if (!coCode || !agreementNo || !rawClassify) { skipped++; continue; }

    if (rawClassify === 'CC') {
      ccCount++;
      if (!DRY_RUN) {
        const id = agmtMap.get(`${coCode}:${agreementNo}`);
        if (id) toTM.push(id);
      }
    } else if (rawClassify === 'RA') {
      raCount++;
      // Already stored as NA — no action needed
    }
  }

  console.log(`  CC (→ TM): ${ccCount}`);
  console.log(`  RA (→ NA): ${raCount}  (already correct, no change)`);
  console.log(`  Skipped  : ${skipped}`);

  // Apply updates in batches
  console.log('\n[3/3] Applying updates...');
  if (!DRY_RUN) {
    const BATCH = 500;
    let updated = 0;
    for (let i = 0; i < toTM.length; i += BATCH) {
      const batch = toTM.slice(i, i + BATCH);
      const result = await prisma.agreement.updateMany({
        where: { id: { in: batch } },
        data:  { acctClassify: 'TM' },
      });
      updated += result.count;
      process.stdout.write(`\r  updated ${updated} / ${toTM.length}...`);
    }
    console.log(`\n  ✔ ${updated} agreements updated to TM`);
  }

  // Validation
  console.log('\nValidation:');
  if (!DRY_RUN) {
    const groups = await prisma.agreement.groupBy({
      by: ['acctClassify'], _count: true, orderBy: { acctClassify: 'asc' },
    });
    console.log('\n  Status  | Count   | Expected');
    console.log('  --------|---------|----------');
    const expected: Record<string, number> = { NA: 2771, SU: 120, PT: 4843, TM: 26107 };
    groups.forEach(g =>
      console.log(`  ${g.acctClassify.padEnd(6)} | ${String(g._count).padStart(6)}  | ${expected[g.acctClassify] ?? '?'}`));
  } else {
    console.log(`  DRY RUN: would update ${ccCount} CC→TM, ${raCount} RA already correct as NA`);
  }

  console.log('\nPatch complete.\n');
}

main()
  .catch(e => { console.error('Patch failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
