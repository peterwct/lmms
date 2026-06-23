/**
 * LHB MMS — Informix → PostgreSQL Migration
 *
 * Prerequisites:
 *   Place these 3 pipe-delimited files in the migrate/ folder:
 *     migrate/si_ind_mast.txt
 *     migrate/si_cor_mast.txt
 *     migrate/si_entitlement.txt
 *
 * Run:
 *   npx ts-node prisma/migrate-informix.ts                          (all tables)
 *   npx ts-node prisma/migrate-informix.ts --dry-run                (count rows, no writes)
 *   npx ts-node prisma/migrate-informix.ts --only individuals       (si_ind_mast only)
 *   npx ts-node prisma/migrate-informix.ts --only corporates        (si_cor_mast only)
 *   npx ts-node prisma/migrate-informix.ts --only agreements        (si_entitlement only)
 */

import {
  PrismaClient,
  MemberType,
  MemberStatus,
  AgreementStatus,
  EntitlementType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

const prisma = new PrismaClient();
const MIGRATE_DIR = path.join(__dirname, '..', 'migrate');
const DELIM = '|';
const BATCH = 500;
const DRY_RUN = process.argv.includes('--dry-run');
const ONLY_FLAG = process.argv.find(a => a.startsWith('--only='))?.split('=')[1]
  ?? (process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined);
const RUN_INDIVIDUALS = !ONLY_FLAG || ONLY_FLAG === 'individuals';
const RUN_CORPORATES  = !ONLY_FLAG || ONLY_FLAG === 'corporates';
const RUN_AGREEMENTS  = !ONLY_FLAG || ONLY_FLAG === 'agreements';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const t = (s: string | undefined): string | null =>
  s !== undefined && s.trim() !== '' ? s.trim() : null;

const b = (s: string | null): boolean =>
  s !== null && s.trim().toUpperCase() === 'Y';

// Informix dates are dd-mm-yyyy. JavaScript new Date() cannot parse this format.
const d = (s: string | null): Date | null => {
  if (!s || !s.trim()) return null;
  const str = s.trim();
  // Handle dd-mm-yyyy (Informix DATE format)
  const ddmmyyyy = str.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (ddmmyyyy) {
    const dt = new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`);
    if (isNaN(dt.getTime())) return null;
    if (dt.getFullYear() > 9999) return null;
    return dt;
  }
  // Fallback: try ISO or other parseable format
  const dt = new Date(str);
  if (isNaN(dt.getTime())) return null;
  // Guard against out-of-range years that PostgreSQL rejects (max 294276 AD, but we cap at 9999)
  if (dt.getFullYear() > 9999) return null;
  return dt;
};

const n = (s: string | null): number | null => {
  if (!s || !s.trim()) return null;
  const v = parseFloat(s.trim());
  return isNaN(v) ? null : v;
};

const i = (s: string | null): number | null => {
  if (!s || !s.trim()) return null;
  const v = parseInt(s.trim(), 10);
  return isNaN(v) ? null : v;
};

// Informix UNLOAD appends a trailing | on each row
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

// ─── Individual Members (si_ind_mast) ────────────────────────────────────────
//
// Verified column indices from re-exported file (67 tokens per row incl. trailing):
//  0  i_membership_no    18 i_add1         36 i_designation   54 i_ja_hp
//  1  i_acct_type        19 i_add2         37 i_spouse        55 i_ja_email
//  2  i_park_off         20 i_add3         38 i_spouse_ic     56 i_enrol_rci
//  3  i_accpac_ref       21 i_city_state   39 i_spouse_new_ic 57 i_active_hcm
//  4  i_subs_cat         22 i_postcode     40 i_ja_name       58 i_remark
//  5  i_name             23 i_statecode    41 i_ja_ic         59 i_sysdate
//  6  i_salutation       24 i_mailadd1     42 i_ja_new_ic     60 i_mod_date
//  7  i_name_card        25 i_mailadd2     43 i_ja_salutation 61 i_comp_city_state
//  8  i_ic_pass_no       26 i_mailadd3     44 i_ja_designation 62 i_comp_postcode
//  9  i_new_ic           27 i_mail_city    45 i_ja_name_card  63 i_comp_statecode
// 10  i_nationality      28 i_mail_postcode 46 i_ja_add1      64 i_telno_off2
// 11  i_birthdate        29 i_mail_state   47 i_ja_add2       65 i_faxno_off
// 12  i_sex              30 i_work_nature  48 i_ja_add3       66 (trailing)
// 13  i_race             31 i_company1     49 i_ja_city
// 14  i_marital_status   32 i_comp_add1    50 i_ja_postcode
// 15  i_email            33 i_comp_add2    51 i_ja_state
// 16  i_tel_res          34 i_comp_add3    52 i_ja_tel_h
// 17  i_handphone        35 i_telno_off    53 i_ja_tel_o

function mapIndividual(c: string[]) {
  return {
    id:               randomUUID(),
    updatedAt:        new Date(),
    membershipNo:     t(c[0])!,
    memberType:       MemberType.INDIVIDUAL,
    branchCode:       t(c[2]),
    accpacRef:        t(c[3]),
    subsCategory:     t(c[4]),
    fullName:         t(c[5]) ?? '(no name)',
    salutation:       t(c[6]),
    nameCard:         t(c[7]),
    icOld:            t(c[8]),
    icNew:            t(c[9]),
    nationality:      t(c[10]),
    dateOfBirth:      d(c[11]),
    gender:           t(c[12]),
    race:             t(c[13]),
    maritalStatus:    t(c[14]),
    email:            t(c[15]),
    telHome:          t(c[16]),
    telMobile:        t(c[17]),
    resAdd1:          t(c[18]),
    resAdd2:          t(c[19]),
    resAdd3:          t(c[20]),
    resCityState:     t(c[21]),
    resPostcode:      t(c[22]),
    resStateCode:     t(c[23]),
    mailAdd1:         t(c[24]),
    mailAdd2:         t(c[25]),
    mailAdd3:         t(c[26]),
    mailCityState:    t(c[27]),
    mailPostcode:     t(c[28]),
    mailStateCode:    t(c[29]),
    workNature:       t(c[30]),
    companyName:      t(c[31]),
    compAdd1:         t(c[32]),
    compAdd2:         t(c[33]),
    compAdd3:         t(c[34]),
    telOffice:        t(c[35]),
    designation:      t(c[36]),
    spouseName:       t(c[37]),
    spouseIc:         t(c[38]) ?? t(c[39]), // prefer old IC, fall back to new
    jaName:           t(c[40]),
    jaIc:             t(c[41]),
    jaIcNew:          t(c[42]),
    jaSalutation:     t(c[43]),
    jaDesignation:    t(c[44]),
    jaNameCard:       t(c[45]),
    jaAdd1:           t(c[46]),
    jaAdd2:           t(c[47]),
    jaAdd3:           t(c[48]),
    jaCity:           t(c[49]),
    jaPostcode:       t(c[50]),
    jaState:          t(c[51]),
    jaTelHome:        t(c[52]),
    jaTelOffice:      t(c[53]),
    jaMobile:         t(c[54]),
    jaEmail:          t(c[55]),
    enrolRci:         b(c[56]),
    activeHcm:        b(c[57]),
    remarks:          t(c[58]),
    legacyCreatedAt:  d(c[59]),
    legacyModifiedAt: d(c[60]),
    compCityState:    t(c[61]),
    compPostcode:     t(c[62]),
    compStateCode:    t(c[63]),
    telOffice2:       t(c[64]),
    faxOffice:        t(c[65]),
    status:           MemberStatus.ACTIVE,
  };
}

// ─── Corporate Members (si_cor_mast) ─────────────────────────────────────────
//
// Verified column indices (29 tokens per row incl. trailing empty):
//  0  c_membership_no    8  c_add1         16 c_mail_postcode  24 c_enrol_rci
//  1  c_park_off         9  c_add2         17 c_mail_statecode 25 c_active_hcm
//  2  c_accpac_ref       10 c_add3         18 c_telno1         26 c_sysdate
//  3  c_subs_cat         11 c_city_state   19 c_telno2         27 c_mod_date
//  4  c_company1         12 c_postcode     20 c_faxno          28 (trailing)
//  5  c_registration_no  13 c_statecode    21 c_email (skipped in UNLOAD — see note)
//  6  c_incorporation    14 c_mailadd1     22 c_email
//  7  c_business_nature  15 c_mailadd2     23 c_email (actual index confirmed = 23)
//
// Note: actual file has c_email at col 23 (confirmed from sample row)

function mapCorporate(c: string[]) {
  return {
    id:                randomUUID(),
    updatedAt:         new Date(),
    membershipNo:      t(c[0])!,
    memberType:        MemberType.CORPORATE,
    branchCode:        t(c[1]),
    accpacRef:         t(c[2]),
    subsCategory:      t(c[3]),
    fullName:          t(c[4]) ?? '(no name)',
    registrationNo:    t(c[5]),
    incorporationDate: d(c[6]),
    businessNature:    t(c[7]),
    resAdd1:           t(c[8]),
    resAdd2:           t(c[9]),
    resAdd3:           t(c[10]),
    resCityState:      t(c[11]),
    resPostcode:       t(c[12]),
    resStateCode:      t(c[13]),
    mailAdd1:          t(c[14]),
    mailAdd2:          t(c[15]),
    mailAdd3:          t(c[16]),
    mailCityState:     t(c[17]),
    mailPostcode:      t(c[18]),
    mailStateCode:     t(c[19]),
    telHome:           t(c[20]), // c_telno1
    telMobile:         t(c[21]), // c_telno2
    faxNo:             t(c[22]),
    email:             t(c[23]),
    enrolRci:          b(c[24]),
    activeHcm:         b(c[25]),
    legacyCreatedAt:   d(c[26]),
    legacyModifiedAt:  d(c[27]),
    status:            MemberStatus.ACTIVE,
  };
}

// ─── Agreements + Nominees (si_entitlement) ───────────────────────────────────
//
// Fresh-export column indices (65 tokens per row incl. trailing):
//  0  e_membership_no    13 e_sub_fees      25 e_nom1_name     39 e_nom2_name     54 e_rci_refno
//  1  e_agreement_no     14 e_sink_fund     26 e_nom1_ic       40 e_nom2_ic       55 e_rci_enrol_date
//  2  e_agreement_date   15 e_govt_tax      27 e_nom1_new_ic   41 e_nom2_new_ic   56 e_rci_expiry
//  3  e_enddate          16 e_loan_amt      28 e_nom1_salut    42 e_nom2_salut    57 e_rci_fee_paid
//  4  e_rtu_years        17 e_loan_type     29 e_nom1_desig    43 e_nom2_desig    58 e_outstd_doc
//  5  e_cocode           18 e_sls_br        30 e_nom1_namecard 44 e_nom2_namecard 59 e_doc_desc
//  6  e_enttype          19 e_sls_mth       31 e_nom1_tel_h    45 e_nom2_tel_h    60 e_locality
//  7  e_agreement_type   20 e_sls_source    32 e_nom1_tel_hp   46 e_nom2_tel_hp   61 e_can_code
//  8  e_member_type      21 e_certificate   33 e_nom1_add1     47 e_nom2_add1     62 e_sysdate
//  9  e_total_pts        22 e_transfer_flg  34 e_nom1_add2     48 e_nom2_add2     63 e_mod_date
// 10  e_acct_classify    23 e_ttmembno      35 e_nom1_add3     49 e_nom2_add3     64 e_term_user
//                                                                                65 e_aterm_date
//                                                                                66 (trailing)
// 11  e_purchase_price   24 e_tfmembno      36 e_nom1_city     50 e_nom2_city
// 12  e_down                                37 e_nom1_postcode 51 e_nom2_postcode
//                                           38 e_nom1_email    52 e_nom2_email
//                                                              53 e_nom2_email (dup)
//
// nom1 (c[25..38]): 14 fields — name, icOld, icNew, salut, desig, nameCard, telH, telMobile,
//                               add1, add2, add3, city, postcode, email
// nom2 (c[39..53]): 15 fields — name, icOld, icNew, salut, desig, nameCard,
//                               telH, telMobile, add1, add2, add3, city, postcode, email, email(dup)

function mapAgreement(c: string[], memberId: string) {
  const rawAgmtNo = c[1] ?? '';
  const agmtNo    = rawAgmtNo.trim();
  const classify  = t(c[10]);
  const enttype   = t(c[6]);

  return {
    updatedAt:               new Date(),
    agreementNo:             agmtNo,
    legacyAgreementNo:       rawAgmtNo !== agmtNo ? rawAgmtNo : null,
    memberId,
    membershipNo:            t(c[0]) ?? '',
    agreementDate:           d(c[2]) ?? new Date('1900-01-01'),
    endDate:                 d(c[3]),
    termYears:               i(c[4]) ?? 0,
    coCode:                  t(c[5]) ?? '',
    entitlementType:         enttype === 'P' ? EntitlementType.P : EntitlementType.W,
    agreementType:           t(c[7]),
    memberType:              t(c[8]),
    totalPoints:             i(c[9]),
    acctClassify:            classify === 'CC' ? AgreementStatus.TM
                             : (classify === 'RA' || classify === 'NA') ? AgreementStatus.NA
                             : (classify && Object.values(AgreementStatus).includes(classify as AgreementStatus))
                               ? classify as AgreementStatus
                               : AgreementStatus.NA,
    purchasePrice:           n(c[11]),
    downPayment:             n(c[12]),
    subFees:                 n(c[13]),
    sinkFund:                n(c[14]),
    govtTax:                 n(c[15]),
    loanAmount:              n(c[16]),
    loanType:                t(c[17]),
    salesBranch:             t(c[18]),
    salesMonth:              t(c[19]),
    salesSource:             t(c[20]),
    certificateNo:           t(c[21]),
    transferFlag:            t(c[22]),
    transferToMembership:    t(c[23]),
    transferFromMembership:  t(c[24]),
    rciRefNo:                t(c[54]),
    rciEnrolDate:            d(c[55]),
    rciExpiryDate:           d(c[56]),
    rciFeePaid:              n(c[57]),
    outstdDoc:               b(c[58]),
    docDescription:          t(c[59]),
    canCode:                 t(c[61]),
    legacyCreatedAt:         d(c[62]),
    legacyModifiedAt:        d(c[63]),
    statusChangeUser:        t(c[64]),
    statusChangeDate:        d(c[65]),
  };
}

// nom1: c[25..38], 14 fields
function mapNom1(c: string[], agreementId: string) {
  const name = t(c[25]);
  if (!name) return null;
  return {
    id:          randomUUID(),
    agreementId,
    nomineeSeq:  1,
    fullName:    name,
    icOld:       t(c[26]),
    icNew:       t(c[27]),
    salutation:  t(c[28]),
    designation: t(c[29]),
    nameCard:    t(c[30]),
    telHome:     t(c[31]),
    telMobile:   t(c[32]),
    add1:        t(c[33]),
    add2:        t(c[34]),
    add3:        t(c[35]),
    cityState:   t(c[36]),
    postcode:    t(c[37]),
    email:       t(c[38]),
  };
}

// nom2: c[39..53], 15 fields (c[53] is duplicate email — ignored)
function mapNom2(c: string[], agreementId: string) {
  const name = t(c[39]);
  if (!name) return null;
  return {
    id:          randomUUID(),
    agreementId,
    nomineeSeq:  2,
    fullName:    name,
    icOld:       t(c[40]),
    icNew:       t(c[41]),
    salutation:  t(c[42]),
    designation: t(c[43]),
    nameCard:    t(c[44]),
    telHome:     t(c[45]),
    telMobile:   t(c[46]),
    add1:        t(c[47]),
    add2:        t(c[48]),
    add3:        t(c[49]),
    cityState:   t(c[50]),
    postcode:    t(c[51]),
    email:       t(c[52]),
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('LHB MMS — Informix Migration');
  console.log(DRY_RUN ? '  MODE: DRY RUN (no writes)' : '  MODE: LIVE');
  console.log(ONLY_FLAG ? `  ONLY: ${ONLY_FLAG}` : '  SCOPE: all tables');
  console.log('='.repeat(60));

  let indTotal = 0, indSkipped = 0;
  let corTotal = 0, corSkipped = 0;
  let agmtTotal = 0, agmtSkipped = 0, nomTotal = 0;

  // ── 1. Individual Members ──────────────────────────────────────────────────
  if (RUN_INDIVIDUALS) {
    console.log('\n[1/5] Reading si_ind_mast.txt ...');
    const indBatch: ReturnType<typeof mapIndividual>[] = [];

    for await (const cols of readLines('si_ind_mast.txt')) {
      if (!t(cols[0])) { indSkipped++; continue; }
      indBatch.push(mapIndividual(cols));
      indTotal++;

      if (!DRY_RUN && indBatch.length >= BATCH) {
        await prisma.member.createMany({ data: indBatch as any, skipDuplicates: true });
        process.stdout.write(`\r  inserted ${indTotal} individual members...`);
        indBatch.length = 0;
      }
    }
    if (!DRY_RUN && indBatch.length) {
      await prisma.member.createMany({ data: indBatch as any, skipDuplicates: true });
    }
    console.log(`\n  OK Individual members: ${indTotal} processed, ${indSkipped} skipped`);
  } else {
    console.log('\n[1/5] Skipping si_ind_mast.txt (--only)');
  }

  // ── 2. Corporate Members ───────────────────────────────────────────────────
  if (RUN_CORPORATES) {
    console.log('\n[2/5] Reading si_cor_mast.txt ...');
    const corBatch: ReturnType<typeof mapCorporate>[] = [];

    for await (const cols of readLines('si_cor_mast.txt')) {
      if (!t(cols[0])) { corSkipped++; continue; }
      corBatch.push(mapCorporate(cols));
      corTotal++;

      if (!DRY_RUN && corBatch.length >= BATCH) {
        await prisma.member.createMany({ data: corBatch as any, skipDuplicates: true });
        process.stdout.write(`\r  inserted ${corTotal} corporate members...`);
        corBatch.length = 0;
      }
    }
    if (!DRY_RUN && corBatch.length) {
      await prisma.member.createMany({ data: corBatch as any, skipDuplicates: true });
    }
    console.log(`\n  OK Corporate members: ${corTotal} processed, ${corSkipped} skipped`);
  } else {
    console.log('\n[2/5] Skipping si_cor_mast.txt (--only)');
  }

  // ── 3/4. Agreements + Nominees ─────────────────────────────────────────────
  if (RUN_AGREEMENTS) {
    // Build membership_no -> UUID lookup
    console.log('\n[3/5] Building member lookup map ...');
    const memberMap = new Map<string, string>();
    if (!DRY_RUN) {
      let offset = 0;
      while (true) {
        const rows = await prisma.member.findMany({
          select: { id: true, membershipNo: true },
          skip: offset,
          take: 5000,
        });
        if (!rows.length) break;
        rows.forEach(r => memberMap.set(r.membershipNo, r.id));
        offset += rows.length;
      }
      console.log(`  OK ${memberMap.size} members indexed`);
    }

    // Uses client-side UUIDs so agreements and nominees can be batch-inserted together.
    console.log('\n[4/5] Reading si_entitlement.txt ...');
    const agmtBatch: any[] = [];
    const nomBatch:  any[] = [];

    const flush = async () => {
      if (DRY_RUN) return;
      if (agmtBatch.length) {
        await prisma.agreement.createMany({ data: agmtBatch, skipDuplicates: true });
        agmtBatch.length = 0;
      }
      if (nomBatch.length) {
        await prisma.nominee.createMany({ data: nomBatch, skipDuplicates: true });
        nomBatch.length = 0;
      }
    };

    for await (const cols of readLines('si_entitlement.txt')) {
      const membershipNo = t(cols[0]);
      if (!membershipNo) { agmtSkipped++; continue; }

      let memberId: string;
      if (DRY_RUN) {
        memberId = 'dry-run-uuid';
      } else {
        const found = memberMap.get(membershipNo);
        if (!found) {
          console.warn(`\n  WARNING Agreement skipped -- member not found: ${membershipNo}`);
          agmtSkipped++;
          continue;
        }
        memberId = found;
      }

      // Generate UUID client-side so nominees can reference it without a round-trip
      const agmtId = randomUUID();
      agmtBatch.push({ id: agmtId, ...mapAgreement(cols, memberId) });

      const nom1 = mapNom1(cols, agmtId);
      const nom2 = mapNom2(cols, agmtId);
      if (nom1) { nomBatch.push(nom1); nomTotal++; }
      if (nom2) { nomBatch.push(nom2); nomTotal++; }

      agmtTotal++;

      if (agmtBatch.length >= BATCH) {
        await flush();
        process.stdout.write(`\r  processed ${agmtTotal} agreements, ${nomTotal} nominees...`);
      }
    }
    await flush();
    console.log(`\n  OK Agreements: ${agmtTotal} inserted, ${agmtSkipped} skipped`);
    console.log(`  OK Nominees:   ${nomTotal} inserted`);
  } else {
    console.log('\n[3/5] Skipping member lookup (--only)');
    console.log('\n[4/5] Skipping si_entitlement.txt (--only)');
  }

  // ── 5. Validation ──────────────────────────────────────────────────────────
  console.log('\n[5/5] Validation ...');
  if (!DRY_RUN) {
    const [mInd, mCor, agmt, nom] = await Promise.all([
      prisma.member.count({ where: { memberType: 'INDIVIDUAL' } }),
      prisma.member.count({ where: { memberType: 'CORPORATE' } }),
      prisma.agreement.count(),
      prisma.nominee.count(),
    ]);
    console.log('\n  +-------------------------------------------------+');
    console.log('  |  Table            Expected     Actual            |');
    console.log('  +-------------------------------------------------+');
    console.log(`  |  Members (IND)      30,446   ${String(mInd).padStart(8)}            |`);
    console.log(`  |  Members (COR)       1,527   ${String(mCor).padStart(8)}            |`);
    console.log(`  |  Agreements         33,406   ${String(agmt).padStart(8)}            |`);
    console.log(`  |  Nominees           27,469   ${String(nom).padStart(8)}            |`);
    console.log('  +-------------------------------------------------+');
  } else {
    console.log(`\n  DRY RUN totals:`);
    console.log(`    Individual rows : ${indTotal}`);
    console.log(`    Corporate rows  : ${corTotal}`);
    console.log(`    Agreement rows  : ${agmtTotal}`);
  }

  console.log('\nMigration complete.\n');
}

main()
  .catch(e => { console.error('\nMigration failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
