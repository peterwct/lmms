/**
 * Import Malaysian state codes from migrate/state.txt
 * Run: npx ts-node prisma/seed-states.ts
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const lines = fs.readFileSync(
    path.join(__dirname, '..', 'migrate', 'state.txt'),
    'utf8'
  ).split('\n').filter(l => l.trim());

  let count = 0;
  for (const line of lines) {
    const parts = line.split('|');
    const code  = parts[0]?.trim();
    const name  = parts[1]?.trim();
    if (!code || !name) continue;

    await prisma.state.upsert({
      where:  { code },
      update: { name },
      create: { code, name },
    });
    console.log(`  ${code} — ${name}`);
    count++;
  }
  console.log(`\n✔ ${count} states imported.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
