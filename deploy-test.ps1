<#
.SYNOPSIS
    Deploy LHB MMS changes to test server at 199.1.1.32.

.DESCRIPTION
    Uses PowerShell Remoting (WinRM) — built into Windows, no extra software needed.
    Files are copied via the PS session; PM2 and Prisma are controlled remotely.

    ONE-TIME SETUP (run once on the test server via RDP, as Administrator):
        Enable-PSRemoting -Force
        New-NetFirewallRule -Name "WinRM-HTTP" -DisplayName "WinRM HTTP" -Enabled True -Direction Inbound -Protocol TCP -LocalPort 5985 -Action Allow

    ONE-TIME SETUP (run once on this dev machine, as Administrator):
        Set-Item WSMan:\localhost\Client\TrustedHosts -Value "199.1.1.32" -Force

.PARAMETER RemoteUser
    Username on the test server (default: Administrator)

.PARAMETER SkipFrontend
    Skip frontend build and copy. Use when only backend/schema files changed.

.PARAMETER SchemaChanged
    Run `prisma generate` on the test server after copying.
    Required when prisma/schema.prisma is modified (relation renames, field additions).
    Does NOT run a database migration — use -MigrateDb for that.

.PARAMETER MigrateDb
    Copy prisma/migrations and run `prisma migrate deploy` on the test server.
    Use only when new migration files were added under prisma/migrations/.

.PARAMETER InstallPackages
    Copy backend/package.json and run `npm install --omit=dev` on the test server.
    Use when new npm packages were added to backend/package.json.

.PARAMETER DryRun
    Print all steps without executing them.

.EXAMPLE
    # Backend controllers changed only (most common)
    .\deploy-test.ps1 -SkipFrontend

    # prisma/schema.prisma changed (relation renames, no DB migration)
    .\deploy-test.ps1 -SkipFrontend -SchemaChanged

    # New Prisma migration added (schema + DB change)
    .\deploy-test.ps1 -SkipFrontend -SchemaChanged -MigrateDb

    # New npm package added to backend/package.json
    .\deploy-test.ps1 -SkipFrontend -InstallPackages

    # Frontend changed (React/Tailwind -- rebuilds locally then copies dist/)
    .\deploy-test.ps1

    # Preview without executing
    .\deploy-test.ps1 -SkipFrontend -SchemaChanged -DryRun
