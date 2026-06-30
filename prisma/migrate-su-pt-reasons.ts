/**
 * LHB MMS — SU/PT Reason Backfill
 * Source: migrate/su_trans.txt (7,785 rows), migrate/pt_trans.txt (11,947 rows)
 *         Both pipe-delimited: [0] membershipNo  [1] agreementNo  [2] code
 *
 * su_trans.txt -> Agreement.suCode  (only if current acctClassify === 'SU')
 * pt_trans.txt -> Agreement.canCode (only if current acctClassify === 'PT'; OVERWRITES
 *                 any existing canCode — pt_trans.txt is authoritative; reuses the
 *                 existing CancellationReason table, same as TM)
 *
 * Both files contain historical rows for agreements no longer in that status
 * (reinstated to NA, transferred, etc.) — those are skipped so TM's existing
 * canCode is never touched, per business rule.
 *
 * Match key: membershipNo + agreementNo (NOT agreementNo alone — agreementNo is
 * duplicated across TT/TF transfer pairs; membershipNo disambiguates, see
 * "FK vs natural key" in CLAUDE.md).
 *
 * Run: npx ts-node --transpile-only prisma/migrate-su-pt-reasons.ts
 *      npx ts-node --transpile-only prisma/migrate-su-pt-reasons.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma  = new PrismaClient();
const MIGRATE_DIR = path.join(__dirname, '..', 'migrate');
const BATCH   = 500;
const DRY_RUN = process.argv.includes('--dry-run');

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

type AgmtInfo = { id: string; acctClassify: string };

async function buildAgreementMap(): Promise<Map<string, AgmtInfo>> {
  const map = new Map<string, AgmtInfo>();
  let offset = 0;
  while (true) {
    const rows = await prisma.agreement.findMany({
      select: { id: true, membershipNo: true, agreementNo: true, acctClassify: true },
      skip: offset, take: 5000,
    });
    if (!rows.length) break;
    rows.forEach(r => map.set(`${r.membershipNo}:${r.agreementNo}`, { id: r.id, acctClassify: r.acctClassify }));
    offset += rows.length;
  }
  return map;
}

async function processFile(
  filename: string,
  targetStatus: 'SU' | 'PT',
  buildData: (code: string) => Record<string, unknown>,
  agmtMap: Map<string, AgmtInfo>,
) {
  console.log(`\n--- ${filename} (target status: ${targetStatus}) ---`);
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(MIGRATE_DIR, filename), { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  let total = 0;
  let updated = 0;
  let skippedStatus = 0;
  let skippedNoMatch = 0;
  const batch: { id: string; data: Record<string, unknown> }[] = [];

  async function flushBatch() {
    if (!batch.length || DRY_RUN) { batch.length = 0; return; }
    await prisma.$transaction(
      batch.map(row =>
        prisma.agreement.update({
          where: { id: row.id },
          data: { ...row.data, updatedAt: new Date() },
        })
      )
    );
    batch.length = 0;
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = line.split('|');
    total++;

    const membershipNo = t(c[0]);
    const agreementNo  = t(c[1]);
    const code         = t(c[2]);

    if (!membershipNo || !agreementNo || !code) { skippedNoMatch++; continue; }

    const agmt = agmtMap.get(`${membershipNo}:${agreementNo}`);
    if (!agmt) { skippedNoMatch++; continue; }

    if (agmt.acctClassify !== targetStatus) { skippedStatus++; continue; }

    batch.push({ id: agmt.id, data: buildData(code) });
    updated++;
    if (batch.length >= BATCH) {
      await flushBatch();
      if (updated % 2000 < BATCH) process.stdout.write(`  ... ${updated} updated\r`);
    }
  }

  await flushBatch();

  console.log(`  Total rows read : ${total}`);
  console.log(`  Updated         : ${updated}`);
  console.log(`  Skipped (status mismatch) : ${skippedStatus}`);
  console.log(`  Skipped (no match)        : ${skippedNoMatch}`);
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — SU/PT Reason Backfill');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  console.log('\n[1/3] Building agreement lookup map...');
  const agmtMap = await buildAgreementMap();
  console.log(`  ${agmtMap.size} agreements indexed`);

  console.log('\n[2/3] Processing su_trans.txt -> Agreement.suCode...');
  await processFile('su_trans.txt', 'SU', code => ({ suCode: code }), agmtMap);

  console.log('\n[3/3] Processing pt_trans.txt -> Agreement.canCode...');
  await processFile('pt_trans.txt', 'PT', code => ({ canCode: code.padStart(2, '0') }), agmtMap);

  console.log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
