/**
 * LHB MMS — Salesperson Migration
 * Source: migrate/csp_mast.txt — pipe-delimited
 *
 * Column mapping:
 *  [0] csp_code   -> code
 *  [1] csp_name   -> name
 *  [2] csp_branch -> branch
 *  [3] csp_status -> status
 *
 * Run: npx ts-node --transpile-only prisma/migrate-salesperson.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const MIGRATE_DIR = path.join(__dirname, '..', 'migrate');
const DELIM = '|';
const BATCH = 500;
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
  console.log('LHB MMS — Salesperson Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  let total = 0, skipped = 0;
  const batch: any[] = [];

  const flush = async () => {
    if (DRY_RUN || !batch.length) return;
    await prisma.salesperson.createMany({ data: batch, skipDuplicates: true });
    batch.length = 0;
  };

  for await (const c of readLines('csp_mast.txt')) {
    const code = t(c[0]);
    if (!code) { skipped++; continue; }

    batch.push({
      id:        randomUUID(),
      updatedAt: new Date(),
      code,
      name:      t(c[1]) ?? '(no name)',
      branch:    t(c[2]),
      status:    t(c[3]),
    });
    total++;

    if (batch.length >= BATCH) {
      await flush();
      process.stdout.write(`\r  processed ${total} salespersons...`);
    }
  }
  await flush();

  console.log(`\n  OK Salespersons: ${total} inserted, ${skipped} skipped`);

  if (!DRY_RUN) {
    const count = await prisma.salesperson.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nSalesperson migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