#>
param(
    [string]$RemoteUser    = "Administrator",
    [string]$RemoteHost    = "199.1.1.32",
    [string]$RemotePath    = "E:\Apps\lhb-mms",
    [switch]$SkipFrontend,
    [switch]$SchemaChanged,
    [switch]$MigrateDb,
    [switch]$InstallPackages,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$LOCAL_ROOT = $PSScriptRoot

# ── helpers ───────────────────────────────────────────────────────────────────

function Step([string]$msg) { Write-Host "`n  $msg" -ForegroundColor Cyan }
function Info([string]$msg) { Write-Host "    $msg" -ForegroundColor DarkCyan }
function Ok  ([string]$msg) { Write-Host "    $msg" -ForegroundColor Green }

$banner = if ($DryRun) { " (DRY RUN)" } else { "" }
Write-Host "`n======================================" -ForegroundColor Green
Write-Host "  LHB MMS  ->  $RemoteHost$banner" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green

# ── 0. Validate WinRM TrustedHosts on this machine ───────────────────────────

Step "0. Checking WinRM TrustedHosts ..."
$trusted = (Get-Item WSMan:\localhost\Client\TrustedHosts -ErrorAction SilentlyContinue).Value
if ($trusted -notmatch [regex]::Escape($RemoteHost) -and $trusted -ne '*') {
    Write-Host "`n  [!] $RemoteHost is not in WinRM TrustedHosts." -ForegroundColor Yellow
    Write-Host "  Run this once in an elevated (Admin) PowerShell on THIS machine:" -ForegroundColor Yellow
    Write-Host "      Set-Item WSMan:\localhost\Client\TrustedHosts -Value '$RemoteHost' -Force" -ForegroundColor White
    Write-Host "`n  And on the TEST SERVER (via RDP, as Administrator):" -ForegroundColor Yellow
    Write-Host "      Enable-PSRemoting -Force" -ForegroundColor White
    Write-Host "      New-NetFirewallRule -Name 'WinRM-HTTP' -DisplayName 'WinRM HTTP' -Enabled True -Direction Inbound -Protocol TCP -LocalPort 5985 -Action Allow" -ForegroundColor White
    if (-not $DryRun) {
        $ans = Read-Host "`n  Continue anyway? (y/N)"
        if ($ans -ne 'y') { exit 1 }
    }
}

# ── 1. Connect to test server ─────────────────────────────────────────────────

Step "1. Connecting to $RemoteHost ..."
$session = $null
if (-not $DryRun) {
    $cred = Get-Credential -UserName $RemoteUser -Message "Enter password for $RemoteUser@$RemoteHost"
    try {
        $session = New-PSSession -ComputerName $RemoteHost -Credential $cred -ErrorAction Stop
        Ok "Connected."
    } catch {
        Write-Host "`n  [ERROR] Cannot connect to $RemoteHost via WinRM." -ForegroundColor Red
        Write-Host "  Make sure you have run the one-time setup on the test server (see script header)." -ForegroundColor Yellow
        throw
    }
}

# psql needs the postgres superuser password up front (for the GRANT step below).
# Without it, `psql -U postgres` blocks on an interactive password prompt that
# never arrives over a non-interactive remoting session, hanging forever.
$pgPassword = $null
if ($MigrateDb -and -not $DryRun) {
    $pgPassword = Read-Host "  Enter password for 'postgres' superuser on $RemoteHost (for the lhb_app GRANT step)" -AsSecureString
}

# ── helper: run a remote scriptblock ─────────────────────────────────────────

function Remote([string]$desc, [scriptblock]$sb, [object[]]$argList = @()) {
    Info "[remote] $desc"
    if (-not $DryRun) {
        Invoke-Command -Session $session -ScriptBlock $sb -ArgumentList $argList
    }
}

# ── helper: copy a local path to the remote session ──────────────────────────

function CopyTo([string]$src, [string]$dest, [string]$desc) {
    Info "[copy ] $desc"
    if (-not $DryRun) {
        Copy-Item -Path $src -Destination $dest -ToSession $session -Recurse -Force
    }
}

# ── 2. Build backend TypeScript ───────────────────────────────────────────────

Step "2. Building backend TypeScript ..."
if (-not $DryRun) {
    Push-Location (Join-Path $LOCAL_ROOT "backend")
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }
    Pop-Location
} else { Info "(would run: npm run build in backend/)" }

Step "2b. Syncing backend/dist ..."
CopyTo (Join-Path $LOCAL_ROOT "backend\dist") "$RemotePath\backend\" "backend\dist -> $RemotePath\backend\dist"

if ($InstallPackages) {
    Step "2c. Syncing backend/package.json ..."
    CopyTo (Join-Path $LOCAL_ROOT "backend\package.json") "$RemotePath\backend\package.json" "backend\package.json"
}

# ── 3. Copy prisma/schema.prisma ──────────────────────────────────────────────

Step "3. Syncing prisma/schema.prisma ..."
CopyTo (Join-Path $LOCAL_ROOT "prisma\schema.prisma") "$RemotePath\prisma\schema.prisma" "prisma\schema.prisma"

if ($MigrateDb) {
    Step "3b. Syncing prisma/migrations ..."
    CopyTo (Join-Path $LOCAL_ROOT "prisma\migrations") "$RemotePath\prisma\" "prisma\migrations\"
}

# ── 4. Frontend (optional) ────────────────────────────────────────────────────

if (-not $SkipFrontend) {
    Step "4. Building frontend locally ..."
    if (-not $DryRun) {
        Push-Location (Join-Path $LOCAL_ROOT "frontend")
        npm run build
        if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
        Pop-Location
    } else { Info "(would run: npm run build)" }

    Step "4b. Copying frontend/dist ..."
    CopyTo (Join-Path $LOCAL_ROOT "frontend\dist") "$RemotePath\frontend\" "frontend\dist -> $RemotePath\frontend\dist"
} else {
    Write-Host "`n  4. Frontend skipped (-SkipFrontend)" -ForegroundColor DarkGray
}

# ── 5. Stop PM2 ───────────────────────────────────────────────────────────────

Step "5. Stopping PM2 backend ..."
Remote "pm2 stop lhb-mms-backend" {
    pm2 stop lhb-mms-backend 2>$null
    # Wait until the backend really releases port 3001 -- a lingering node process
    # keeps the Prisma query-engine DLL locked and prisma generate fails with EPERM.
    for ($i = 0; $i -lt 10; $i++) {
        $conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
        if (-not $conn) { break }
        Start-Sleep -Seconds 1
    }
    $conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Warning ("Port 3001 still in use after pm2 stop (PID " + $conn[0].OwningProcess + ") - killing it so prisma generate does not hit a locked DLL")
        Stop-Process -Id $conn[0].OwningProcess -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    }
}

