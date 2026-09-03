<#
.SYNOPSIS
    LHB MMS — Refresh test server database with latest Informix data.

.DESCRIPTION
    Clears all Informix-sourced tables and re-imports from the migrate/*.txt files.
    Preserves: Users, Departments, Permissions, States, CancellationReasons, AMC Rates.

.PARAMETER DatabaseUrl
    PostgreSQL connection string. Defaults to $env:DATABASE_URL.
    Set before running:
        $env:DATABASE_URL = "postgresql://postgres:PASSWORD@199.1.1.32:5432/lhb_mms"

.PARAMETER DryRun
    Parse and validate source files without writing to the database.

.EXAMPLE
    $env:DATABASE_URL = "postgresql://postgres:PASSWORD@199.1.1.32:5432/lhb_mms"
    .\refresh-test-db.ps1

.NOTES
    ── STEP 0 — Run these UNLOAD commands on the Informix server first ──────────

    UNLOAD TO 'si_ind_mast.txt' DELIMITER '|'
    SELECT i_membership_no, i_acct_type, i_park_off, i_accpac_ref, i_subs_cat, i_name,
           i_salutation, i_name_card, i_ic_pass_no, i_new_ic, i_nationality, i_birthdate,
           i_sex, i_race, i_marital_status, i_email, i_tel_res, i_handphone,
           i_add1, i_add2, i_add3, i_city_state, i_postcode, i_statecode,
           i_mailadd1, i_mailadd2, i_mailadd3, i_mail_city_state, i_mail_postcode, i_mail_statecode,
           i_work_nature, i_company1, i_comp_add1, i_comp_add2, i_comp_add3,
           i_telno_off, i_designation, i_spouse, i_spouse_ic, i_spouse_new_ic,
           i_ja_name, i_ja_ic, i_ja_new_ic, i_ja_salutation, i_ja_designation, i_ja_name_card,
           i_ja_add1, i_ja_add2, i_ja_add3, i_ja_city, i_ja_postcode, i_ja_state,
           i_ja_tel_h, i_ja_tel_o, i_ja_hp, i_ja_email,
           i_enrol_rci, i_active_hcm, i_remark, i_sysdate, i_mod_date,
           i_comp_city_state, i_comp_postcode, i_comp_statecode, i_telno_off2, i_faxno_off
    FROM si_ind_mast WHERE i_cocode IN ('03', '15', '02');

    UNLOAD TO 'si_cor_mast.txt' DELIMITER '|'
    SELECT c_membership_no, c_park_off, c_accpac_ref, c_subs_cat, c_company1,
           c_registration_no, c_incorporation, c_business_nature,
           c_regadd1, c_regadd2, c_regadd3, c_city_state, c_postcode, c_statecode,
           c_mailadd1, c_mailadd2, c_mailadd3, c_mail_city_state, c_mail_postcode, c_mail_statecode,
           c_telno1, c_telno2, c_faxno, c_email,
           c_enrol_rci, c_active_hcm, c_sysdate, c_mod_date
    FROM si_cor_mast WHERE c_cocode IN ('03', '15', '02');

    UNLOAD TO 'si_entitlement.txt' DELIMITER '|'
    SELECT e_membership_no, e_agreement_no, e_agreement_date, e_enddate, e_rtu_years,
           e_cocode, e_enttype, e_agreement_type, e_member_type, e_total_pts,
           e_acct_classify, e_purchase_price, e_down, e_sub_fees, e_sink_fund, e_govt_tax,
           e_loan_amt, e_loan_type, e_sls_br, e_sls_mth, e_sls_source,
           e_certificate_no, e_transfer_flag, e_ttmembership_no, e_tfmembership_no,
           e_nom1_name, e_nom1_ic, e_nom1_new_ic,
           e_nom1_salutation, e_nom1_designation, e_nom1_name_card,
           e_nom1_tel_h, e_nom1_tel_hp,
           e_nom1_add1, e_nom1_add2, e_nom1_add3, e_nom1_city_state, e_nom1_postcode, e_nom1_email,
           e_nom2_name, e_nom2_ic, e_nom2_new_ic, e_nom2_salutation, e_nom2_designation,
           e_nom2_name_card, e_nom2_tel_h, e_nom2_tel_hp,
           e_nom2_add1, e_nom2_add2, e_nom2_add3, e_nom2_city_state, e_nom2_postcode, e_nom2_email,
           e_nom2_email,
           e_rci_refno, e_rci_enrol_date, e_rci_expiry_date, e_rci_fee_paid,  -- NOT imported (see below)
           e_outstd_doc, e_doc_desc, e_locality, e_can_code, e_sysdate, e_mod_date,
           e_term_user, e_aterm_date, e_tfdate, e_ttdate, e_tfuser, e_ttuser,
           e_loc_name, e_loc_salutation, e_loc_designation, e_loc_name_card, e_cse_code
    FROM si_entitlement WHERE e_cocode IN ('03', '15', '02');
    -- The four e_rci_* columns above are still exported but no longer imported: RCI data
    -- lives in RciEnrolment (rci_enrol.txt) alone. Kept in the SELECT so the column
    -- offsets migrate-informix.ts parses stay unchanged.

    UNLOAD TO 'csp_mast.txt' DELIMITER '|'
    SELECT csp_code, csp_name, csp_branch, csp_status
    FROM csp_mast;

    UNLOAD TO 'amc_mem.txt' DELIMITER '|'
    SELECT mem_no, agmt_no, cocode, first_due, next_due, last_invdate,
           no_of_inv, ttl_inv, price_code, date_create
    FROM amc_mem WHERE cocode IN ('03', '15');

    UNLOAD TO 'ps_amc_mem.txt' DELIMITER '|'
    SELECT psamc_memno, psamc_agmtno, psamc_cocode, psamc_first_due, psamc_next_due,
           psamc_last_invdate, psamc_no_of_inv, psamc_ttl_inv, psamc_datecreate
    FROM ps_amc_mem WHERE psamc_cocode = '02';

    UNLOAD TO 'maa_mem.txt' DELIMITER '|'
    SELECT * FROM maa_mem WHERE cocode IN ('03', '15');

    UNLOAD TO 'maa_claim.txt' DELIMITER '|'
    SELECT * FROM maa_claim;

    UNLOAD TO 'rci_enrol.txt' DELIMITER '|'
    SELECT * FROM rci_enrol;
    -- Full table (43 cols) since 2026-08-20. This supersedes the old 29-col SELECT
    -- joined against si_entitlement; migrate-rci-enrolment.ts detects the layout from
    -- the field count. It is now the ONLY reader of this file.

    UNLOAD TO 'rci_week.txt' DELIMITER '|'
    SELECT * FROM rci_week;
    -- Full table. The importer keeps only years >= 2026 (209 of 2,055).

    UNLOAD TO 'bulk_bank.txt' DELIMITER '|'
    SELECT * FROM bulk_bank;
    -- Full table. The importer keeps only check-in years >= 2026 (771 of 35,928),
    -- matching migrate-rci-week.ts's MIN_YEAR.

    UNLOAD TO 'booking_ent1.txt' DELIMITER '|'
    SELECT * FROM booking_ent1;

    UNLOAD TO 'ps_bookent1.txt' DELIMITER '|'
    SELECT * FROM ps_bookent1;

    UNLOAD TO 'ctrl_billtab.txt' DELIMITER '|'
    SELECT cocode, last_amcinv FROM ctrl_billtab WHERE cocode IN ('03', '15', '02');

    UNLOAD TO 'ps_company.txt' DELIMITER '|'
    SELECT * FROM ps_company;

    UNLOAD TO 'lvc_master.txt' DELIMITER '|'
    SELECT * FROM lvc_master;

    UNLOAD TO 'resort_mast.txt' DELIMITER '|'
    SELECT * FROM resort_mast;

    UNLOAD TO 'ps_resort_info.txt' DELIMITER '|'
    SELECT * FROM ps_resort_info;

    UNLOAD TO 'apt_category.txt' DELIMITER '|'
    SELECT aptc_resort_code, aptc_type, aptc_remark, aptc_lock_type FROM apt_category;

    -- apt_mast / apt_block / resmt are NOT plain SELECTs any more. Four resorts had
    -- their unit registers trimmed to the live inventory (L-10024 Greenhill A1-A34,
    -- L-10025 Golden City B1-B22, L-10026 Leisure Cove floors 4-5, CP-PBR Perdana
    -- the 32xx family), and all three tables must carry the SAME unit whitelist or a
    -- refresh reloads blocks/maintenance for units that no longer exist.
    -- Run these three scripts instead of hand-writing the UNLOADs:
    --     dbaccess <db> E:\Websites\lmms\migrate\apt_mast_unload.sql     -> apt_mast.txt
    --     dbaccess <db> E:\Websites\lmms\migrate\apt_block_unload.sql    -> apt_block.txt
    --     dbaccess <db> E:\Websites\lmms\migrate\resmt_unload.sql        -> resmt.txt
    -- Expected: 358 / 2191 / 10904 rows.

    -- OPTIONAL, and recommended: the active-resorts sweep. Exports every resort
    -- OTHER than those four that is Active in resort_mast, so no active resort can
    -- end up without its units. migrate-resort-units.ts loads it when the file is
    -- present and de-duplicates against apt_mast.txt on (resortCode, unitNo); when
    -- absent it is skipped and the refresh proceeds normally.
    --     dbaccess <db> E:\Websites\lmms\migrate\apt_mast_active_unload.sql
    --                                                        -> apt_mast_active.txt

    UNLOAD TO 'res_avail_mast.txt' DELIMITER '|'
    SELECT * FROM res_avail_mast;

    UNLOAD TO 'ps_seasondate.txt' DELIMITER '|'
    SELECT * FROM ps_seasondate where year(pssd_seadate) >= 2026;

    UNLOAD TO 'ps_seasonapt.txt' DELIMITER '|'
    SELECT * FROM ps_seasonapt where pssa_resort_code = "CP-PBR";

    UNLOAD TO 'ps_lvcapt.txt' DELIMITER '|'
    SELECT * FROM ps_lvcapt;

    Copy all output files into:  E:\Websites\lmms\migrate\

    NOTE: ctrl_billtab seeds the per-coCode AMC invoice running number
    (AmcInvoiceCounter). A refresh RESETS it to the Informix value, which is
    correct for UAT (this refresh also truncates AmcInvoice via the Member
    CASCADE). Do NOT run a refresh after go-live once the live system has
    started issuing invoices, or already-used numbers would be reissued.
#>

param(
    [string]$DatabaseUrl = $env:DATABASE_URL,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if ((Split-Path $PSScriptRoot -Leaf) -ne 'scripts') {
    # Script is in the project root, not a subdirectory
    $root = $PSScriptRoot
}

Set-Location $root

# ── Auto-load DATABASE_URL from .env if not already set ───────────────────────
if (-not $DatabaseUrl) {
    $envFile = Join-Path $root ".env"
    if (Test-Path $envFile) {
        $match = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL\s*=\s*(.+)$' } | Select-Object -First 1
        if ($match -and $match -match '^DATABASE_URL\s*=\s*(.+)$') {
            $DatabaseUrl = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
}

# ── Validate DATABASE_URL ──────────────────────────────────────────────────────
if (-not $DatabaseUrl) {
    Write-Host ""
    Write-Host "ERROR: DATABASE_URL is not set." -ForegroundColor Red
    Write-Host ""
    Write-Host "Set it first:"
    Write-Host '  $env:DATABASE_URL = "postgresql://postgres:PASSWORD@199.1.1.32:5432/lhb_mms"'
    Write-Host ""
    exit 1
}
$env:DATABASE_URL = $DatabaseUrl

# ── Validate migrate source files ─────────────────────────────────────────────
$migrateDir = Join-Path $root "migrate"

# ── TO ADD A NEW TABLE: add its source file to this list, then add its
#    migration step in the "Run migrations" section below. ──────────────────
$requiredFiles = @(
    'si_ind_mast.txt',
    'si_cor_mast.txt',
    'si_entitlement.txt',
    'amc_mem.txt',
    'ps_amc_mem.txt',
    'maa_mem.txt',
    'maa_claim.txt',
    'rci_enrol.txt',
    'rci_week.txt',
    'bulk_bank.txt',
    'csp_mast.txt',
    'booking_ent1.txt',
    'ps_bookent1.txt',
    'ctrl_billtab.txt',
    'ps_company.txt',
    'lvc_master.txt',
    'resort_mast.txt',
    'ps_resort_info.txt',
    'apt_category.txt',
    'apt_mast.txt',
    'res_avail_mast.txt',
    'apt_block.txt',
    'resmt.txt',
    'ps_seasondate.txt',
    'ps_seasonapt.txt',
    'ps_lvcapt.txt'
)

$missing = $requiredFiles | Where-Object { -not (Test-Path (Join-Path $migrateDir $_)) }
if ($missing) {
    Write-Host ""
    Write-Host "ERROR: Missing source file(s) in migrate\:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ""
    Write-Host "Run the Informix UNLOAD commands shown in the script header, then copy"
    Write-Host "the output files into:  $migrateDir"
    Write-Host ""
    exit 1
}

# ── Show plan ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host ("=" * 62)
Write-Host "  LHB MMS - Test Database Refresh"
Write-Host ("=" * 62)
Write-Host "  Target  : $DatabaseUrl"
Write-Host "  Mode    : $(if ($DryRun) { 'DRY RUN (no writes)' } else { 'LIVE' })"
Write-Host ""
Write-Host "  Will CLEAR and RELOAD:"
Write-Host "    Member, Agreement, Nominee"
Write-Host "    AmcSchedule, AmcInvoice"
Write-Host "    PbsScheme, PbsClaim (Zurich Payback)"
Write-Host "    Salesperson, Product, LvcCode, Resort, ResortMaintenance, CpSeasonDate, SeasonPoint"
Write-Host "    RciEnrolment (RCI fn 1), RciWeek (RCI fn 2), RciBulkBank (RCI fn 3)"
Write-Host "    BookingEntitlement (LHC 03/15), CpBookingEntitlement (CP 02)"
Write-Host ""
Write-Host "  Will PRESERVE:"
Write-Host "    User, Department, DeptModulePermission"
Write-Host "    State, CancellationReason"
Write-Host "    AmcPrice, AmcPricePoints"
Write-Host "    Holiday - public + school (topped up by upsert, existing rows kept)"
Write-Host ("=" * 62)
Write-Host ""

if (-not $DryRun) {
    $confirm = Read-Host "Type YES to proceed"
    if ($confirm -ne 'YES') {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
}

$startTime = Get-Date

# ── Helper: run SQL without BOM ────────────────────────────────────────────────
function Invoke-Sql {
    param([string]$Sql, [string]$Label)
    Write-Host ""
    Write-Host "  [SQL] $Label" -ForegroundColor Cyan
    if ($DryRun) { Write-Host "        (skipped - dry run)"; return }
    $tmp = Join-Path $root "_refresh_tmp.sql"
    [System.IO.File]::WriteAllText($tmp, $Sql)
    try {
        npx prisma db execute --url="$env:DATABASE_URL" --file $tmp
        if ($LASTEXITCODE -ne 0) { throw "SQL execution failed" }
    }
    finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

# ── Helper: run a ts-node migration script ────────────────────────────────────
function Invoke-Migration {
    param([string]$Script, [string]$Label = "")
    $display = if ($Label) { $Label } else { $Script }
    Write-Host ""
    Write-Host "  [RUN] $display" -ForegroundColor Cyan
    if ($DryRun) {
        npx ts-node --transpile-only $Script --dry-run
    }
    else {
        npx ts-node --transpile-only $Script
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "FAILED: $Script" -ForegroundColor Red
        exit 1
    }
}

# ── Step 1: Truncate Informix data tables ─────────────────────────────────────
# Explicitly truncate leaf tables (BookingEntitlement has a real FK to Agreement;
# CpBookingEntitlement has none) before the Member CASCADE — CASCADE alone is
# unreliable and CpBookingEntitlement would otherwise survive.
Write-Host ""
Write-Host ("[1/7] Clearing Informix data tables...") -ForegroundColor Yellow

Invoke-Sql -Label "TRUNCATE Informix tables" -Sql @"
TRUNCATE "RciBulkBank", "RciWeek", "RciEnrolment", "BookingEntitlement", "CpBookingEntitlement", "PbsClaim", "PbsScheme", "Salesperson", "SeasonPoint", "ResortMaintenance", "AptBlock", "ResAvailMast", "ResortUnit", "ApartmentType", "ResortInfoLine", "Resort", "Product", "LvcCode", "CpSeasonDate", "Member" CASCADE;
"@

# ── Step 2: Core member + agreement import ────────────────────────────────────
Write-Host ""
Write-Host ("[2/7] Importing members, agreements, nominees...") -ForegroundColor Yellow
Invoke-Migration "prisma/migrate-informix.ts" "migrate-informix.ts"

# ── Step 3: AMC schedules + Zurich PBS ───────────────────────────────────────
Write-Host ""
Write-Host ("[3/7] Importing AMC schedules and Zurich PBS...") -ForegroundColor Yellow
Invoke-Migration "prisma/migrate-amc-schedules.ts" "migrate-amc-schedules.ts"
Invoke-Migration "prisma/migrate-maa-mem.ts"       "migrate-maa-mem.ts"
Invoke-Migration "prisma/migrate-maa-claim.ts"     "migrate-maa-claim.ts"
# RCI Enrolment register (RCI fn 1) -- the SINGLE SOURCE OF TRUTH for RCI data. It used
# to be paired with migrate-rci-enrol.ts, which read the same file to backfill four RCI
# columns on Agreement; those columns were dropped (see
# 20260902090000_drop_agreement_rci_columns) and that script is gone. Agreement Detail now
# renders the current RciEnrolment row read-only.
Invoke-Migration "prisma/migrate-rci-enrolment.ts" "migrate-rci-enrolment.ts"
# RCI week-number calendar (RCI fn 2). Standalone -- no FK, no dependency on the script
# above; only years >= 2026 are imported.
Invoke-Migration "prisma/migrate-rci-week.ts"      "migrate-rci-week.ts"

# ── Step 4: Salesperson + Resort master ──────────────────────────────────────
# NOTE: post-go-live, resorts are maintained in MMS (Resorts Setup CRUD) --
# re-importing resort_mast.txt clobbers any edits made through the app.
Write-Host ""
Write-Host ("[4/7] Importing salespersons, products and resorts...") -ForegroundColor Yellow
Invoke-Migration "prisma/migrate-salesperson.ts"   "migrate-salesperson.ts"
# Product / operating-company master (coCode). No FK points at it -- Agreement,
# AmcSchedule and Resort carry coCode as a plain string -- but it is the conceptual
# parent, so it loads before the resorts.
# ACTIVE SET: ps_company has no usable status column, so the script applies the
# business-supplied ACTIVE_CODES whitelist (02/03/15/24/25/26 as of 2026-08-27) and
# deactivates every other coCode on each run. Edit ACTIVE_CODES in the script to
# change it -- a status toggled in Products Setup does NOT survive this refresh.
Invoke-Migration "prisma/migrate-products.ts"      "migrate-products.ts"
# LVC exchange-programme master. lvc_cocode references Product.coCode (no hard FK,
# validated on CRUD), so this runs after migrate-products.ts.
Invoke-Migration "prisma/migrate-lvc-codes.ts"     "migrate-lvc-codes.ts"
Invoke-Migration "prisma/migrate-resorts.ts"       "migrate-resorts.ts"
Invoke-Migration "prisma/migrate-resort-info.ts"   "migrate-resort-info.ts"
# Apartment sleep types (fn 3). Needs Resort for the FK. Runs before migrate-resort-units
# so unit rows land against types that already exist.
Invoke-Migration "prisma/migrate-apt-category.ts"  "migrate-apt-category.ts"
# RCI-RESERVED SET: apt_rci_reserved in the source is stale (nearly every unit at our
# own resorts exports as 'Y'), so the script applies the business-supplied RCI_RESERVED
# map -- at the resorts it names a unit is 'Y' only if listed there and every other unit
# is forced to 'N'. Currently: L-10024 A6/A7, L-10026 504/506, CP-PBR 3201/3202 +
# 3203/3204; L-10016, L-10025 and L-101 none -- 6 RCI-qualified units in total. The map
# covers all six resorts on our own products; the V-* partner resorts are absent from it
# and keep the source value. Edit RCI_RESERVED in the script to change it -- a box ticked
# in fn 4 Apartments/Units Setup does NOT survive this refresh.
Invoke-Migration "prisma/migrate-resort-units.ts"  "migrate-resort-units.ts"
# Units Availability (per-day grid + input blocks). apt-block needs ResortUnit
# present for the apartmentType lookup, so it runs after migrate-resort-units.
Invoke-Migration "prisma/migrate-res-avail.ts"     "migrate-res-avail.ts"
Invoke-Migration "prisma/migrate-apt-block.ts"     "migrate-apt-block.ts"
# Resorts Maintenance. Also needs ResortUnit for the apartmentType lookup. Loads rows
# only -- res_avail_mast.txt already has maintenance deducted from bal_night, so this
# script deliberately applies NO per-day grid deltas (that happens on app CRUD only).
Invoke-Migration "prisma/migrate-maintenance.ts"   "migrate-maintenance.ts"
# RCI Bulk Bank (RCI fn 3). LHB inventory deposited into the RCI exchange network.
# Needs Resort + ResortUnit (loaded just above) AND RciWeek (step 3) for the
# (year, weekNo) denormalization, which is why it sits here and not with the other two
# RCI scripts. Like maintenance it loads rows ONLY -- the res_avail_mast.txt grid already
# has the bulk-bank weeks deducted from bal_night, so this script applies NO per-day
# deltas (that happens on app CRUD only).
Invoke-Migration "prisma/migrate-rci-bulk-bank.ts" "migrate-rci-bulk-bank.ts"
# Season points chart (points deducted per night by apartment type x season x day of
# week) -- ONE table, discriminated by pointsType. Both scripts need Resort for the FK.
# HOME: the member's own product's resort (coCode 02).
Invoke-Migration "prisma/migrate-cp-season-points.ts" "migrate-cp-season-points.ts"
# AWAY: a resort OTHER than their home, reached through an LVC exchange programme.
Invoke-Migration "prisma/migrate-lvc-season-points.ts" "migrate-lvc-season-points.ts"
# Public + School Holidays (one table, discriminated by holidayType). Business-supplied
# (no Informix file) and NOT truncated above -- there is no FK to Resort. The seed upserts,
# so this only tops up missing rows and leaves dates staff have already corrected alone.
Invoke-Migration "prisma/seed-holidays.ts"         "seed-holidays.ts"
# CP season calendar. Unlike the holiday seed this HAS an Informix source, so it
# is truncated above and fully reimported (clobbers CRUD edits post-go-live).
Invoke-Migration "prisma/migrate-cp-seasons.ts"    "migrate-cp-seasons.ts"

# ── Step 5: Booking entitlements (LHC nights used + CP point balances) ───────
# Depends on agreements existing (step 2): migrate-booking-entitlement.ts resolves
# agreementId by natural key. migrate-cp-booking-entitlement.ts stores agreementId=null.
Write-Host ""
Write-Host ("[5/7] Importing booking entitlements (LHC + CP)...") -ForegroundColor Yellow
Invoke-Migration "prisma/migrate-booking-entitlement.ts"    "migrate-booking-entitlement.ts (LHC 03/15)"
Invoke-Migration "prisma/migrate-cp-booking-entitlement.ts" "migrate-cp-booking-entitlement.ts (CP 02)"

# AMC invoice running number per coCode (independent control table -- no FK).
# Resets lastInvNo to the Informix ctrl_billtab.last_amcinv baseline.
Invoke-Migration "prisma/migrate-amc-invoice-counter.ts"    "migrate-amc-invoice-counter.ts (per-coCode running no)"

# ── Step 6: Re-grant schema permissions to lhb_app ───────────────────────────
# Required whenever tables are dropped/recreated (e.g. prisma migrate reset).
# Safe to run after every refresh — GRANT is idempotent.
Write-Host ""
Write-Host ("[6/7] Re-granting schema permissions to lhb_app...") -ForegroundColor Yellow

Invoke-Sql -Label "GRANT lhb_app on public schema" -Sql @"
GRANT USAGE ON SCHEMA public TO lhb_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lhb_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lhb_app;
"@

# ── Step 7: Final counts ──────────────────────────────────────────────────────
Write-Host ""
Write-Host ("[7/7] Final record counts...") -ForegroundColor Yellow

Invoke-Sql -Label "Row counts" -Sql @"
SELECT
  (SELECT COUNT(*) FROM "Member")             AS members,
  (SELECT COUNT(*) FROM "Agreement")          AS agreements,
  (SELECT COUNT(*) FROM "Nominee")            AS nominees,
  (SELECT COUNT(*) FROM "AmcSchedule")        AS amc_schedules,
  (SELECT COUNT(*) FROM "PbsScheme")          AS pbs_schemes,
  (SELECT COUNT(*) FROM "PbsClaim")           AS pbs_claims,
  (SELECT COUNT(*) FROM "AmcInvoice")         AS amc_invoices,
  (SELECT COUNT(*) FROM "RciEnrolment")       AS rci_enrolments,
  (SELECT COUNT(*) FROM "RciWeek")            AS rci_weeks,
  (SELECT COUNT(*) FROM "RciBulkBank")        AS rci_bulk_bank,
  (SELECT COUNT(*) FROM "Salesperson")        AS salespersons,
  (SELECT COUNT(*) FROM "Product")            AS products,
  (SELECT COUNT(*) FROM "LvcCode")            AS lvc_codes,
  (SELECT COUNT(*) FROM "Resort")             AS resorts,
  (SELECT COUNT(*) FROM "ResortInfoLine")     AS resort_info_lines,
  (SELECT COUNT(*) FROM "ApartmentType")      AS apartment_types,
  (SELECT COUNT(*) FROM "ResortUnit")         AS resort_units,
  (SELECT COUNT(*) FROM "ResAvailMast")       AS res_avail,
  (SELECT COUNT(*) FROM "AptBlock")           AS apt_blocks,
  (SELECT COUNT(*) FROM "ResortMaintenance")  AS maintenance,
  (SELECT COUNT(*) FROM "Holiday")            AS holidays,
  (SELECT COUNT(*) FROM "CpSeasonDate")       AS cp_season_dates,
  (SELECT COUNT(*) FROM "SeasonPoint" WHERE "pointsType" = 'HOME') AS home_season_points,
  (SELECT COUNT(*) FROM "SeasonPoint" WHERE "pointsType" = 'AWAY') AS away_season_points,
  (SELECT COUNT(*) FROM "BookingEntitlement")   AS booking_ent,
  (SELECT COUNT(*) FROM "CpBookingEntitlement") AS cp_booking_ent,
  (SELECT COUNT(*) FROM "AmcInvoiceCounter")  AS amc_inv_counters,
  (SELECT COUNT(*) FROM "State")              AS states,
  (SELECT COUNT(*) FROM "CancellationReason") AS can_reasons,
  (SELECT COUNT(*) FROM "User")               AS users;
"@

$elapsed = (Get-Date) - $startTime
Write-Host ""
Write-Host ("=" * 62) -ForegroundColor Green
Write-Host ("  Refresh complete in {0:mm}m {0:ss}s" -f $elapsed) -ForegroundColor Green
Write-Host ("=" * 62) -ForegroundColor Green
Write-Host ""
