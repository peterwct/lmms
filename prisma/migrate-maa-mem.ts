/**
 * LHB MMS — Zurich Payback Scheme (PBS) Migration
 * Source: migrate/maa_mem.txt  (fixed-width, 5,009 data rows)
 *
 * Column positions (derived from dash-line header):
 *  cocode       0–5
 *  agmt_no      7–14
 *  agmt_date   16–25   (not stored — agreement date already in agreements table)
 *  cert_no     27–36
 *  scheme_type 38–48
 *  payback_date 50–61
 *  top_up      63–68
 *  no_of_amcinv / amc_nextdue / no_of_inst / inhse_nextdue — ignored (no usage)
 *  pbs_indc   120–127
 *  claim_indc 129–138
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

// Fixed-width column positions (start, length)
const COL: Record<string, [number, number]> = {
  cocode:       [0,   6],
  agmt_no:      [7,   8],
  cert_no:      [27, 10],
  scheme_type:  [38, 11],
  payback_date: [50, 12],
  top_up:       [63,  6],
  pbs_indc:     [120, 8],
  claim_indc:   [129, 9],
};

const col = (line: string, name: string): string => {
  const [start, len] = COL[name];
  if (start >= line.length) return '';
  return line.substring(start, Math.min(start + len, line.length)).trim();
};

const bool = (s: string): boolean => s.toUpperCase() === 'Y';

const d = (s: string): Date | null => {
  if (!s || s === '(null)') return null;
  // Format: YYYY-MM-DD
  const dt = new Date(s);
  return isNaN(dt.getTime()) ? null : dt;
};

const nullify = (s: string): string | null =>
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
    input: fs.createReadStream(FILE, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  const batch: any[] = [];
  let processed = 0, imported = 0, skipped = 0, notFound = 0;
  let headerSkipped = 0;

  const flush = async () => {
    if (DRY_RUN || !batch.length) { batch.length = 0; return; }
    await prisma.pbsScheme.createMany({ data: batch, skipDuplicates: true });
    batch.length = 0;
  };

  for await (const line of rl) {
    // Skip header and dash lines
    if (headerSkipped < 2) { headerSkipped++; continue; }
    if (!line.trim()) continue;

    const coCode    = col(line, 'cocode');
    const agmtNoRaw = col(line, 'agmt_no');
    if (!coCode || !agmtNoRaw) { skipped++; continue; }

    // agmt_no in maa_mem is left-padded with spaces — already trimmed by col()
    const agreementNo = agmtNoRaw;
    processed++;

    let agreementId = 'dry-run';
    if (!DRY_RUN) {
      // Try exact match first, then zero-padded variants
      const key = `${coCode}:${agreementNo}`;
      agreementId = agmtMap.get(key) ?? '';

      if (!agreementId) {
        // Some agreement nos in maa_mem may need zero-padding
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
      agreementId,
      coCode,
      agreementNo,
      certNo:      nullify(col(line, 'cert_no')),
      schemeType:  nullify(col(line, 'scheme_type')),
      paybackDate: d(col(line, 'payback_date')),
      topUp:       bool(col(line, 'top_up')),
      pbsIndc:     bool(col(line, 'pbs_indc')),
      claimIndc:   bool(col(line, 'claim_indc')),
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
    const total     = await prisma.pbsScheme.count();
    const hasPbs    = await prisma.pbsScheme.count({ where: { pbsIndc: true } });
    const claimed   = await prisma.pbsScheme.count({ where: { claimIndc: true } });
    const schemes   = await prisma.pbsScheme.groupBy({ by: ['schemeType'], _count: true, orderBy: { schemeType: 'asc' } });
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
