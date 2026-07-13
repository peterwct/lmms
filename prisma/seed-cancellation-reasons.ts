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

// Per business (2026-07-10), ONLY these codes are offered in the "Change Status"
// reason picker (status = 'A'). Every other code is retained for historical
// display but deactivated (status = 'U'). This override is authoritative and
// deliberately ignores the status column in agmt_can_cate.txt, whose values do
// not reflect the current business rules.
const ACTIVE_CODES = new Set([
  '08', '10', '13', '15', '21', '22', '24', '25',
  '34', '37', '38', '39', '43', '45', '46',
]);

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

    if (!code || !desc || !category) continue;

    const status = ACTIVE_CODES.has(code) ? 'A' : 'U';

    await prisma.cancellationReason.upsert({
      where:  { code },
      update: { description: desc, category, type, status },
      create: { code, description: desc, category, type, status },
    });
    console.log(`  ${code} | ${desc} | ${category} | ${status}`);
    upserted++;
  }

  // Code 05 is used in agreements but absent from agmt_can_cate.txt — keep it
  // for historical display; not in ACTIVE_CODES, so deactivated.
  await prisma.cancellationReason.upsert({
    where:  { code: '05' },
    update: { description: 'UNABLE TO SERVICE LOAN', category: 'CC', type: 'D', status: 'U' },
    create: { code: '05', description: 'UNABLE TO SERVICE LOAN', category: 'CC', type: 'D', status: 'U' },
  });
  console.log(`  05 | UNABLE TO SERVICE LOAN | CC | U  (kept from seed, deactivated)`);
  upserted++;

  const total = await prisma.cancellationReason.count();
  console.log(`\n✔ Upserted ${upserted} codes. Table total: ${total}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
