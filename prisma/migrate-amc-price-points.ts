/**
 * Delete all AmcPricePoints and reload from migrate/ps_ctrltab.txt
 *
 * Column mapping:
 *  [0]  coCode           [7]  amcRatePerPoint
 *  [1]  effectiveDate    [8]  sinkingFundPct
 *  [2]  minPoints        [9]  gstPct
 *  [3]  maxPoints        [12] rciPoints
 *  [6]  unitPrice
 *
 * Run: npx ts-node prisma/migrate-amc-price-points.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const parseDate = (s: string): Date => {
  const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return new Date(s.trim());
};

async function main() {
  // Delete all existing records
  const deleted = await prisma.amcPricePoints.deleteMany();
  console.log(`Deleted ${deleted.count} existing records.`);

  const lines = fs.readFileSync(
    path.join(__dirname, '..', 'migrate', 'ps_ctrltab.txt'),
    'utf8'
  ).split('\n').filter(l => l.trim());

  let inserted = 0;
  for (const line of lines) {
    const c = line.split('|');
    const coCode       = c[0]?.trim();
    const effectiveDate = parseDate(c[1] ?? '');
    const minPoints    = parseInt(c[2]?.trim() ?? '0', 10);
    const maxPoints    = parseInt(c[3]?.trim() ?? '0', 10);
    const unitPrice    = parseFloat(c[6]?.trim() ?? '0') || null;
    const amcRatePerPoint = parseFloat(c[7]?.trim() ?? '0');
    const sinkingFundPct  = parseFloat(c[8]?.trim() ?? '0');
    const gstPct          = parseFloat(c[9]?.trim() ?? '0');
    const rciPoints       = parseInt(c[12]?.trim() ?? '0', 10) || null;

    if (!coCode || !minPoints) continue;

    await prisma.amcPricePoints.create({
      data: {
        id: randomUUID(),
        updatedAt: new Date(),
        coCode, effectiveDate,
        minPoints, maxPoints,
        unitPrice, amcRatePerPoint,
        sinkingFundPct, gstPct,
        rciPoints,
      },
    });

    console.log(`  ✔ coCode=${coCode} | pts=${minPoints}-${maxPoints} | rate=${amcRatePerPoint} | sf=${sinkingFundPct}% | gst=${gstPct}% | unit=${unitPrice} | rci=${rciPoints}`);
    inserted++;
  }

  const total = await prisma.amcPricePoints.count();
  console.log(`\n✔ Inserted ${inserted} records. Table total: ${total}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
