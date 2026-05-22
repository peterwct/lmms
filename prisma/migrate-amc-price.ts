/**
 * Migrate AMC price master from migrate/amc_price.txt into AmcPrice table.
 *
 * File format (pipe-delimited):
 *  [0]  coCode          [5]  sinkingFund     [10] rate
 *  [1]  effectiveDate   [6]  serviceTax      [11] user_create
 *  [2]  priceCode       [7]  totalAmount     [12] date_create
 *  [3]  currencyCode    [8]  (duplicate)     [15] status
 *  [4]  amcAmount       [9]  amountInWords
 *
 * Run: npx ts-node prisma/migrate-amc-price.ts
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

const parseDate = (s: string): Date => {
  const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return new Date(s.trim());
};

const dec = (s: string): number => parseFloat(s.trim());

async function main() {
  const lines = fs.readFileSync(
    path.join(__dirname, '..', 'migrate', 'amc_price.txt'),
    'utf8'
  ).split('\n').filter(l => l.trim());

  let upserted = 0;
  for (const line of lines) {
    const c = line.split('|');
    const coCode       = c[0]?.trim();
    const effectiveDate = parseDate(c[1] ?? '');
    const priceCode    = c[2]?.trim();
    const currencyCode = c[3]?.trim() || null;
    const amcAmount    = dec(c[4] ?? '0');
    const sinkingFund  = dec(c[5] ?? '0');
    const serviceTax   = dec(c[6] ?? '0');
    const totalAmount  = dec(c[7] ?? '0');
    const amountInWords = c[9]?.trim() || null;
    const rate         = dec(c[10] ?? '1');

    if (!coCode || !priceCode) continue;

    await prisma.amcPrice.upsert({
      where: { coCode_priceCode_effectiveDate: { coCode, priceCode, effectiveDate } },
      update: { currencyCode, amcAmount, sinkingFund, serviceTax, totalAmount, amountInWords, rate },
      create: { coCode, effectiveDate, priceCode, currencyCode, amcAmount, sinkingFund, serviceTax, totalAmount, amountInWords, rate },
    });

    console.log(`  ✔ coCode=${coCode} | priceCode=${priceCode} | effective=${effectiveDate.toISOString().slice(0,10)} | AMC=${amcAmount} | Sink=${sinkingFund} | Tax=${serviceTax} | Total=${totalAmount}`);
    upserted++;
  }

  const total = await prisma.amcPrice.count();
  console.log(`\n✔ Upserted ${upserted} records. Table total: ${total}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
