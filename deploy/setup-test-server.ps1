#Requires -RunAsAdministrator
<#
.SYNOPSIS
    LHB MMS Test Server Setup Script
    Run this ONCE on the test server (199.1.1.32) as Administrator.

.DESCRIPTION
    - Installs Node.js LTS, Git, NSSM, PM2
    - Creates PostgreSQL database lhb_mms and user lhb_app
    - Extracts the app to E:\Apps\lhb-mms
    - Creates .env, installs dependencies, runs migrations + seed
    - Builds backend and frontend
    - Configures nginx as a Windows service (NSSM)
    - Configures PM2 and registers it for auto-start on reboot

.NOTES
    Prerequisites on the test server:
      - PostgreSQL already installed at E:\PostgreSQL18
      - nginx for Windows extracted to C:\Apps\nginx\ (nginx.exe must exist)
      - This script file and lhb-mms-app.zip in the same folder (e.g. USB drive)

    Usage:
      Copy setup-test-server.ps1 and lhb-mms-app.zip to the same folder.
      Open PowerShell as Administrator, cd to that folder, then run:
        Set-ExecutionPolicy Bypass -Scope Process -Force
        .\setup-test-server.ps1
#>

$ErrorActionPreference = 'Stop'

# --- Configuration -----------------------------------------------------------

$AppDrive  = 'E:'
$AppRoot   = "$AppDrive\Apps\lhb-mms"
$NginxRoot = 'C:\Apps\nginx'
$PsqlExe   = "$AppDrive\PostgreSQL18\bin\psql.exe"
$DbName    = 'lhb_mms'
$DbUser    = 'lhb_app'
$ServerIp  = '199.1.1.32'
$AppPort   = '3001'
$NginxPort = '80'
$ZipName   = 'lhb-mms-deploy.zip'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$ScriptParent = Split-Path -Parent $ScriptDir

# --- Helpers -----------------------------------------------------------------

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "    [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    [WARN] $msg" -ForegroundColor Yellow }

