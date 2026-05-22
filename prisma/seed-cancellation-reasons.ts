/**
 * Import all cancellation/termination reason codes from migrate/agmt_can_cate.txt
 * and upsert into the CancellationReason table.
 *
 * File format (pipe-delimited):
 *  [0] code        [1] description   [2] category (CC|TM)
 *  [3] type (D|H)  [4] empty         [5] status (A|U|N)
 *  ... audit fields ignored
 *
 * Run: npx ts-node prisma/seed-cancellation-reasons.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const lines = fs.readFileSync(
    path.join(__dirname, '..', 'migrate', 'agmt_can_cate.txt'),
    'utf8'
  ).split('\n').filter(l => l.trim());

  let upserted = 0;
  for (const line of lines) {
    const c = line.split('|');
    const code     = c[0]?.trim().padStart(2, '0'); // ensure 2-digit e.g. "01"
    const desc     = c[1]?.trim();
    const category = c[2]?.trim();
    const type     = c[3]?.trim() || null;
    const status   = c[5]?.trim() || 'A';

    if (!code || !desc || !category) continue;

    await prisma.cancellationReason.upsert({
      where:  { code },
      update: { description: desc, category, type, status },
      create: { code, description: desc, category, type, status },
    });
    console.log(`  ${code} | ${desc} | ${category} | ${status}`);
    upserted++;
  }

  // Code 05 is used in agreements but absent from agmt_can_cate.txt — keep it
  await prisma.cancellationReason.upsert({
    where:  { code: '05' },
    update: { description: 'UNABLE TO SERVICE LOAN', category: 'CC', type: 'D', status: 'A' },
    create: { code: '05', description: 'UNABLE TO SERVICE LOAN', category: 'CC', type: 'D', status: 'A' },
  });
  console.log(`  05 | UNABLE TO SERVICE LOAN | CC | A  (kept from seed)`);
  upserted++;

  const total = await prisma.cancellationReason.count();
  console.log(`\n✔ Upserted ${upserted} codes. Table total: ${total}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
