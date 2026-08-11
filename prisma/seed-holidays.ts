/**
 * Seed the Holidays calendar (Resorts Setup fn 7) — public holidays AND school holidays,
 * which share one table discriminated by holidayType.
 *
 * There is no Informix UNLOAD file for either — the 2026 lists are business-supplied,
 * so they are baked in below (same approach as CHECK_TIMES in
 * migrate-resorts.ts). Public dates are stored EXACTLY as supplied: several are the eve
 * of the gazetted holiday (Labour Day 30/04, National Day 30/08, Christmas 24/12) and
 * that is intentional — do not "correct" them.
 *
 * Idempotent — upserts on the [holidayType, startDate, description] compound unique, so
 * re-running never duplicates. Note the start date is part of the key: if staff have moved
 * a seeded holiday to a different date, the seed re-creates its original row rather than
 * updating the corrected one (unchanged behaviour from the two seeds this replaces).
 *
 * Run: npx ts-node --transpile-only prisma/seed-holidays.ts
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

const DAY_MS = 86_400_000;

// [day, month, year, description] — as supplied by the business
const PUBLIC_HOLIDAYS: [number, number, number, string][] = [
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

// [startDay, startMonth, endDay, endMonth, academicYear, description]
// Note the mid-year and term-2 breaks cross a month boundary.
const SCHOOL_HOLIDAYS: [number, number, number, number, number, string][] = [
  [21, 3,  29, 3,  2026, 'TERM 1 SCHOOL HOLIDAYS'],
  [23, 5,  7,  6,  2026, 'MID YEAR SCHOOL HOLIDAYS'],
  [29, 8,  6,  9,  2026, 'TERM 2 SCHOOL HOLIDAYS'],
  [5,  12, 31, 12, 2026, 'END OF SCHOOL YEAR HOLIDAYS'],
];

interface Row {
  holidayType: 'PUBLIC' | 'SCHOOL';
  startDate: Date;
  endDate: Date | null;
  year: number;
  description: string;
}

// PUBLIC: single UTC-midnight date, year = the date's year.
const publicRows: Row[] = PUBLIC_HOLIDAYS.map(([day, month, year, description]) => ({
  holidayType: 'PUBLIC',
  startDate: new Date(Date.UTC(year, month - 1, day)),
  endDate: null,
  year,
  description,
}));

// SCHOOL: UTC-midnight range, year = the academic year. The end month/year are taken from
// the tuple, so a range crossing into the next calendar year would still need its own handling.
const schoolRows: Row[] = SCHOOL_HOLIDAYS.map(([sd, sm, ed, em, academicYear, description]) => ({
  holidayType: 'SCHOOL',
  startDate: new Date(Date.UTC(academicYear, sm - 1, sd)),
  endDate: new Date(Date.UTC(academicYear, em - 1, ed)),
  year: academicYear,
  description,
}));

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  const rows = [...publicRows, ...schoolRows];
  let created = 0;
  let existing = 0;

  for (const r of rows) {
    const key = {
      holidayType_startDate_description: {
        holidayType: r.holidayType,
        startDate: r.startDate,
        description: r.description,
      },
    };

    const before = await prisma.holiday.findUnique({ where: key, select: { id: true } });

    await prisma.holiday.upsert({
      where:  key,
      update: { endDate: r.endDate, year: r.year, updatedAt: new Date() },
      create: {
        id: randomUUID(),
        holidayType: r.holidayType,
        startDate: r.startDate,
        endDate: r.endDate,
        year: r.year,
        description: r.description,
        updatedAt: new Date(),
      },
    });

    if (before) existing++; else created++;

    if (r.endDate) {
      const days = (r.endDate.getTime() - r.startDate.getTime()) / DAY_MS + 1;
      console.log(`  SCHOOL  ${iso(r.startDate)} -> ${iso(r.endDate)}  (${days} days)  ${r.description}`);
    } else {
      console.log(`  PUBLIC  ${iso(r.startDate)}                ${r.description}`);
    }
  }

  const total = await prisma.holiday.count();
  console.log(`\n✔ ${rows.length} holidays seeded (${created} new, ${existing} already present).`);
  console.log(`  Holiday now holds ${total} record(s).`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
