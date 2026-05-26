/**
 * LHB MMS — Zurich Payback Scheme (PBS) Migration
 * Source: migrate/maa_mem.txt  (pipe-delimited, ~5,009 data rows, no header)
 *
 * Column mapping (0-indexed):
 *  [0]  cocode
 *  [1]  agmt_no
 *  [2]  agmt_date       (dd-mm-yyyy — not stored)
 *  [3]  cert_no
 *  [4]  scheme_type
 *  [5]  payback_date    (dd-mm-yyyy)
 *  [6]  top_up          (Y/N)
 *  [7..10] unused
 *  [11] pbs_indc        (Y/N)
 *  [12] claim_indc      (Y/N)
 *
 * Run: npx ts-node prisma/migrate-maa-mem.ts
 *      npx ts-node prisma/migrate-maa-mem.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma  = new PrismaClient();
const FILE    = path.join(__dirname, '..', 'migrate', 'maa_mem.txt');
const BATCH   = 200;
const DRY_RUN = process.argv.includes('--dry-run');

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

const bool = (s: string | undefined): boolean =>
  (s ?? '').trim().toUpperCase() === 'Y';

// Informix dates are dd-mm-yyyy
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

const nullify = (s: string | null): string | null =>
  (!s || s === '(null)') ? null : s;

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — Payback Scheme (PBS) Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  // Build agreement lookup: "coCode:agreementNo" → agreementId
  console.log('\n[1/3] Building agreement lookup map...');
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

  // Parse and import
  console.log('\n[2/3] Reading maa_mem.txt...');
  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  const batch: any[] = [];
  let processed = 0, imported = 0, skipped = 0, notFound = 0;

  const flush = async () => {
    if (DRY_RUN || !batch.length) { batch.length = 0; return; }
    await prisma.pbsScheme.createMany({ data: batch, skipDuplicates: true });
    batch.length = 0;
  };

  for await (const line of rl) {
    if (!line.trim()) continue;

    const c = line.split('|');
    const coCode    = t(c[0]);
    const agmtNoRaw = t(c[1]);
    if (!coCode || !agmtNoRaw) { skipped++; continue; }

    const agreementNo = agmtNoRaw;
    processed++;

    let agreementId = 'dry-run';
    if (!DRY_RUN) {
      agreementId = agmtMap.get(`${coCode}:${agreementNo}`) ?? '';

      if (!agreementId) {
        // Try zero-padded variants (agmt_no in maa_mem may be unpadded)
        for (let pad = 1; pad <= 8; pad++) {
          const padded = agreementNo.padStart(pad, '0');
          agreementId = agmtMap.get(`${coCode}:${padded}`) ?? '';
          if (agreementId) break;
        }
      }

      if (!agreementId) {
        console.warn(`  ⚠ Not found: coCode=${coCode} agmt_no=${agreementNo}`);
        notFound++;
        continue;
      }
    }

    batch.push({
      id:          randomUUID(),
      updatedAt:   new Date(),
      agreementId,
      coCode,
      agreementNo,
      certNo:      nullify(t(c[3])),
      schemeType:  nullify(t(c[4])),
      paybackDate: d(c[5]),
      topUp:       bool(c[6]),
      pbsIndc:     bool(c[11]),
      claimIndc:   bool(c[12]),
    });
    imported++;

    if (batch.length >= BATCH) {
      await flush();
      process.stdout.write(`\r  processed ${processed}, imported ${imported}...`);
    }
  }
  await flush();

  console.log(`\n  ✔ Processed : ${processed}`);
  console.log(`  ✔ Imported  : ${imported}`);
  console.log(`  ✗ Not found : ${notFound}`);
  console.log(`  - Skipped   : ${skipped}`);

  // Validation
  console.log('\n[3/3] Validation...');
  if (!DRY_RUN) {
    const total   = await prisma.pbsScheme.count();
    const hasPbs  = await prisma.pbsScheme.count({ where: { pbsIndc: true } });
    const claimed = await prisma.pbsScheme.count({ where: { claimIndc: true } });
    const schemes = await prisma.pbsScheme.groupBy({ by: ['schemeType'], _count: true, orderBy: { schemeType: 'asc' } });
    console.log(`  Total PBS records : ${total}`);
    console.log(`  pbs_indc = Y      : ${hasPbs}`);
    console.log(`  claim_indc = Y    : ${claimed}`);
    console.log(`  Scheme types:`);
    schemes.forEach(s => console.log(`    ${s.schemeType ?? '(null)'}: ${s._count}`));
  }

  console.log('\nPBS migration complete.\n');
}

main()
  .catch(e => { console.error('Migration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
