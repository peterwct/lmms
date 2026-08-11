<#
.SYNOPSIS
    LHB MMS -- Migrate a single table from Informix data without a full refresh.

.PARAMETER Table
    The table name to migrate. Supported values:
      Member            - All members + agreements + nominees (full reimport + patches)
      IndividualMember  - Individual members only (si_ind_mast.txt)
      CorporateMember   - Corporate members only (si_cor_mast.txt)
      Agreement         - Agreements + nominees only (si_entitlement.txt + patches)
      PbsScheme         - Zurich Payback Scheme (migrate-maa-mem.ts)
      PbsClaim          - PBS Claims (migrate-maa-claim.ts)
      AmcSchedule       - AMC Schedules (migrate-amc-schedules.ts)
      RciEnrol          - RCI enrollment / nominee (migrate-rci-enrol.ts)
      Salesperson       - Salesperson master (migrate-salesperson.ts)
      SuPtReason        - SU/PT reason codes: SuReason seed + Agreement.suCode/canCode backfill
                          (seed-su-reasons.ts + migrate-su-pt-reasons.ts)
      AmcInvoiceCounter - Per-coCode AMC invoice running number from ctrl_billtab.txt
                          (migrate-amc-invoice-counter.ts). Upsert; resets lastInvNo to
                          the Informix value -- do NOT run after go-live.
      Product           - Product / operating-company master (migrate-products.ts from
                          ps_company.txt; first 9 of 17 cols). Truncates + reimports.
                          Post-go-live products are maintained in MMS -- re-running
                          clobbers any edits made in the app.
      LvcCode           - LVC exchange-programme master (migrate-lvc-codes.ts from
                          lvc_master.txt; first 7 of 14 cols). Truncates + reimports.
                          Post-go-live LVC codes are maintained in MMS -- re-running
                          clobbers any edits made in the app.
      ApartmentType     - Apartment sleep types (migrate-apt-category.ts from
                          apt_category.txt; first 4 of 11 cols -- per-type check-in/out
                          times and the audit trailer are skipped). Truncates + reimports.
                          Supersedes the 9 rows formerly hardcoded in migrate-resorts.ts.
      Resort            - Resort master + resort info (migrate-resorts.ts from
                          resort_mast.txt + migrate-resort-info.ts from
                          ps_resort_info.txt). Truncates + reimports both.
                          Post-go-live resorts are maintained in MMS -- re-running
                          clobbers any edits made in the app.
      CpSeasonPoint     - HOME half of the season points chart (migrate-cp-season-points.ts
                          from ps_seasonapt.txt; first 12 of 24 cols). Points deducted per
                          night at the member's own product's resort.
      LvcSeasonPoint    - AWAY half of the season points chart (migrate-lvc-season-points.ts
                          from ps_lvcapt.txt; first 14 of 20 cols). Points charged to a CP
                          member booking a resort other than their home (coCode 02) resort.
                          Both halves live in the one SeasonPoint table and each clears only
                          its own pointsType. Need Resort present for the FK.
                          Reimports -- clobbers CRUD edits.

.PARAMETER DatabaseUrl
    PostgreSQL connection string. Defaults to $env:DATABASE_URL or .env file.

.PARAMETER DryRun
    Parse and validate source files without writing to the database.

