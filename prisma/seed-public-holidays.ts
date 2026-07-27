/**
 * Seed the Public Holidays calendar (Resorts Setup fn 6).
 *
 * There is no Informix UNLOAD file for this — the 2026 list is business-supplied,
 * so it is baked in below (same approach as APARTMENT_TYPES / CHECK_TIMES in
 * migrate-resorts.ts). Dates are stored EXACTLY as supplied: several are the eve
 * of the gazetted holiday (Labour Day 30/04, National Day 30/08, Christmas 24/12)
 * and that is intentional.
 *
 * Idempotent — upserts on the [holidayDate, description] compound unique, so
 * re-running never duplicates and never clobbers a holiday staff have edited to a
 * different date (that edited row simply stays, and the seed row is re-created).
 *
 * Run: npx ts-node --transpile-only prisma/seed-public-holidays.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// [day, month, year, description] — as supplied by the business
const HOLIDAYS: [number, number, number, string][] = [
  [16, 2,  2026, 'CHINESE NEW YEAR'],
  [30, 4,  2026, 'LABOUR DAY'],
  [31, 5,  2026, "AGUNG'S BIRTHDAY"],
  [30, 5,  2026, 'WESAK DAY'],
  [30, 8,  2026, 'NATIONAL DAY'],
  [15, 9,  2026, 'MALAYSIA DAY'],
  [24, 12, 2026, 'CHRISTMAS DAY'],
  [20, 3,  2026, 'HARI RAYA AIDILFITRI'],
  [26, 5,  2026, 'HARI RAYA HAJI'],
  [16, 6,  2026, 'AWAL MUHARAM'],
  [24, 8,  2026, 'PROPHET M BIRTHDAY'],
  [7,  11, 2026, 'DEEPAVALI'],
];

async function main() {
  let created = 0;
  let existing = 0;

  for (const [day, month, year, description] of HOLIDAYS) {
    const holidayDate = new Date(Date.UTC(year, month - 1, day)); // UTC midnight business date

    const before = await prisma.publicHoliday.findUnique({
      where: { holidayDate_description: { holidayDate, description } },
      select: { id: true },
    });

    await prisma.publicHoliday.upsert({
      where:  { holidayDate_description: { holidayDate, description } },
      update: { year, updatedAt: new Date() },
      create: { id: randomUUID(), holidayDate, year, description, updatedAt: new Date() },
    });

    if (before) existing++; else created++;
    console.log(`  ${holidayDate.toISOString().slice(0, 10)}  ${description}`);
  }

  const total = await prisma.publicHoliday.count();
  console.log(`\n✔ ${HOLIDAYS.length} public holidays seeded (${created} new, ${existing} already present).`);
  console.log(`  PublicHoliday now holds ${total} record(s).`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
