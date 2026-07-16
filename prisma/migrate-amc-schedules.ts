/**
 * LHB MMS — AMC Schedules Migration
 * Sources:
 *   migrate/amc_mem.txt    — LHC (coCode 03 & 15), pipe-delimited, 23,582 rows
 *   migrate/ps_amc_mem.txt — CP  (coCode 02),       pipe-delimited,  9,002 rows
 *
 * Column mapping — amc_mem.txt:
 *  [0] mem_no          → membershipNo
 *  [1] agmt_no         → agreementNo (trimmed)
 *  [2] cocode          → coCode
 *  [3] first_due       → firstDueDate    (dd-mm-yyyy)
 *  [4] next_due        → nextDueDate     (dd-mm-yyyy)
 *  [5] last_invdate    → lastInvoiceDate (dd-mm-yyyy)
 *  [6] no_of_inv       → invoicesIssued  (float → int)
 *  [7] ttl_inv         → totalInvoices
 *  [8] price_code      → priceCode       (M | S | I)
 *  [9] date_create     → legacyCreatedAt
 *
 * Column mapping — ps_amc_mem.txt:
 *  [0] psamc_memno      → membershipNo
 *  [1] psamc_agmtno     → agreementNo (trimmed)
 *  [2] psamc_cocode     → coCode (02)
 *  [3] psamc_first_due  → firstDueDate
 *  [4] psamc_next_due   → nextDueDate
 *  [5] psamc_last_invdate → lastInvoiceDate
 *  [6] psamc_no_of_inv  → invoicesIssued
 *  [7] psamc_ttl_inv    → totalInvoices
 *  [8] psamc_datecreate → legacyCreatedAt
 *
 * Run: npx ts-node prisma/migrate-amc-schedules.ts
 *      npx ts-node prisma/migrate-amc-schedules.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma  = new PrismaClient();
const MIGRATE = path.join(__dirname, '..', 'migrate');
const BATCH   = 500;
const DRY_RUN = process.argv.includes('--dry-run');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

const d = (s: string): Date | null => {
  const str = s.trim();
  if (!str) return null;
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (m) {
    const dt = new Date(`${m[3]}-${m[2]}-${m[1]}`);
    return isNaN(dt.getTime()) ? null : dt;
  }
  return null;
};

const intVal = (s: string): number =>
  Math.round(parseFloat(s.trim()) || 0);

async function readFile(filepath: string): Promise<string[][]> {
  const rows: string[][] = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(filepath, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    rows.push(line.split('|'));
  }
  return rows;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — AMC Schedules Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  // ── 1. Build agreement lookup: "coCode:agreementNo" → agreementId ──────────
  console.log('\n[1/4] Building agreement lookup map...');
  const agmtMap = new Map<string, string>();
  if (!DRY_RUN) {
    let offset = 0;
    while (true) {
      const rows = await prisma.agreement.findMany({
        select: { id: true, coCode: true, agreementNo: true },
        skip: offset, take: 5000,
      });
      if (!rows.length) break;
      rows.forEach(r => agmtMap.set(`${r.coCode}:${r.agreementNo}`, r.id));
      offset += rows.length;
    }
    console.log(`  ✔ ${agmtMap.size} agreements indexed`);
  }

  let totalImported = 0, totalNotFound = 0;

  const flush = async (batch: object[]) => {
    if (DRY_RUN || !batch.length) return;
    await prisma.amcSchedule.createMany({ data: batch as any, skipDuplicates: true });
  };

  // ── 2. Import amc_mem.txt (LHC) ────────────────────────────────────────────
  console.log('\n[2/4] Reading amc_mem.txt (LHC)...');
  const lhcRows = await readFile(path.join(MIGRATE, 'amc_mem.txt'));
  let lhcImported = 0, lhcNotFound = 0;
  let batch: object[] = [];

  for (const c of lhcRows) {
    const membershipNo = t(c[0]);
    const agreementNo  = t(c[1]);
    const coCode       = t(c[2]);
    if (!membershipNo || !agreementNo || !coCode) continue;

    let agreementId = 'dry-run';
    if (!DRY_RUN) {
      agreementId = agmtMap.get(`${coCode}:${agreementNo}`) ?? '';
      if (!agreementId) { lhcNotFound++; continue; }
    }

    const lhcInvoicesIssued = intVal(c[6] ?? '0');
    const lhcTotalInvoices  = intVal(c[7] ?? '0');
    batch.push({
      id:              randomUUID(),
      updatedAt:       new Date(),
      agreementId,
      membershipNo,
      agreementNo,
      coCode,
      firstDueDate:    d(c[3] ?? ''),
      // Fully-billed schedules have no next due — leave null so they're never re-billed (over-billing guard)
      nextDueDate:     lhcInvoicesIssued >= lhcTotalInvoices ? null : d(c[4] ?? ''),
      lastInvoiceDate: d(c[5] ?? ''),
      invoicesIssued:  lhcInvoicesIssued,
      totalInvoices:   lhcTotalInvoices,
      priceCode:       t(c[8]),
      billingStatus:   'N',
      legacyCreatedAt: d(c[9] ?? ''),
    });
    lhcImported++;

    if (batch.length >= BATCH) {
      await flush(batch);
      batch = [];
      process.stdout.write(`\r  LHC: ${lhcImported} processed...`);
    }
  }
  await flush(batch);
  batch = [];
  console.log(`\n  ✔ LHC imported: ${lhcImported}, not found: ${lhcNotFound}`);
  totalImported += lhcImported;
  totalNotFound += lhcNotFound;

  // ── 3. Import ps_amc_mem.txt (CP) ──────────────────────────────────────────
  console.log('\n[3/4] Reading ps_amc_mem.txt (CP)...');
  const cpRows = await readFile(path.join(MIGRATE, 'ps_amc_mem.txt'));
  let cpImported = 0, cpNotFound = 0;

  for (const c of cpRows) {
    const membershipNo = t(c[0]);
    const agreementNo  = t(c[1]);
    const coCode       = t(c[2]);
    if (!membershipNo || !agreementNo || !coCode) continue;

    let agreementId = 'dry-run';
    if (!DRY_RUN) {
      agreementId = agmtMap.get(`${coCode}:${agreementNo}`) ?? '';
      if (!agreementId) { cpNotFound++; continue; }
    }

    const cpInvoicesIssued = intVal(c[6] ?? '0');
    const cpTotalInvoices  = intVal(c[7] ?? '0');
    batch.push({
      id:              randomUUID(),
      updatedAt:       new Date(),
      agreementId,
      membershipNo,
      agreementNo,
      coCode,
      firstDueDate:    d(c[3] ?? ''),
      // Fully-billed schedules have no next due — leave null so they're never re-billed (over-billing guard)
      nextDueDate:     cpInvoicesIssued >= cpTotalInvoices ? null : d(c[4] ?? ''),
      lastInvoiceDate: d(c[5] ?? ''),
      invoicesIssued:  cpInvoicesIssued,
      totalInvoices:   cpTotalInvoices,
      priceCode:       null,
      billingStatus:   'N',
      legacyCreatedAt: d(c[8] ?? ''),
    });
    cpImported++;

    if (batch.length >= BATCH) {
      await flush(batch);
      batch = [];
      process.stdout.write(`\r  CP: ${cpImported} processed...`);
    }
  }
  await flush(batch);
  console.log(`\n  ✔ CP imported: ${cpImported}, not found: ${cpNotFound}`);
  totalImported += cpImported;
  totalNotFound += cpNotFound;

  // ── 4. Validation ───────────────────────────────────────────────────────────
  console.log('\n[4/4] Validation...');
  if (!DRY_RUN) {
    const [total, byCode] = await Promise.all([
      prisma.amcSchedule.count(),
      prisma.amcSchedule.groupBy({ by: ['coCode'], _count: true, orderBy: { coCode: 'asc' } }),
    ]);
    console.log(`\n  ┌──────────────────────────────────────┐`);
    console.log(`  │  Total AMC schedules : ${String(total).padStart(8)}        │`);
    byCode.forEach(r =>
      console.log(`  │  coCode ${r.coCode}           : ${String(r._count).padStart(8)}        │`));
    console.log(`  │  Not matched        : ${String(totalNotFound).padStart(8)}        │`);
    console.log(`  └──────────────────────────────────────┘`);
  } else {
    console.log(`\n  DRY RUN: LHC rows=${lhcImported}, CP rows=${cpImported}`);
  }

  console.log('\nAMC schedule migration complete.\n');
}

main()
  .catch(e => { console.error('Migration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
