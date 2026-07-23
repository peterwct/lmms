/**
 * LHB MMS — Resort Info Migration (ps_resort_info)
 * Source: migrate/ps_resort_info.txt — pipe-delimited Informix UNLOAD
 *   (UNLOAD TO 'ps_resort_info.txt' SELECT * FROM ps_resort_info;)
 *
 * Column mapping (38 cols) — normalized into ResortInfoLine (one row per line):
 *  [0]      psri_resort_code  -> Resort lookup (resortCode -> resortId FK)
 *  [1-10]   psri_get_there1..10  -> category GETTING_THERE,     seq = slot 1..10
 *  [11-20]  psri_res_fac1..10    -> category RESORT_FACILITY,   seq = slot 1..10
 *  [21-26]  psri_pl_int1..6      -> category PLACE_OF_INTEREST, seq = slot 1..6
 *  [27-32]  psri_unit_amen1..6   -> category UNIT_AMENITY,      seq = slot 1..6
 *  [33-36]  psri_usercreate/datecreate/usermodify/datemodify -> skipped (all empty in export)
 *  [37]     psri_lockstatus      -> skipped
 *
 * Empty slots are not stored, but the original slot number is preserved as `seq`
 * so blank print-separator gaps keep the ordering faithful.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-resort-info.ts
 */

import { PrismaClient, ResortInfoCategory } from '@prisma/client';
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

// [category, first column index, slot count]
const BLOCKS: [ResortInfoCategory, number, number][] = [
  ['GETTING_THERE',     1,  10],
  ['RESORT_FACILITY',   11, 10],
  ['PLACE_OF_INTEREST', 21, 6],
  ['UNIT_AMENITY',      27, 6],
];

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
  console.log('LHB MMS — Resort Info Migration (ps_resort_info)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true } });
  const resortMap = new Map(resorts.map(r => [r.resortCode, r.id]));

  let resortsMatched = 0, resortsSkipped = 0, totalLines = 0;
  const perCategory: Record<string, number> = {};
  const batch: any[] = [];

  for await (const c of readLines('ps_resort_info.txt')) {
    const resortCode = t(c[0]);
    if (!resortCode) { resortsSkipped++; continue; }

    const resortId = resortMap.get(resortCode);
    if (!resortId) {
      console.log(`  WARN no matching Resort for ${resortCode} — skipped`);
      resortsSkipped++;
      continue;
    }
    resortsMatched++;

    for (const [category, start, count] of BLOCKS) {
      for (let slot = 1; slot <= count; slot++) {
        const text = t(c[start + slot - 1]);
        if (!text) continue;   // empty slot — seq gap preserves ordering
        batch.push({
          id:        randomUUID(),
          updatedAt: new Date(),
          resortId,
          category,
          seq:       slot,
          text,
        });
        perCategory[category] = (perCategory[category] ?? 0) + 1;
        totalLines++;
      }
    }
  }

  if (!DRY_RUN && batch.length) {
    await prisma.resortInfoLine.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`\n  OK Resorts matched: ${resortsMatched}, skipped: ${resortsSkipped}`);
  for (const [cat, n] of Object.entries(perCategory)) {
    console.log(`     ${cat}: ${n} lines`);
  }
  console.log(`  Total lines: ${totalLines}`);

  if (!DRY_RUN) {
    const count = await prisma.resortInfoLine.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nResort info migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
