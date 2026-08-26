/**
 * LHB MMS - RCI Bulk Bank Migration
 * Source: migrate/bulk_bank.txt  (pipe-delimited, 35,928 rows, no header)
 *
 * Loads Informix `bulk_bank` into the RciBulkBank table (RCI fn 3, Bulk Bank).
 * One row = ONE RCI WEEK of ONE qualifying unit deposited into the RCI exchange network.
 *
 * The file is 10 columns + a trailing empty field, so NF=11. Only [0..6] are migrated:
 *  [0] bb_serial_no    -> serialNo    (Informix serial, unique index ix510_1)
 *  [1] bb_resort_code  -> resortCode
 *  [2] bb_apt_code     -> unitNo      (incl. compound lock-off codes "3201/3202")
 *  [3] bb_checkin      -> checkIn     (dd-mm-yyyy -> UTC midnight; always a Friday)
 *  [4] bb_checkout     -> checkOut    (= checkIn + 6 days, i.e. the LAST NIGHT)
 *  [5] bb_time_colour  -> season      1->'B' Blue, 2->'W' White, 3->'R' Red
 *  [6] bb_status       -> bankStatus  (provenance only; rendered nowhere and absent from
 *                                      the CRUD zod schema - LvcCode counters precedent)
 *  [7] bb_user_name        NOT migrated (business decision)
 *  [8] bb_sys_date         NOT migrated (business decision)
 *  [9] bb_lock_status      NOT migrated (business decision; 'U' on every row)
 *
 * ONLY CHECK-IN YEARS >= MIN_YEAR (2026) ARE IMPORTED (business decision, mirroring
 * migrate-rci-week.ts). That is 771 of 35,928 rows: 2026 = 459, 2027 = 312, spanning
 * 2026-01-02 .. 2027-12-24 over 9 units at CP-PBR / L-10024 / L-10026, all of which
 * already carry rciReserved='Y'. Verified across those 771: check-in is a Friday on every
 * row, checkOut - checkIn = 6 on every row, all 771 check-in dates match an
 * RciWeek.friStart exactly, and there are zero duplicates on the bb_idx1 key.
 *
 * weekYear/weekNo are DENORMALIZED from the RciWeek match (friStart == checkIn), so this
 * script must run AFTER migrate-rci-week.ts, and after migrate-resorts.ts (the FK) and
 * migrate-resort-units.ts (the apartmentType + rciReserved lookup).
 *
 * *** THIS SCRIPT DOES NOT TOUCH ResAvailMast. ***
 * res_avail_mast.txt was exported from Informix with the bulk-bank weeks ALREADY deducted
 * from ram_bal_night - the same trap as maintenance (verified: L-10026/2BR/2026-01-02
 * shows act=14 bal=0 with only one maintenance record on the resort). Applying grid deltas
 * here would double-count. Deltas happen only on app CRUD, in
 * backend/src/controllers/rci-bulk-bank.controller.ts.
 *
 * UNLOAD: UNLOAD TO 'bulk_bank.txt' DELIMITER '|' SELECT * FROM bulk_bank;
 *
 * Run: npx ts-node --transpile-only prisma/migrate-rci-bulk-bank.ts
 *      npx ts-node --transpile-only prisma/migrate-rci-bulk-bank.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma   = new PrismaClient();
const FILE     = path.join(__dirname, '..', 'migrate', 'bulk_bank.txt');
const BATCH    = Number(process.env.MIGRATE_BATCH) || 100;
const MIN_YEAR = 2026;
const DRY_RUN  = process.argv.includes('--dry-run');
const DAY_MS   = 86_400_000;
const WEEK_SPAN_DAYS = 6; // checkOut - checkIn

// bb_time_colour is a smallint; anything outside this map is a data problem.
// Business mapping (confirmed 2026-08-26): 1=Blue, 2=White, 3=Red.
const SEASON_BY_COLOUR: Record<number, string> = { 1: 'B', 2: 'W', 3: 'R' };

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

// Informix dates are dd-mm-yyyy; business dates are stored at UTC midnight.
const d = (s: string | undefined): Date | null => {
  if (!s || !s.trim()) return null;
  const m = s.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return isNaN(dt.getTime()) ? null : dt;
};

// Numeric columns can export as float strings ("2000.0") - the pssa_year / LvcCode trap.
const int = (s: string | undefined): number | null => {
  const v = t(s);
  if (v === null) return null;
  const n = Math.round(parseFloat(v));
  return isNaN(n) ? null : n;
};

const iso = (dt: Date) => dt.toISOString().slice(0, 10);

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS - RCI Bulk Bank Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN' : '  MODE: LIVE');
  console.log(`  Importing check-in years >= ${MIN_YEAR}`);
  console.log('='.repeat(60));

  if (!fs.existsSync(FILE)) {
    console.error(`\n  ERROR: ${FILE} not found.`);
    process.exit(1);
  }

  // ---- Lookup maps, built before the read -------------------------------------------
  const resorts = await prisma.resort.findMany({ select: { id: true, resortCode: true } });
  const idByCode = new Map(resorts.map(r => [r.resortCode, r.id]));

  const units = await prisma.resortUnit.findMany({
    select: { resortCode: true, unitNo: true, apartmentType: true, rciReserved: true },
  });
  const unitByKey = new Map(units.map(u => [`${u.resortCode}|${u.unitNo}`, u]));

  const weeks = await prisma.rciWeek.findMany({ select: { year: true, weekNo: true, friStart: true } });
  const weekByFri = new Map<string, { year: number; weekNo: number }>();
  let weekCollisions = 0;
  for (const w of weeks) {
    const k = iso(w.friStart);
    // Friday start dates are globally distinct across years - detect rather than assume.
    if (weekByFri.has(k)) weekCollisions++;
    else weekByFri.set(k, { year: w.year, weekNo: w.weekNo });
  }
  console.log(`\n  Lookups: ${idByCode.size} resorts, ${unitByKey.size} units, ${weekByFri.size} RCI weeks`);
  if (weekCollisions) console.log(`  WARN: ${weekCollisions} RciWeek rows share a friStart - first wins`);
  if (weekByFri.size === 0) {
    console.log('  WARN: RciWeek is empty - every row will import with weekYear/weekNo null.');
    console.log('        Run migrate-rci-week.ts first.');
  }

  if (!DRY_RUN) {
    console.log('\n[1/3] Clearing RciBulkBank...');
    const del = await prisma.rciBulkBank.deleteMany({});
    console.log(`  ${del.count} existing rows removed`);
  } else {
    console.log('\n[1/3] (dry run - table not cleared)');
  }

  console.log('\n[2/3] Reading bulk_bank.txt...');
  const rl = readline.createInterface({
    input: fs.createReadStream(FILE, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  let total = 0, loaded = 0, oldYear = 0, badRow = 0, badSeason = 0;
  let unknownResort = 0, unregisteredUnit = 0, dupKey = 0;
  let notRciReserved = 0, notFriday = 0, badSpan = 0, unresolvedWeek = 0;
  let maxSerial = 0;
  const perYear = new Map<number, number>();
  const perSeason = new Map<string, number>();
  const perUnit = new Map<string, number>();
  const seen = new Set<string>();
  const warns: string[] = [];
  let rows: any[] = [];

  const warn = (msg: string) => { if (warns.length < 10) warns.push(msg); };

  async function flush() {
    if (!rows.length) return;
    if (!DRY_RUN) await prisma.rciBulkBank.createMany({ data: rows, skipDuplicates: true });
    loaded += rows.length;
    rows = [];
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    const c = line.split('|');
    total++;

    const serialNo   = int(c[0]);
    const resortCode = t(c[1]);
    const unitNo     = t(c[2]);
    const checkIn    = d(c[3]);
    const checkOut   = d(c[4]);
    const colour     = int(c[5]);
    const bankStatus = t(c[6]) ?? 'B';

    if (serialNo === null || !resortCode || !unitNo || !checkIn || !checkOut) {
      badRow++;
      warn(`row ${total}: missing serial/resort/unit/date - skipped`);
      continue;
    }

    // The business filter. Old data is not migrated.
    if (checkIn.getUTCFullYear() < MIN_YEAR) { oldYear++; continue; }

    const season = colour === null ? undefined : SEASON_BY_COLOUR[colour];
    if (!season) {
      badSeason++;
      warn(`row ${total}: serial ${serialNo} has unknown bb_time_colour "${c[5]}" - skipped`);
      continue;
    }

    const resortId = idByCode.get(resortCode);
    if (!resortId) {
      unknownResort++;
      warn(`row ${total}: serial ${serialNo} names unknown resort ${resortCode} - skipped`);
      continue;
    }

    // The unit must be registered: apartmentType is the ResAvailMast grid key, and the CRUD
    // keeps resortCode/unitNo immutable, so a row with a null type could never be corrected
    // in the app and would be a permanently inert record. This deliberately differs from
    // migrate-maintenance.ts, which imports such rows with a null type.
    const unit = unitByKey.get(`${resortCode}|${unitNo}`);
    if (!unit) {
      unregisteredUnit++;
      warn(`row ${total}: serial ${serialNo} - unit ${resortCode}/${unitNo} is not in ResortUnit - skipped`);
      continue;
    }
    // The rciReserved='Y' rule is a SAVE-TIME rule (like fn 6's availability rule), so a
    // legacy row on a unit since un-flagged is imported verbatim with a warning.
    if (unit.rciReserved !== 'Y') {
      notRciReserved++;
      warn(`row ${total}: serial ${serialNo} - unit ${resortCode}/${unitNo} is not rciReserved=Y - imported anyway`);
    }

    // Shape checks: warn, never correct - a re-import must not disagree with Informix.
    // getUTCDay() puts Friday at 5 (Sunday = 0) - the one easy off-by-one here.
    if (checkIn.getUTCDay() !== 5) {
      notFriday++;
      warn(`row ${total}: serial ${serialNo} check-in ${iso(checkIn)} is not a Friday - imported as-is`);
    }
    if (checkOut.getTime() - checkIn.getTime() !== WEEK_SPAN_DAYS * DAY_MS) {
      badSpan++;
      warn(`row ${total}: serial ${serialNo} spans ${iso(checkIn)}..${iso(checkOut)}, not check-in + ${WEEK_SPAN_DAYS} - imported as-is`);
    }

    const wk = weekByFri.get(iso(checkIn));
    if (!wk) {
      unresolvedWeek++;
      warn(`row ${total}: serial ${serialNo} check-in ${iso(checkIn)} matches no RciWeek - weekYear/weekNo left null`);
    }

    const key = `${resortCode}|${unitNo}|${iso(checkIn)}|${iso(checkOut)}`;
    if (seen.has(key)) {
      dupKey++;
      warn(`row ${total}: serial ${serialNo} duplicates ${key} - skipped`);
      continue;
    }
    seen.add(key);

    if (serialNo > maxSerial) maxSerial = serialNo;
    const y = checkIn.getUTCFullYear();
    perYear.set(y, (perYear.get(y) ?? 0) + 1);
    perSeason.set(season, (perSeason.get(season) ?? 0) + 1);
    const uk = `${resortCode}/${unitNo}`;
    perUnit.set(uk, (perUnit.get(uk) ?? 0) + 1);

    rows.push({
      id: randomUUID(),
      serialNo,
      resortId,
      resortCode,
      unitNo,
      apartmentType: unit.apartmentType,
      checkIn,
      checkOut,
      weekYear: wk?.year ?? null,
      weekNo: wk?.weekNo ?? null,
      season,
      bankStatus,
      updatedAt: new Date(),
    });

    if (rows.length >= BATCH) await flush();
  }

  await flush();

  console.log('\n[3/3] Summary');
  console.log(`  Total rows read              : ${total}`);
  console.log(`  Skipped (check-in < ${MIN_YEAR})   : ${oldYear}`);
  console.log(`  Skipped (bad data)           : ${badRow}`);
  console.log(`  Skipped (unknown season)     : ${badSeason}`);
  console.log(`  Skipped (unknown resort)     : ${unknownResort}`);
  console.log(`  Skipped (unit not registered): ${unregisteredUnit}`);
  console.log(`  Skipped (duplicate key)      : ${dupKey}`);
  console.log(`  Loaded                       : ${loaded}`);
  console.log(`  WARN unit not RCI-reserved   : ${notRciReserved}`);
  console.log(`  WARN check-in not a Friday   : ${notFriday}`);
  console.log(`  WARN span != check-in + ${WEEK_SPAN_DAYS}    : ${badSpan}`);
  console.log(`  WARN no RciWeek match        : ${unresolvedWeek}`);
  console.log('  Rows per year   :');
  [...perYear.keys()].sort().forEach(y => console.log(`    ${y}: ${perYear.get(y)}`));
  console.log('  Rows per season :');
  // bb_time_colour order, so the counts read straight against the source file
  ([[1, 'B', 'Blue'], [2, 'W', 'White'], [3, 'R', 'Red']] as [number, string, string][])
    .forEach(([c, k, label]) => { if (perSeason.has(k)) console.log(`    ${k} ${label} (colour ${c}): ${perSeason.get(k)}`); });
  console.log('  Rows per unit   :');
  [...perUnit.keys()].sort().forEach(u => console.log(`    ${u}: ${perUnit.get(u)}`));
  console.log(`  Max serialNo    : ${maxSerial}  (app-created rows continue from ${maxSerial + 1})`);
  if (warns.length) {
    console.log(`  WARN (first ${warns.length}):`);
    warns.forEach(w => console.log(`    - ${w}`));
  }
  console.log('  NOTE: ResAvailMast untouched - the imported grid already has bulk bank deducted.');

  if (!DRY_RUN) {
    const count = await prisma.rciBulkBank.count();
    console.log(`  DB count        : ${count}`);
  }
  console.log('');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
