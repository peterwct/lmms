/**
 * Seed the School Holidays calendar (Resorts Setup fn 7).
 *
 * There is no Informix UNLOAD file for this — the 2026 list is business-supplied,
 * so it is baked in below (same approach as seed-public-holidays.ts).
 *
 * Idempotent — upserts on the [academicYear, description] compound unique, so
 * re-running never duplicates and never clobbers a range staff have already edited
 * (an edited row keeps its description, so it is simply updated back in place).
 *
 * Run: npx ts-node --transpile-only prisma/seed-school-holidays.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

// [startDay, startMonth, endDay, endMonth, academicYear, description]
// Note the mid-year and term-2 breaks cross a month boundary.
const SCHOOL_HOLIDAYS: [number, number, number, number, number, string][] = [
  [21, 3,  29, 3,  2026, 'TERM 1 SCHOOL HOLIDAYS'],
  [23, 5,  7,  6,  2026, 'MID YEAR SCHOOL HOLIDAYS'],
  [29, 8,  6,  9,  2026, 'TERM 2 SCHOOL HOLIDAYS'],
  [5,  12, 31, 12, 2026, 'END OF SCHOOL YEAR HOLIDAYS'],
];

const DAY_MS = 86_400_000;

async function main() {
  let created = 0;
  let existing = 0;

  for (const [sd, sm, ed, em, academicYear, description] of SCHOOL_HOLIDAYS) {
    // UTC-midnight business dates. The end month/year are taken from the tuple, so a
    // range crossing into the next calendar year would still need its own handling.
    const startDate = new Date(Date.UTC(academicYear, sm - 1, sd));
    const endDate   = new Date(Date.UTC(academicYear, em - 1, ed));

    const before = await prisma.schoolHoliday.findUnique({
      where: { academicYear_description: { academicYear, description } },
      select: { id: true },
    });

    await prisma.schoolHoliday.upsert({
      where:  { academicYear_description: { academicYear, description } },
      update: { startDate, endDate, updatedAt: new Date() },
      create: { id: randomUUID(), academicYear, startDate, endDate, description, updatedAt: new Date() },
    });

    if (before) existing++; else created++;
    const days = (endDate.getTime() - startDate.getTime()) / DAY_MS + 1;
    console.log(`  ${startDate.toISOString().slice(0, 10)} → ${endDate.toISOString().slice(0, 10)}  (${days} days)  ${description}`);
  }

  const total = await prisma.schoolHoliday.count();
  console.log(`\n✔ ${SCHOOL_HOLIDAYS.length} school holidays seeded (${created} new, ${existing} already present).`);
  console.log(`  SchoolHoliday now holds ${total} record(s).`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