.EXAMPLE
    .\migrate-table.ps1 -Table PbsClaim
    .\migrate-table.ps1 -Table IndividualMember
    .\migrate-table.ps1 -Table Agreement
    .\migrate-table.ps1 -Table PbsScheme -DryRun
    .\migrate-table.ps1 -Table SuPtReason                  # SU/PT reason backfill (suCode + canCode overwrite)
    .\migrate-table.ps1 -Table BookingEntitlement          # Booking entitlement nights used (LHC 03/15 only)
    .\migrate-table.ps1 -Table CpBookingEntitlement        # CP point balances per year (CP 02 only; truncates + reimports)
    .\migrate-table.ps1 -Table AmcInvoiceCounter           # Per-coCode AMC invoice running number (ctrl_billtab.txt)
    .\migrate-table.ps1 -Table Product                     # Product / company master (ps_company.txt; first 9 cols; truncates + reimports)
    .\migrate-table.ps1 -Table LvcCode                     # LVC exchange codes (lvc_master.txt; first 7 cols; truncates + reimports)
    .\migrate-table.ps1 -Table Resort                      # Resort master + info + units + availability + blocks (truncates + reimports)
    .\migrate-table.ps1 -Table ResAvailMast                # Per-day availability grid only (res_avail_mast.txt; truncates + reimports)
    .\migrate-table.ps1 -Table AptBlock                    # Availability blocks only (apt_block.txt; truncates + reimports)
    .\migrate-table.ps1 -Table ResortMaintenance           # Maintenance register only (resmt.txt; truncates + reimports)
    .\migrate-table.ps1 -Table CpSeasonDate                # CP season calendar (ps_seasondate.txt; one row per day, G/S/D; truncates + reimports)
    .\migrate-table.ps1 -Table CpSeasonPoint               # Season points, HOME half (ps_seasonapt.txt; first 12 cols; clears pointsType HOME + reimports)
    .\migrate-table.ps1 -Table LvcSeasonPoint              # Season points, AWAY half (ps_lvcapt.txt; first 14 of 20 cols; clears pointsType AWAY + reimports)
    .\migrate-table.ps1 -Table PbsClaim -DatabaseUrl "postgresql://postgres:PASSWORD@199.1.1.32:5432/lhb_mms"
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Member', 'IndividualMember', 'CorporateMember', 'Agreement', 'PbsScheme', 'PbsClaim', 'AmcSchedule', 'RciEnrol', 'Salesperson', 'SuPtReason', 'BookingEntitlement', 'CpBookingEntitlement', 'AmcInvoiceCounter', 'Product', 'LvcCode', 'Resort', 'ApartmentType', 'ResortUnit', 'AptBlock', 'ResAvailMast', 'ResortMaintenance', 'CpSeasonDate', 'CpSeasonPoint', 'LvcSeasonPoint')]
    [string]$Table,

    [string]$DatabaseUrl = $env:DATABASE_URL,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
if ((Split-Path $PSScriptRoot -Leaf) -ne 'scripts') {
    $root = $PSScriptRoot
}

Set-Location $root

