/**
 * LHB MMS — AMC Invoice Counter Migration
 * Source: migrate/ctrl_billtab.txt — pipe-delimited
 *
 * Informix UNLOAD:
 *   UNLOAD TO "ctrl_billtab.txt"
 *     SELECT cocode, last_amcinv FROM ctrl_billtab WHERE cocode IN ("03", "15", "02");
 *
 * Column mapping:
 *  [0] cocode      -> coCode      (PK: "02", "03", "15")
 *  [1] last_amcinv -> lastInvNo   (last used AMC invoice running number)
 *
 * Seeds the per-coCode AMC invoice running number so the new system continues
 * numbering where Informix left off. Upsert-by-coCode (small control table).
 *
 * WARNING: re-running this RESETS lastInvNo back to the Informix value. That is
 * correct for UAT data refreshes (a refresh also truncates AmcInvoice), but it
 * must NOT be run after go-live once the live system has started issuing
 * invoices, or numbers already used would be reissued.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-amc-invoice-counter.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const MIGRATE_DIR = path.join(__dirname, '..', 'migrate');
const DELIM = '|';
const DRY_RUN = process.argv.includes('--dry-run');

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

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
  console.log('LHB MMS — AMC Invoice Counter Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  let total = 0, skipped = 0;

  for await (const c of readLines('ctrl_billtab.txt')) {
    const coCode = t(c[0]);
    const lastInvNo = c[1] !== undefined ? parseInt(c[1].trim(), 10) : NaN;
    if (!coCode || Number.isNaN(lastInvNo)) {
      console.warn(`  Skipping malformed row: ${c.join(DELIM)}`);
      skipped++;
      continue;
    }

    console.log(`  ${coCode} -> lastInvNo ${lastInvNo}`);
    if (!DRY_RUN) {
      await prisma.amcInvoiceCounter.upsert({
        where:  { coCode },
        update: { lastInvNo, updatedAt: new Date() },
        create: { coCode, lastInvNo, updatedAt: new Date() },
      });
    }
    total++;
  }

  console.log(`\n  OK Counters: ${total} upserted, ${skipped} skipped`);

  if (!DRY_RUN) {
    const rows = await prisma.amcInvoiceCounter.findMany({ orderBy: { coCode: 'asc' } });
    console.log('  DB state:');
    for (const r of rows) console.log(`    ${r.coCode}: ${r.lastInvNo}`);
  }

  console.log('\nAMC Invoice Counter migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
