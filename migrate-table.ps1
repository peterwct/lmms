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
    .\migrate-table.ps1 -Table PbsClaim -DatabaseUrl "postgresql://postgres:PASSWORD@199.1.1.32:5432/lhb_mms"
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Member', 'IndividualMember', 'CorporateMember', 'Agreement', 'PbsScheme', 'PbsClaim', 'AmcSchedule', 'RciEnrol', 'Salesperson', 'SuPtReason', 'BookingEntitlement')]
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