# ── 5b. npm install (optional) ────────────────────────────────────────────────

if ($InstallPackages) {
    Step "5b. Running npm install on backend ..."
    Remote "npm install --omit=dev" { param($p); Set-Location "$p\backend"; npm install --omit=dev 2>$null } @($RemotePath)
}

# ── 6. prisma migrate / generate ─────────────────────────────────────────────

if ($MigrateDb) {
    Step "6a. Running prisma migrate deploy ..."
    Remote "prisma migrate deploy" {
        param($p, $pw)
        Set-Location $p
        # Migrations MUST run as the postgres superuser (schema owner). lhb_app has
        # only DML grants (no CREATE, not table owner), so CREATE TABLE / FK / ALTER
        # steps fail with 'permission denied for schema public' (SQLSTATE 42501).
        # Build a postgres DATABASE_URL from the password already prompted for the
        # GRANT step; process env overrides any lhb_app value in a server .env.
        $plainPw = (New-Object System.Management.Automation.PSCredential('postgres', $pw)).GetNetworkCredential().Password
        $encPw = [uri]::EscapeDataString($plainPw)
        $env:DATABASE_URL = "postgresql://postgres:$encPw@localhost:5432/lhb_mms"
        # cmd /c with 2>&1 captures stderr as plain text (PS 5.1 would wrap it in
        # NativeCommandError records) so the real Prisma error is shown on failure
        $out = cmd /c "npx prisma migrate deploy 2>&1"
        $out | ForEach-Object { Write-Host "      $_" }
        if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed (exit $LASTEXITCODE)" }
    } @($RemotePath, $pgPassword)

    Step "6a2. Granting lhb_app permissions on new tables ..."
    Remote "psql GRANT" {
        param($pw)
        $cred = New-Object System.Management.Automation.PSCredential('postgres', $pw)
        $env:PGPASSWORD = $cred.GetNetworkCredential().Password
        try {
            & "E:\PostgreSQL18\bin\psql.exe" -U postgres -d lhb_mms -c "GRANT USAGE ON SCHEMA public TO lhb_app; GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lhb_app; GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lhb_app;" 2>$null
        } finally {
            Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        }
    } @($pgPassword)
}

if ($SchemaChanged -or $MigrateDb) {
    Step "6b. Running prisma generate ..."
    Remote "prisma generate" {
        param($p)
        Set-Location $p
        # cmd /c with 2>&1 captures stderr as plain text (PS 5.1 would wrap it in
        # NativeCommandError records) so the real Prisma error is shown on failure
        $out = cmd /c "npx prisma generate 2>&1"
        $out | ForEach-Object { Write-Host "      $_" }
        if ($LASTEXITCODE -ne 0) { throw "prisma generate failed (exit $LASTEXITCODE)" }
    } @($RemotePath)
}

# ── 7. Start PM2 ──────────────────────────────────────────────────────────────

Step "7. Starting PM2 backend ..."
Remote "pm2 delete + start" {
    param($p)
    # pm2 forks a persistent background daemon; if it inherits this session's
    # WinRM output pipes, Invoke-Command hangs forever waiting for them to close
    # (the daemon never exits). Routing through cmd with redirection to a log
    # file gives the daemon file handles instead, so cmd exits immediately and
    # Invoke-Command returns as soon as the pm2 CLI commands finish.
    $log = "$p\logs\pm2-restart.log"
    cmd /c "pm2 delete lhb-mms-backend > `"$log`" 2>&1 & pm2 start `"$p\backend\ecosystem.config.js`" --env production >> `"$log`" 2>&1"
} @($RemotePath)

# ── 8. Cleanup ────────────────────────────────────────────────────────────────

if ($session) { Remove-PSSession $session }

Write-Host "`n======================================" -ForegroundColor Green
if ($DryRun) {
    Write-Host "  DRY RUN complete - no changes made" -ForegroundColor Yellow
} else {
    Write-Host "  Deploy complete!" -ForegroundColor Green
    Write-Host "  http://$RemoteHost" -ForegroundColor Cyan
}
Write-Host "======================================`n" -ForegroundColor Green
