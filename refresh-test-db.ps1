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
           e_rci_refno, e_rci_enrol_date, e_rci_expiry_date, e_rci_fee_paid,
           e_outstd_doc, e_doc_desc, e_locality, e_can_code, e_sysdate, e_mod_date,
           e_term_user, e_aterm_date, e_tfdate, e_ttdate, e_tfuser, e_ttuser
    FROM si_entitlement WHERE e_cocode IN ('03', '15', '02');

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

    Copy all output files into:  E:\Websites\lmms\migrate\
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
    'maa_claim.txt'
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
Write-Host ""
Write-Host "  Will PRESERVE:"
Write-Host "    User, Department, DeptModulePermission"
Write-Host "    State, CancellationReason"
Write-Host "    AmcPrice, AmcPricePoints"
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
Write-Host ""
Write-Host ("[1/5] Clearing Informix data tables...") -ForegroundColor Yellow

Invoke-Sql -Label "TRUNCATE Informix tables" -Sql @"
TRUNCATE "PbsClaim", "PbsScheme", "Member" CASCADE;
"@

# ── Step 2: Core member + agreement import ────────────────────────────────────
Write-Host ""
Write-Host ("[2/5] Importing members, agreements, nominees...") -ForegroundColor Yellow
Invoke-Migration "prisma/migrate-informix.ts" "migrate-informix.ts"

# ── Step 3: AMC schedules + Zurich PBS ───────────────────────────────────────
Write-Host ""
Write-Host ("[3/5] Importing AMC schedules and Zurich PBS...") -ForegroundColor Yellow
Invoke-Migration "prisma/migrate-amc-schedules.ts" "migrate-amc-schedules.ts"
Invoke-Migration "prisma/migrate-maa-mem.ts"       "migrate-maa-mem.ts"
Invoke-Migration "prisma/migrate-maa-claim.ts"     "migrate-maa-claim.ts"

# ── Step 5: Re-grant schema permissions to lhb_app ───────────────────────────
# Required whenever tables are dropped/recreated (e.g. prisma migrate reset).
# Safe to run after every refresh — GRANT is idempotent.
Write-Host ""
Write-Host ("[4/5] Re-granting schema permissions to lhb_app...") -ForegroundColor Yellow

Invoke-Sql -Label "GRANT lhb_app on public schema" -Sql @"
GRANT USAGE ON SCHEMA public TO lhb_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lhb_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lhb_app;
"@

# ── Step 6: Final counts ──────────────────────────────────────────────────────
Write-Host ""
Write-Host ("[5/5] Final record counts...") -ForegroundColor Yellow

Invoke-Sql -Label "Row counts" -Sql @"
SELECT
  (SELECT COUNT(*) FROM "Member")             AS members,
  (SELECT COUNT(*) FROM "Agreement")          AS agreements,
  (SELECT COUNT(*) FROM "Nominee")            AS nominees,
  (SELECT COUNT(*) FROM "AmcSchedule")        AS amc_schedules,
  (SELECT COUNT(*) FROM "PbsScheme")          AS pbs_schemes,
  (SELECT COUNT(*) FROM "PbsClaim")           AS pbs_claims,
  (SELECT COUNT(*) FROM "AmcInvoice")         AS amc_invoices,
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
