/**
 * LHB MMS — Product / Company Master Migration
 * Source: migrate/ps_company.txt — pipe-delimited Informix UNLOAD
 *
 *   UNLOAD TO 'ps_company.txt' DELIMITER '|' SELECT * FROM ps_company;
 *
 * The source table has 17 columns; only the FIRST 9 are migrated (business decision):
 *
 *  [0] psc_cocode   -> coCode        ('02'=CP, '03'/'15'=LHC, 20/24/25/26=exchange partners)
 *  [1] psc_coname   -> coName
 *  [2] psc_enttype  -> entType       (W=Week, P=Points; any other value skipped with a WARN)
 *  [3] psc_coaddr1  -> add1
 *  [4] psc_coaddr2  -> add2
 *  [5] psc_coaddr3  -> add3
 *  [6] psc_cotel    -> telNo
 *  [7] psc_cofax    -> faxNo
 *  [8] psc_contact  -> contactPerson
 *
 *  NOT migrated: [9] psc_coincode, [10] psc_invt, [11] psc_arco (accounting/invoicing codes),
 *  [12-15] psc_usercreate/datecreate/usermodify/datemodify, [16] psc_lockstatus.
 *  (trailing empty field, so NF=18)
 *
 * 7 rows as of the go-live export. This master is CRUD-maintained in MMS after go-live,
 * so re-running clobbers app edits.
 *
 * Does NOT truncate — the caller does (migrate-table.ps1 -Table Product,
 * refresh-test-db.ps1), matching migrate-cp-seasons.ts.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-products.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const MIGRATE_DIR = path.join(__dirname, '..', 'migrate');
const DELIM = '|';
const DRY_RUN = process.argv.includes('--dry-run');

const ENT_TYPES = new Set(['W', 'P']);

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

async function* readLines(filename: string): AsyncGenerator<string[]> {
  const fp = path.join(MIGRATE_DIR, filename);
  if (!fs.existsSync(fp)) throw new Error(`File not found: ${fp}`);
  const rl = readline.createInterface({
    input: fs.createReadStream(fp, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    yield line.split(DELIM);
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — Product / Company Master Migration (ps_company.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  let total = 0, skipped = 0;
  const counts: Record<string, number> = { W: 0, P: 0 };
  const batch: any[] = [];

  for await (const c of readLines('ps_company.txt')) {
    const coCode  = t(c[0]);
    const coName  = t(c[1]);
    const entType = (t(c[2]) ?? '').toUpperCase();

    if (!coCode || !coName) {
      console.log(`  WARN missing code/name on "${c.slice(0, 3).join('|')}" — skipped`);
      skipped++;
      continue;
    }
    if (!ENT_TYPES.has(entType)) {
      console.log(`  WARN unknown entitlement type "${c[2]}" on ${coCode} — skipped`);
      skipped++;
      continue;
    }

    batch.push({
      id:            randomUUID(),
      updatedAt:     new Date(),
      coCode,
      coName,
      entType,
      add1:          t(c[3]),
      add2:          t(c[4]),
      add3:          t(c[5]),
      telNo:         t(c[6]),
      faxNo:         t(c[7]),
      contactPerson: t(c[8]),
    });
    counts[entType]++;
    total++;
  }

  if (!DRY_RUN && batch.length) {
    await prisma.product.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`\n  OK products: ${total} inserted, ${skipped} skipped`);
  console.log(`     Week ${counts.W}, Points ${counts.P}`);

  if (!DRY_RUN) {
    const rows = await prisma.product.findMany({ orderBy: { coCode: 'asc' } });
    console.log(`  DB count: ${rows.length}`);
    for (const r of rows) console.log(`     ${r.coCode}  ${r.entType}  ${r.coName}`);
  }

  console.log('\nProduct master migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
