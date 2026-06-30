/**
 * Import all suspension reason codes from migrate/su_mast.txt
 * and upsert into the SuReason table.
 *
 * File format (pipe-delimited):
 *  [0] code   [1] description   (trailing empty token from final delimiter)
 *
 * Run: npx ts-node --transpile-only prisma/seed-su-reasons.ts
 *      npx ts-node --transpile-only prisma/seed-su-reasons.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const lines = fs.readFileSync(
    path.join(__dirname, '..', 'migrate', 'su_mast.txt'),
    'latin1'
  ).split('\n').filter(l => l.trim());

  let upserted = 0;
  for (const line of lines) {
    const c = line.split('|');
    const code = c[0]?.trim();
    const desc = c[1]?.trim();
    if (!code || !desc) continue;

    if (!DRY_RUN) {
      await prisma.suReason.upsert({
        where:  { code },
        update: { description: desc },
        create: { code, description: desc },
      });
    }
    console.log(`  ${code} | ${desc}`);
    upserted++;
  }

  console.log(`\n✔ Upserted ${upserted} codes.`);
  if (!DRY_RUN) {
    const total = await prisma.suReason.count();
    console.log(`Table total: ${total}`);
  }
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