# -- Auto-load DATABASE_URL from .env if not already set
if (-not $DatabaseUrl) {
    $envFile = Join-Path $root ".env"
    if (Test-Path $envFile) {
        $match = Get-Content $envFile | Where-Object { $_ -match '^DATABASE_URL\s*=\s*(.+)$' } | Select-Object -First 1
        if ($match -and $match -match '^DATABASE_URL\s*=\s*(.+)$') {
            $DatabaseUrl = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
}

if (-not $DatabaseUrl) {
    Write-Host ""
    Write-Host "ERROR: DATABASE_URL is not set." -ForegroundColor Red
    Write-Host '  $env:DATABASE_URL = "postgresql://postgres:PASSWORD@199.1.1.32:5432/lhb_mms"'
    Write-Host ""
    exit 1
}
$env:DATABASE_URL = $DatabaseUrl

# -- Table definitions: truncate SQL and migration scripts
$TableConfig = @{
    Member = @{
        TruncateSql = @(
            'TRUNCATE "PbsClaim", "PbsScheme", "Salesperson", "Member" CASCADE;'
        )
        RequiredFiles = @('si_ind_mast.txt', 'si_cor_mast.txt', 'si_entitlement.txt', 'amc_mem.txt', 'ps_amc_mem.txt', 'maa_mem.txt', 'maa_claim.txt', 'rci_enrol.txt', 'csp_mast.txt')
        Scripts = @(
            'prisma/migrate-informix.ts',
            'prisma/migrate-amc-schedules.ts',
            'prisma/migrate-maa-mem.ts',
            'prisma/migrate-maa-claim.ts',
            'prisma/migrate-rci-enrol.ts',
            'prisma/migrate-salesperson.ts'
        )
    }
    IndividualMember = @{
        TruncateSql = @(
            'DELETE FROM "Member" WHERE "memberType" = ''INDIVIDUAL'' AND "id" NOT IN (SELECT DISTINCT "memberId" FROM "Agreement");'
        )
        RequiredFiles = @('si_ind_mast.txt')
        Scripts = @(
            'prisma/migrate-informix.ts --only individuals'
        )
    }
    CorporateMember = @{
        TruncateSql = @(
            'DELETE FROM "Member" WHERE "memberType" = ''CORPORATE'' AND "id" NOT IN (SELECT DISTINCT "memberId" FROM "Agreement");'
        )
        RequiredFiles = @('si_cor_mast.txt')
        Scripts = @(
            'prisma/migrate-informix.ts --only corporates'
        )
    }
    Agreement = @{
        TruncateSql = @(
            'TRUNCATE "PbsClaim", "PbsScheme", "AmcSchedule", "Nominee", "AmcInvoice", "Agreement" CASCADE;'
        )
        RequiredFiles = @('si_entitlement.txt', 'rci_enrol.txt')
        Scripts = @(
            'prisma/migrate-informix.ts --only agreements',
            'prisma/migrate-rci-enrol.ts'
        )
    }
    PbsScheme = @{
        TruncateSql = @(
            'TRUNCATE "PbsScheme" CASCADE;'
        )
        RequiredFiles = @('maa_mem.txt')
        Scripts = @('prisma/migrate-maa-mem.ts')
    }
    PbsClaim = @{
        TruncateSql = @('TRUNCATE "PbsClaim";')
        RequiredFiles = @('maa_claim.txt')
        Scripts = @('prisma/migrate-maa-claim.ts')
    }
    AmcSchedule = @{
        TruncateSql = @('TRUNCATE "AmcSchedule" CASCADE;')
        RequiredFiles = @('amc_mem.txt', 'ps_amc_mem.txt')
        Scripts = @('prisma/migrate-amc-schedules.ts')
    }
    RciEnrol = @{
        TruncateSql = @()
        RequiredFiles = @('rci_enrol.txt')
        Scripts = @('prisma/migrate-rci-enrol.ts')
    }
    Salesperson = @{
        TruncateSql = @('TRUNCATE "Salesperson";')
        RequiredFiles = @('csp_mast.txt')
        Scripts = @('prisma/migrate-salesperson.ts')
    }
    SuPtReason = @{
        TruncateSql = @()
        RequiredFiles = @('su_mast.txt', 'su_trans.txt', 'pt_trans.txt')
        Scripts = @(
            'prisma/seed-su-reasons.ts',
            'prisma/migrate-su-pt-reasons.ts'
        )
    }
    BookingEntitlement = @{
        TruncateSql = @('TRUNCATE "BookingEntitlement";')
        RequiredFiles = @('booking_ent1.txt')
        Scripts = @('prisma/migrate-booking-entitlement.ts')
    }
    CpBookingEntitlement = @{
        TruncateSql = @('TRUNCATE "CpBookingEntitlement";')
        RequiredFiles = @('ps_bookent1.txt')
        Scripts = @('prisma/migrate-cp-booking-entitlement.ts')
    }
    AmcInvoiceCounter = @{
        # Small control table -- upsert-by-coCode, no truncate.
        # WARNING: re-running RESETS lastInvNo to the Informix value. OK for UAT
        # refreshes; do NOT run after go-live once the live system issues invoices.
        TruncateSql = @()
        RequiredFiles = @('ctrl_billtab.txt')
        Scripts = @('prisma/migrate-amc-invoice-counter.ts')
    }
    Product = @{
        # Product / operating-company master (ps_company.txt, first 9 of 17 cols).
        # Standalone -- no FKs point at it; Agreement/AmcSchedule/Resort carry coCode
        # as a plain string. Post-go-live products are maintained in MMS -- re-running
        # truncates and clobbers any edits made through the Products Setup CRUD.
        TruncateSql = @('TRUNCATE "Product";')
        RequiredFiles = @('ps_company.txt')
        Scripts = @('prisma/migrate-products.ts')
    }
    LvcCode = @{
        # LVC exchange-programme master (lvc_master.txt, first 7 of 14 cols).
        # Standalone -- nothing references it yet. Post-go-live LVC codes are
        # maintained in MMS -- re-running truncates and clobbers CRUD edits.
        TruncateSql = @('TRUNCATE "LvcCode";')
        RequiredFiles = @('lvc_master.txt')
        Scripts = @('prisma/migrate-lvc-codes.ts')
    }
    Resort = @{
        # Master data. Post-go-live resorts are maintained in MMS -- re-running
        # truncates and clobbers any edits made through the Resorts Setup CRUD.
        # Leaf tables truncated explicitly (TRUNCATE CASCADE unreliable).
        TruncateSql = @('TRUNCATE "SeasonPoint", "ResortMaintenance", "AptBlock", "ResAvailMast", "ResortUnit", "ApartmentType", "ResortInfoLine", "Resort";')
        RequiredFiles = @('resort_mast.txt', 'ps_resort_info.txt', 'apt_category.txt', 'apt_mast.txt', 'res_avail_mast.txt', 'apt_block.txt', 'resmt.txt', 'ps_seasonapt.txt', 'ps_lvcapt.txt')
        Scripts = @('prisma/migrate-resorts.ts', 'prisma/migrate-resort-info.ts', 'prisma/migrate-apt-category.ts', 'prisma/migrate-resort-units.ts', 'prisma/migrate-res-avail.ts', 'prisma/migrate-apt-block.ts', 'prisma/migrate-maintenance.ts', 'prisma/migrate-cp-season-points.ts', 'prisma/migrate-lvc-season-points.ts')
    }
    ApartmentType = @{
        # Apartment sleep types (apt_category.txt partial export: 4 of 11 cols).
        # Post-go-live types are maintained in MMS -- re-running clobbers CRUD edits.
        TruncateSql = @('TRUNCATE "ApartmentType";')
        RequiredFiles = @('apt_category.txt')
        Scripts = @('prisma/migrate-apt-category.ts')
    }
    ResortUnit = @{
        # Apartments/Units register (apt_mast.txt partial export: 5 of 15 cols).
        # Post-go-live units are maintained in MMS -- re-running clobbers CRUD edits.
        TruncateSql = @('TRUNCATE "ResortUnit";')
        RequiredFiles = @('apt_mast.txt')
        Scripts = @('prisma/migrate-resort-units.ts')
    }
    ResAvailMast = @{
        # Per-day availability grid (res_avail_mast.txt, cols 0-4). Generated table --
        # post-go-live it is maintained via the Units Availability CRUD; re-running clobbers edits.
        TruncateSql = @('TRUNCATE "ResAvailMast";')
        RequiredFiles = @('res_avail_mast.txt')
        Scripts = @('prisma/migrate-res-avail.ts')
    }
    AptBlock = @{
        # Availability blocks / input records (apt_block.txt, cols 0-4). Needs ResortUnit
        # present for the apartmentType lookup. Post-go-live re-import clobbers CRUD edits.
        TruncateSql = @('TRUNCATE "AptBlock";')
        RequiredFiles = @('apt_block.txt')
        Scripts = @('prisma/migrate-apt-block.ts')
    }
    ResortMaintenance = @{
        # Maintenance register (resmt.txt, cols 0-5). Needs ResortUnit present for the
        # apartmentType lookup. Does NOT adjust ResAvailMast -- res_avail_mast.txt was
        # exported with maintenance already deducted from bal_night, so re-applying the
        # per-day deltas here would double-count. Post-go-live re-import clobbers CRUD edits.
        TruncateSql = @('TRUNCATE "ResortMaintenance";')
        RequiredFiles = @('resmt.txt')
        Scripts = @('prisma/migrate-maintenance.ts')
    }
    CpSeasonDate = @{
        # CP season calendar (ps_seasondate.txt, cols 0-1) -- one row per calendar day
        # graded G/S/D. Read by CP booking only; the Holiday table (public + school) is
        # LHC-only and unrelated. Post-go-live re-import clobbers CRUD edits.
        TruncateSql = @('TRUNCATE "CpSeasonDate";')
        RequiredFiles = @('ps_seasondate.txt')
        Scripts = @('prisma/migrate-cp-seasons.ts')
    }
    CpSeasonPoint = @{
        # HOME half of the season points chart (ps_seasonapt.txt, first 12 of 24 cols) --
        # points deducted per night by resort x apartment type x season x day of week at
        # the member's own product's resort. Needs Resort present for the FK.
        # HOME and AWAY share the SeasonPoint table, so this scopes its clear by
        # pointsType rather than truncating the whole table.
        # Post-go-live re-import clobbers CRUD edits.
        TruncateSql = @('DELETE FROM "SeasonPoint" WHERE "pointsType" = ''HOME'';')
        RequiredFiles = @('ps_seasonapt.txt')
        Scripts = @('prisma/migrate-cp-season-points.ts')
    }
    LvcSeasonPoint = @{
        # AWAY half of the season points chart (ps_lvcapt.txt, first 14 of 20 cols) --
        # points charged to a CP member booking a resort OTHER than their home (coCode 02)
        # resort. The counterpart of the HOME half above; both live in SeasonPoint, so
        # this scopes its clear by pointsType rather than truncating the whole table.
        # Needs Resort present for the FK. Post-go-live re-import clobbers CRUD edits.
        TruncateSql = @('DELETE FROM "SeasonPoint" WHERE "pointsType" = ''AWAY'';')
        RequiredFiles = @('ps_lvcapt.txt')
        Scripts = @('prisma/migrate-lvc-season-points.ts')
    }
}

$config = $TableConfig[$Table]
$migrateDir = Join-Path $root "migrate"

# -- Validate source files
$missing = $config.RequiredFiles | Where-Object { -not (Test-Path (Join-Path $migrateDir $_)) }
if ($missing) {
    Write-Host ""
    Write-Host "ERROR: Missing source file(s) in migrate\:" -ForegroundColor Red
    $missing | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ""
    exit 1
}

# -- Show plan
Write-Host ""
Write-Host ("=" * 62)
Write-Host "  LHB MMS - Migrate Table: $Table"
Write-Host ("=" * 62)
Write-Host "  Target  : $DatabaseUrl"
Write-Host "  Mode    : $(if ($DryRun) { 'DRY RUN' } else { 'LIVE' })"
Write-Host "  Files   : $($config.RequiredFiles -join ', ')"
Write-Host "  Scripts : $($config.Scripts.Count)"
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

# -- Helper: run SQL without BOM
function Invoke-Sql {
    param([string]$Sql, [string]$Label)
    Write-Host ""
    Write-Host "  [SQL] $Label" -ForegroundColor Cyan
    if ($DryRun) { Write-Host "        (skipped - dry run)"; return }
    $tmp = Join-Path $root "_migrate_tmp.sql"
    [System.IO.File]::WriteAllText($tmp, $Sql)
    try {
        npx prisma db execute --url="$env:DATABASE_URL" --file $tmp
        if ($LASTEXITCODE -ne 0) { throw "SQL execution failed" }
    }
    finally {
        Remove-Item $tmp -ErrorAction SilentlyContinue
    }
}

# -- Helper: run a ts-node migration script (supports extra args, e.g. "prisma/migrate-informix.ts --only individuals")
function Invoke-Migration {
    param([string]$Script)
    $parts = $Script -split '\s+', 2
    $scriptPath = $parts[0]
    $extraArgs = if ($parts.Length -gt 1) { $parts[1] } else { '' }
    $label = (Split-Path $scriptPath -Leaf) + $(if ($extraArgs) { " $extraArgs" } else { '' })
    Write-Host ""
    Write-Host "  [RUN] $label" -ForegroundColor Cyan
    $allArgs = @('--transpile-only', $scriptPath)
    if ($extraArgs) { $allArgs += $extraArgs -split '\s+' }
    if ($DryRun) { $allArgs += '--dry-run' }
    & npx ts-node @allArgs
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "FAILED: $label" -ForegroundColor Red
        exit 1
    }
}

# -- Step 1: Truncate
Write-Host ""
Write-Host "[1/3] Truncating $Table..." -ForegroundColor Yellow
$sql = $config.TruncateSql -join "`n"
Invoke-Sql -Label "TRUNCATE $Table" -Sql $sql

# -- Step 2: Run migrations
Write-Host ""
Write-Host "[2/3] Running migration scripts..." -ForegroundColor Yellow
foreach ($script in $config.Scripts) {
    Invoke-Migration $script
}

# -- Step 3: Re-grant permissions
Write-Host ""
Write-Host "[3/3] Re-granting lhb_app permissions..." -ForegroundColor Yellow
Invoke-Sql -Label "GRANT lhb_app on public schema" -Sql @"
GRANT USAGE ON SCHEMA public TO lhb_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lhb_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lhb_app;
"@

$elapsed = (Get-Date) - $startTime
Write-Host ""
Write-Host ("=" * 62) -ForegroundColor Green
Write-Host ("  $Table migration complete in {0:mm}m {0:ss}s" -f $elapsed) -ForegroundColor Green
Write-Host ("=" * 62) -ForegroundColor Green
Write-Host ""
