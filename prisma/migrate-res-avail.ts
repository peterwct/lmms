/**
 * LHB MMS — Resort Availability (per-day grid) Migration
 * Source: migrate/res_avail_mast.txt — pipe-delimited Informix UNLOAD
 *
 * The Informix res_avail_mast table has 7 columns; only [0..4] are migrated
 * (rel_night[5] and lock_status[6] skipped per business decision):
 *  [0] ram_resort_code -> resortCode
 *  [1] ram_apt_type    -> apartmentType (SLEEP2/4/6, 1BR, 3BR, ... = ApartmentType.apartmentType)
 *  [2] ram_date        -> date (dd-mm-yyyy, UTC midnight)
 *  [3] ram_act_night   -> actNight (count of units of that type available that day)
 *  [4] ram_bal_night   -> balNight (act minus bookings)
 *
 * Unique key: (resortCode, apartmentType, date) — matches Informix ram_idx1.
 * ~94,876 rows -> chunked createMany. Direct load; NOT regenerated from apt_block.
 *
 * Run: npx ts-node --transpile-only prisma/migrate-res-avail.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const MIGRATE_DIR = path.join(__dirname, '..', 'migrate');
const DELIM = '|';
const CHUNK = 5000;
const DRY_RUN = process.argv.includes('--dry-run');

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

// Informix dd-mm-yyyy -> UTC-midnight Date (business-date convention)
const d = (s: string | undefined): Date | null => {
  const str = (s ?? '').trim();
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const dt = new Date(`${m[3]}-${m[2]}-${m[1]}`);
  return isNaN(dt.getTime()) ? null : dt;
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

async function flush(batch: any[]): Promise<void> {
  if (DRY_RUN || batch.length === 0) return;
  await prisma.resAvailMast.createMany({ data: batch, skipDuplicates: true });
  batch.length = 0;
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — Resort Availability Migration (res_avail_mast.txt)');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log('='.repeat(60));

  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true } });
  const idByCode = new Map(resorts.map(r => [r.resortCode, r.id]));

  let total = 0, skipped = 0;
  const batch: any[] = [];

  for await (const c of readLines('res_avail_mast.txt')) {
    const resortCode = t(c[0]);
    const apartmentType = t(c[1]);
    const date = d(c[2]);
    const actNight = parseInt((c[3] ?? '').trim(), 10);
    const balNight = parseInt((c[4] ?? '').trim(), 10);

    if (!resortCode || !apartmentType || !date || Number.isNaN(actNight) || Number.isNaN(balNight)) {
      skipped++;
      continue;
    }

    const resortId = idByCode.get(resortCode);
    if (!resortId) {
      skipped++;
      continue;
    }

    batch.push({
      id:        randomUUID(),
      updatedAt: new Date(),
      resortId,
      resortCode,
      apartmentType,
      date,
      actNight,
      balNight,
    });
    total++;

    if (batch.length >= CHUNK) await flush(batch);
  }
  await flush(batch);

  console.log(`\n  OK Availability rows: ${total} inserted, ${skipped} skipped`);

  if (!DRY_RUN) {
    const count = await prisma.resAvailMast.count();
    console.log(`  DB count: ${count}`);
  }

  console.log('\nResort availability migration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