function CommandExists($cmd) {
    $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

function RefreshPath {
    $env:PATH = [System.Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +
                [System.Environment]::GetEnvironmentVariable('PATH','User')
}

# --- Phase 0: Prerequisites --------------------------------------------------

Write-Step "Phase 0 - Checking and installing prerequisites"

if (CommandExists node) {
    Write-OK "Node.js already installed: $(node --version)"
} else {
    Write-Step "Installing Node.js LTS..."
    winget install --id OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
    RefreshPath
    if (-not (CommandExists node)) {
        throw "Node.js installation failed. Install manually from https://nodejs.org/"
    }
    Write-OK "Node.js installed: $(node --version)"
}

if (CommandExists git) {
    Write-OK "Git already installed: $(git --version)"
} else {
    Write-Step "Installing Git..."
    winget install --id Git.Git --silent --accept-package-agreements --accept-source-agreements
    RefreshPath
    Write-OK "Git installed."
}

if (CommandExists pm2) {
    Write-OK "PM2 already installed: $(pm2 --version)"
} else {
    Write-Step "Installing PM2..."
    npm install -g pm2
    npm install -g pm2-windows-startup
    Write-OK "PM2 installed."
}

if (CommandExists nssm) {
    Write-OK "NSSM already installed."
} else {
    Write-Step "Installing NSSM..."
    winget install --id NSSM.NSSM --silent --accept-package-agreements --accept-source-agreements
    RefreshPath
    if (CommandExists nssm) {
        Write-OK "NSSM installed."
    } else {
        Write-Warn "NSSM not found in PATH. Download from https://nssm.cc/download and add to PATH, then re-run."
    }
}

if (-not (Test-Path $PsqlExe)) {
    throw "psql.exe not found at $PsqlExe - verify PostgreSQL is installed at $AppDrive\PostgreSQL18\"
}
Write-OK "PostgreSQL found at $AppDrive\PostgreSQL18\"

if (-not (Test-Path "$NginxRoot\nginx.exe")) {
    Write-Host ""
    Write-Host "  nginx is NOT installed at $NginxRoot\nginx.exe" -ForegroundColor Yellow
    Write-Host "  Please:" -ForegroundColor Yellow
    Write-Host "    1. Download nginx for Windows from https://nginx.org/en/docs/windows.html" -ForegroundColor Yellow
    Write-Host "    2. Extract so that $NginxRoot\nginx.exe exists" -ForegroundColor Yellow
    Write-Host "    3. Re-run this script." -ForegroundColor Yellow
    throw "nginx not found at $NginxRoot\nginx.exe"
}
Write-OK "nginx found at $NginxRoot\nginx.exe"

# --- Phase 1: PostgreSQL database --------------------------------------------

Write-Step "Phase 1 - Setting up PostgreSQL database"

$DbPassword = Read-Host "Enter a strong password for PostgreSQL user '$DbUser' (min 8 chars)"
if ($DbPassword.Length -lt 8) {
    throw "Password too short (minimum 8 characters)."
}

Write-Host "  Creating database user '$DbUser'..."
$sqlUser = "DO " + '$' + '$' + " BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '" + $DbUser + "') THEN CREATE USER " + $DbUser + " WITH PASSWORD '" + $DbPassword + "'; END IF; END " + '$' + '$' + "; ALTER USER " + $DbUser + " WITH PASSWORD '" + $DbPassword + "';"
& $PsqlExe -U postgres -c $sqlUser
if ($LASTEXITCODE -ne 0) { throw "Failed to create/update database user." }

Write-Host "  Checking if database '$DbName' exists..."
$existsOutput = & $PsqlExe -U postgres -t -A -c "SELECT 1 FROM pg_database WHERE datname='$DbName';"
if ($existsOutput -match '1') {
    Write-Warn "Database '$DbName' already exists - skipping creation."
} else {
    Write-Host "  Creating database '$DbName'..."
    & $PsqlExe -U postgres -c "CREATE DATABASE $DbName OWNER $DbUser;"
    if ($LASTEXITCODE -ne 0) { throw "Failed to create database." }
}
& $PsqlExe -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DbName TO $DbUser;"

Write-Host "  Verifying connection as $DbUser..."
$null = & $PsqlExe -U $DbUser -d $DbName -h 127.0.0.1 -c "SELECT 1;"
if ($LASTEXITCODE -ne 0) {
    throw "Cannot connect as $DbUser to $DbName. Check pg_hba.conf allows md5/scram auth on 127.0.0.1."
}
Write-OK "Database ready."

# --- Phase 2: Extract application files --------------------------------------

Write-Step "Phase 2 - Extracting application files to $AppRoot"

# Look for the zip next to the script, then one level up (where it sits after extraction)
$ZipPath = Join-Path $ScriptDir $ZipName
if (-not (Test-Path $ZipPath)) {
    $ZipPath = Join-Path $ScriptParent $ZipName
}
if (-not (Test-Path $ZipPath)) {
    throw "Deployment zip not found. Place '$ZipName' either next to this script or in $ScriptParent and re-run."
}

New-Item -ItemType Directory -Force $AppRoot | Out-Null
New-Item -ItemType Directory -Force "$AppRoot\logs" | Out-Null

Write-Host "  Extracting $ZipName..."
Expand-Archive -Path $ZipPath -DestinationPath $AppRoot -Force
Write-OK "Files extracted to $AppRoot"

# --- Phase 3: Create .env file -----------------------------------------------

Write-Step "Phase 3 - Creating .env file"

$JwtSecret = -join ((1..64) | ForEach-Object { '{0:X2}' -f (Get-Random -Max 256) })

$FrontendUrl = if ($NginxPort -ne '80') { "http://${ServerIp}:${NginxPort}" } else { "http://${ServerIp}" }

$envLines = @(
    "DATABASE_URL=postgresql://${DbUser}:${DbPassword}@127.0.0.1:5432/${DbName}",
    "JWT_SECRET=${JwtSecret}",
    "JWT_EXPIRES_IN=8h",
    "PORT=${AppPort}",
    "NODE_ENV=production",
    "BCRYPT_ROUNDS=12",
    "FRONTEND_URL=${FrontendUrl}"
)
$envLines | Set-Content -Path "$AppRoot\.env" -Encoding UTF8
Write-OK ".env created (JWT secret auto-generated)."

Write-Host "  Updating ecosystem.config.js with generated credentials..."
$ecoPath = "$AppRoot\backend\ecosystem.config.js"
if (Test-Path $ecoPath) {
    $eco = Get-Content $ecoPath -Raw
    $eco = $eco -replace 'postgresql://lhb_app:CHANGE_ME@', "postgresql://${DbUser}:${DbPassword}@"
    $eco = $eco -replace 'CHANGE_ME_64_CHAR_RANDOM_STRING', $JwtSecret
    $eco = $eco -replace "http://199\.1\.1\.32", $FrontendUrl
    Set-Content -Path $ecoPath -Value $eco -Encoding UTF8
    Write-OK "ecosystem.config.js updated."
} else {
    Write-Warn "ecosystem.config.js not found at $ecoPath - update it manually."
}

# --- Phase 4: Install dependencies and run migrations ------------------------

Write-Step "Phase 4 - Installing dependencies"
Set-Location $AppRoot

Write-Host "  npm install (root)..."
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed at project root." }

Write-Host "  npm install (backend)..."
npm --prefix backend install
if ($LASTEXITCODE -ne 0) { throw "npm install failed in backend/." }

Write-Host "  npm install (frontend)..."
npm --prefix frontend install
if ($LASTEXITCODE -ne 0) { throw "npm install failed in frontend/." }

Write-Step "Phase 4b - Generating Prisma client"
npx prisma generate
if ($LASTEXITCODE -ne 0) { throw "prisma generate failed." }

Write-Step "Phase 4c - Running database migrations"
npx prisma migrate deploy
if ($LASTEXITCODE -ne 0) { throw "prisma migrate deploy failed." }

Write-Step "Phase 4d - Seeding reference data"
npm run prisma:seed
if ($LASTEXITCODE -ne 0) { throw "prisma seed failed." }
Write-OK "Database seeded. Default admin: admin / LHB@Admin2026!"

# --- Phase 5: Build backend and frontend -------------------------------------

Write-Step "Phase 5 - Building backend"
Set-Location "$AppRoot\backend"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Backend build failed." }
if (-not (Test-Path "$AppRoot\backend\dist\index.js")) {
    throw "backend/dist/index.js not found after build."
}
Write-OK "Backend built."

Write-Step "Phase 5b - Building frontend"
Set-Location "$AppRoot\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { throw "Frontend build failed." }
if (-not (Test-Path "$AppRoot\frontend\dist\index.html")) {
    throw "frontend/dist/index.html not found after build."
}
Write-OK "Frontend built."

Set-Location $AppRoot

# --- Phase 6: Configure nginx ------------------------------------------------

Write-Step "Phase 6 - Configuring nginx"

$nginxConfSrc = "$AppRoot\nginx\nginx.conf"
$nginxConfDst = "$NginxRoot\conf\nginx.conf"

if (-not (Test-Path $nginxConfSrc)) {
    throw "nginx.conf not found at $nginxConfSrc"
}

New-Item -ItemType Directory -Force "$NginxRoot\logs" | Out-Null
Copy-Item $nginxConfSrc $nginxConfDst -Force
Write-OK "nginx.conf copied to $nginxConfDst"

Set-Location $NginxRoot
& .\nginx.exe -t
if ($LASTEXITCODE -ne 0) { throw "nginx config test failed. Check $nginxConfDst" }
Write-OK "nginx config syntax OK."

$svcExists = Get-Service nginx -ErrorAction SilentlyContinue
if ($svcExists) {
    Write-Warn "nginx service already exists - stopping and reconfiguring."
    nssm stop nginx
    nssm remove nginx confirm
}
nssm install nginx "$NginxRoot\nginx.exe"
nssm set nginx AppDirectory $NginxRoot
nssm set nginx AppStdout "$NginxRoot\logs\service-out.log"
nssm set nginx AppStderr "$NginxRoot\logs\service-err.log"
nssm set nginx Start SERVICE_AUTO_START
nssm start nginx
Write-OK "nginx service installed and started."

$fwRule = Get-NetFirewallRule -DisplayName "LHB MMS nginx HTTP" -ErrorAction SilentlyContinue
if (-not $fwRule) {
    New-NetFirewallRule -DisplayName "LHB MMS nginx HTTP" `
        -Direction Inbound -Protocol TCP -LocalPort $NginxPort -Action Allow | Out-Null
    Write-OK "Firewall rule added for port $NginxPort."
} else {
    Write-OK "Firewall rule already exists."
}

Set-Location $AppRoot

# --- Phase 7: Start backend via PM2 ------------------------------------------

Write-Step "Phase 7 - Starting backend via PM2"

pm2 delete lhb-mms-backend
pm2 start backend/ecosystem.config.js --env production
if ($LASTEXITCODE -ne 0) { throw "PM2 failed to start the backend." }

pm2 save
pm2-startup install
Write-OK "PM2 backend started and registered for auto-start on reboot."

# --- Verification ------------------------------------------------------------

Write-Step "Verification"
Start-Sleep -Seconds 3

$checks = @(
    @{ Label = "Backend health (direct)"; Uri = "http://127.0.0.1:${AppPort}/api/health" },
    @{ Label = "Backend via nginx proxy"; Uri = "http://127.0.0.1/api/health" },
    @{ Label = "Frontend (nginx root)";   Uri = "http://127.0.0.1/" },
    @{ Label = "SPA routing (/members)";  Uri = "http://127.0.0.1/members" }
)

$allOk = $true
foreach ($check in $checks) {
    try {
        $resp = Invoke-WebRequest -Uri $check.Uri -UseBasicParsing -TimeoutSec 10
        if ($resp.StatusCode -eq 200) {
            Write-OK "$($check.Label) - HTTP 200"
        } else {
            Write-Warn "$($check.Label) - HTTP $($resp.StatusCode)"
            $allOk = $false
        }
    } catch {
        Write-Host "    [FAIL] $($check.Label) - $($_.Exception.Message)" -ForegroundColor Red
        $allOk = $false
    }
}

# --- Summary -----------------------------------------------------------------

Write-Host ""
Write-Host "======================================================" -ForegroundColor Cyan
if ($allOk) {
    Write-Host "  LHB MMS test server is UP at $FrontendUrl" -ForegroundColor Green
} else {
    Write-Host "  Setup completed with warnings - check errors above." -ForegroundColor Yellow
    Write-Host "  Run: pm2 logs lhb-mms-backend  to see backend errors." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "  Login:    $FrontendUrl" -ForegroundColor White
Write-Host "  Username: admin" -ForegroundColor White
Write-Host "  Password: LHB@Admin2026!" -ForegroundColor White
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Gray
Write-Host "    pm2 list                     - backend process status" -ForegroundColor Gray
Write-Host "    pm2 logs lhb-mms-backend     - live backend logs" -ForegroundColor Gray
Write-Host "    pm2 restart lhb-mms-backend  - restart backend" -ForegroundColor Gray
Write-Host "    Get-Service nginx            - nginx service status" -ForegroundColor Gray
Write-Host "======================================================" -ForegroundColor Cyan
