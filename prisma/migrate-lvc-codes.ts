/**
 * LHB MMS — LVC (Leisure Vacation Club) Exchange Code Migration
 * Source: migrate/lvc_master.txt — pipe-delimited Informix UNLOAD
 *
 *   UNLOAD TO 'lvc_master.txt' DELIMITER '|' SELECT * FROM lvc_master;
 *
 * An LVC code names an exchange programme — the arrangement under which a member of
 * one product books a resort belonging to another product or an external partner
 * (LVC-CP: coCode 03/15 <-> 02; LVC-SGI / LVC-CLC: into a partner's resorts).
 *
 * The source table has 14 columns; only the FIRST 7 are migrated (business decision):
 *
 *  [0] lvc_code      -> lvcCode   (e.g. 'LVC-CP')
 *  [1] lvc_cocode    -> coCode    (references ps_company.psc_cocode -> Product.coCode; all 23
 *                                  rows resolve against the full 29-row ps_company export)
 *  [2] lvc_name      -> lvcName
 *  [3] lvc_status    -> status    (A=Active, U=Inactive; defaults to A when blank).
 *                                 Informix also uses 'C' (Cancelled) -- MAPPED TO 'U',
 *                                 the same way migrate-resorts.ts maps re_resort_status
 *                                 'I' -> 'U' for this codebase's A/U convention. The
 *                                 2026-08-27 export was 11 A / 11 C; before that mapping
 *                                 existed all 11 C rows were SKIPPED as unknown statuses.
 *  [4] lvc_incoming  -> incoming  ) running counters owned by the exchange process --
 *  [5] lvc_outgoing  -> outgoing  ) imported so no data is lost, but never written by
 *  [6] lvc_fax_batch -> faxBatch  ) the CRUD screen and not shown there
 *
 *  NOT migrated: [7] user_create, [8] date_create, [9] user_modify, [10] date_modify,
 *  [11] user_cancel, [12] date_cancel, [13] lock_status.
 *  (trailing empty field, so NF=15)
 *
 * The three counters are exported as FLOAT strings ("519.0") even though the column is
 * decimal(5,0) -- parse with Math.round(parseFloat(...)), same trap migrate-cp-season-points.ts
 * documents for pssa_year ("2000.0").
 *
 * Names are imported VERBATIM including source typos (LVC-RR is 'ROYAL RESORTS GROU[P',
 * LVC-AWT is 'ABSOLUTE WORL TRAVEL LTD'). Staff correct them through the CRUD screen;
 * rewriting them here would make a re-import disagree with Informix.
 *
 * 23 rows as of the go-live export. Post-go-live LVC codes are maintained in MMS, so
 * re-running clobbers app edits.
 *
 * Does NOT truncate — the caller does (migrate-table.ps1 -Table LvcCode,
 * refresh-test-db.ts), matching migrate-products.ts.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-lvc-codes.ts
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

const STATUSES = new Set(['A', 'U']);

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

// decimal(5,0) columns are exported as float strings ("519.0") -- round back to Int
const n = (s: string | undefined): number => {
  const v = parseFloat((s ?? '').trim());
  return Number.isFinite(v) ? Math.round(v) : 0;
};

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
  console.log('LHB MMS — LVC Exchange Code Migration (lvc_master.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  let total = 0, skipped = 0;
  const counts: Record<string, number> = { A: 0, U: 0 };
  const batch: any[] = [];

  for await (const c of readLines('lvc_master.txt')) {
    const lvcCode = t(c[0]);
    const lvcName = t(c[2]);
    const raw     = (t(c[3]) ?? 'A').toUpperCase();
    // Informix 'C' (Cancelled) -> this codebase's 'U' (Inactive), mirroring the
    // re_resort_status 'I' -> 'U' mapping in migrate-resorts.ts.
    const status  = raw === 'C' ? 'U' : raw;

    if (!lvcCode || !lvcName) {
      console.log(`  WARN missing code/name on "${c.slice(0, 3).join('|')}" — skipped`);
      skipped++;
      continue;
    }
    if (!STATUSES.has(status)) {
      console.log(`  WARN unknown status "${c[3]}" on ${lvcCode} — skipped`);
      skipped++;
      continue;
    }

    batch.push({
      id:        randomUUID(),
      updatedAt: new Date(),
      lvcCode,
      coCode:    t(c[1]),
      lvcName,
      status,
      incoming:  n(c[4]),
      outgoing:  n(c[5]),
      faxBatch:  n(c[6]),
    });
    counts[status]++;
    total++;
  }

  if (!DRY_RUN && batch.length) {
    await prisma.lvcCode.createMany({ data: batch, skipDuplicates: true });
  }

  console.log(`\n  OK LVC codes: ${total} inserted, ${skipped} skipped`);
  console.log(`     Active ${counts.A}, Inactive ${counts.U}`);

  if (!DRY_RUN) {
    const rows = await prisma.lvcCode.findMany({ orderBy: { lvcCode: 'asc' } });
    console.log(`  DB count: ${rows.length}`);
    for (const r of rows) {
      console.log(`     ${r.lvcCode.padEnd(8)} ${(r.coCode ?? '--').padEnd(3)} ${r.status}  ` +
                  `in ${String(r.incoming).padStart(6)}  out ${String(r.outgoing).padStart(6)}  ` +
                  `fax ${String(r.faxBatch).padStart(5)}  ${r.lvcName}`);
    }
  }

  console.log('\nLVC exchange code migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
