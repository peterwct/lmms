#Requires -Version 5.1
<#
.SYNOPSIS
    Copy the STAGING database up to the VPS (test server).

.DESCRIPTION
    Steps 4-5 of a data refresh. The Informix importers must never run on the
    2 GB VPS, so the sequence is:

      1. Re-export from Informix
      2. refresh-test-db.ps1 against STAGING (199.1.1.32)
      3. Verify the row counts THERE, where a bad import is cheap to redo
      4. pg_dump staging  ->  copy up  ->  pg_restore on the VPS   <-- this script
      5. Re-grant lhb_app, restart PM2                             <-- this script

    RUN THIS ON THE DEV MACHINE. It drives both boxes over WinRM, the same
    transport deploy-test.ps1 uses. The dump transits this machine because
    PowerShell cannot copy session-to-session in one hop.

    THIS REPLACES THE VPS DATABASE. Everything keyed in UAT since the last sync
    is destroyed. A safety dump is taken on the VPS first unless -SkipSafetyBackup.

.PARAMETER DryRun
    Open both sessions, print the plan and staging's row counts, change nothing.

.EXAMPLE
    .\sync-vps-db.ps1 -DryRun
    .\sync-vps-db.ps1
#>
param(
    [string]$StagingHost  = '199.1.1.32',
    [string]$VpsHost      = '124.217.245.161',
    [string]$StagingUser  = 'admin',
    [string]$VpsUser      = 'Administrator',
    [string]$Database     = 'lhb_mms',
    [string]$StagingPgBin = 'E:\PostgreSQL18\bin',
    [string]$VpsPgBin     = 'C:\PostgreSQL18\bin',
    [string]$StagingTemp  = 'E:\Backup\sync',
    [string]$VpsTemp      = 'C:\backups\sync',
    [string]$LocalTemp    = "$env:TEMP\lmms-sync",
    [string]$PmName       = 'lhb-mms-backend',
    [switch]$SkipSafetyBackup,
    [switch]$Force,
    [switch]$DryRun
)

# -- reject unknown parameters (same guard as deploy-test.ps1) -----------------
# A plain param() block silently drops unrecognised switches into $args, so a
# typo would run a FULL sync with the mistyped flag quietly ignored.
if ($args.Count -gt 0) {
    $valid = @($MyInvocation.MyCommand.Parameters.Keys)
    Write-Host ""
    Write-Host "  ABORTED - unrecognised parameter(s):" -ForegroundColor Red
    foreach ($bad in $args) {
        $stem = ([string]$bad).TrimStart('-')
        $head = $stem.Substring(0, [Math]::Min(4, $stem.Length)).ToLower()
        $near = @($valid | Where-Object { $_.ToLower().StartsWith($head) })
        if ($near.Count -gt 0) {
            Write-Host ("    " + $bad + "   -- did you mean -" + $near[0] + " ?") -ForegroundColor Red
        } else {
            Write-Host ("    " + $bad) -ForegroundColor Red
        }
    }
    Write-Host ""
    exit 1
}

$ErrorActionPreference = 'Stop'

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Cyan }
function OK($m)   { Write-Host "    [OK] $m"   -ForegroundColor Green }
function Warn($m) { Write-Host "    [WARN] $m" -ForegroundColor Yellow }
function Bad($m)  { Write-Host "    [FAIL] $m" -ForegroundColor Red }

$stamp  = Get-Date -Format 'yyyyMMdd-HHmm'
$dumpNm = "lhb_mms_sync_$stamp.dump"
$sSess  = $null
$vSess  = $null
$pmDown = $false

# No double quotes anywhere in this SQL: PowerShell 5.1 strips them on the way
# to a native exe, so "Member" would arrive bare and fold to lowercase.
# format('%I') does the quoting server-side instead.
$countSql = "SELECT table_name || ',' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I','public',table_name), false, true, '')))[1]::text FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;"

# Sessions must be torn down on ANY terminating error - leaked remote shells
# exhaust MaxShellsPerUser and every later New-PSSession then times out.
trap {
    foreach ($s in @($sSess, $vSess)) {
        if ($s) { Remove-PSSession $s -ErrorAction SilentlyContinue }
    }
}

try {
    # -- Phase 0: connect -----------------------------------------------------
    Step "Phase 0 - connecting"

    # Qualified usernames: both boxes are workgroup and we connect by IP, so a
    # bare name gives the client no account context and it stalls until timeout.
    $sCred = Get-Credential -UserName "$StagingHost\$StagingUser" -Message "STAGING ($StagingHost)"
    $vCred = Get-Credential -UserName "$VpsHost\$VpsUser"         -Message "VPS ($VpsHost)"

    $sSess = New-PSSession -ComputerName $StagingHost -Credential $sCred
    OK "Staging session open ($StagingHost)"
    $vSess = New-PSSession -ComputerName $VpsHost -Credential $vCred
    OK "VPS session open ($VpsHost)"

    $sPgPw = Read-Host "STAGING postgres password"
    $vPgPw = Read-Host "VPS postgres password"

    $t = Invoke-Command -Session $sSess -ArgumentList $StagingPgBin -ScriptBlock {
        param($bin)
        (Test-Path (Join-Path $bin 'pg_dump.exe')) -and (Test-Path (Join-Path $bin 'psql.exe'))
    }
    if (-not $t) { throw "PostgreSQL tools not found in $StagingPgBin on staging" }

    $t = Invoke-Command -Session $vSess -ArgumentList $VpsPgBin -ScriptBlock {
        param($bin)
        (Test-Path (Join-Path $bin 'pg_restore.exe')) -and (Test-Path (Join-Path $bin 'psql.exe'))
    }
    if (-not $t) { throw "PostgreSQL tools not found in $VpsPgBin on the VPS" }
    OK "Client tools present on both boxes"

    # -- Phase 1: staging counts ---------------------------------------------
    Step "Phase 1 - staging row counts (the source of truth)"
    $srcCounts = Invoke-Command -Session $sSess -ArgumentList $StagingPgBin, $Database, $sPgPw, $countSql -ScriptBlock {
        param($bin, $db, $pw, $sql)
        $env:PGPASSWORD = $pw
        try {
            $o = & (Join-Path $bin 'psql.exe') -U postgres -d $db -t -A -c $sql 2>&1
            if ($LASTEXITCODE -ne 0) { throw "psql failed ($LASTEXITCODE): $o" }
            $o
        }
        finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
    }
    if (-not $srcCounts) { throw "Staging returned no counts" }
    OK "$($srcCounts.Count) tables on staging"
    $srcCounts | Where-Object { $_ -match '^(Member|Agreement|RciEnrolment|ResAvailMast|_prisma_migrations),' } |
        ForEach-Object { Write-Host "      $_" }

    # -- Phase 2: confirm -----------------------------------------------------
    Step "Phase 2 - confirm"
    Write-Host ""
    Write-Host "  Staging $StagingHost  ->  VPS $VpsHost" -ForegroundColor Yellow
    Write-Host "  This REPLACES '$Database' on the VPS. UAT edits since the last sync are lost." -ForegroundColor Yellow
    if ($SkipSafetyBackup) {
        Write-Host "  VPS safety dump: SKIPPED (-SkipSafetyBackup)" -ForegroundColor Yellow
    } else {
        Write-Host "  VPS safety dump: yes, to $VpsTemp" -ForegroundColor Yellow
    }
    Write-Host ""

    if ($DryRun) { Warn "DryRun - stopping here. Nothing was changed."; return }
    if (-not $Force) {
        $typed = Read-Host "Type the database name ($Database) to proceed"
        if ($typed -ne $Database) { throw "Confirmation did not match - nothing was changed." }
    }

    # -- Phase 3: dump on staging --------------------------------------------
    Step "Phase 3 - pg_dump on staging"
    $src = Invoke-Command -Session $sSess -ArgumentList $StagingPgBin, $Database, $sPgPw, $StagingTemp, $dumpNm -ScriptBlock {
        param($bin, $db, $pw, $tmp, $name)
        New-Item -ItemType Directory -Force $tmp | Out-Null
        $out = Join-Path $tmp $name
        $env:PGPASSWORD = $pw
        & (Join-Path $bin 'pg_dump.exe') -U postgres -F c -Z 6 -f $out $db
        $code = $LASTEXITCODE
        Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
        # ErrorActionPreference does NOT apply to a native exe, and pg_dump -f
        # truncates its output BEFORE connecting - a failure leaves a 0-byte file.
        if ($code -ne 0) { throw "pg_dump exited $code" }
        $len = (Get-Item $out).Length
        if ($len -lt 1MB) { Remove-Item $out -Force; throw "Dump is only $len bytes" }
        [pscustomobject]@{
            Path   = $out
            Length = $len
            Hash   = (Get-FileHash $out -Algorithm SHA256).Hash
        }
    }
    OK ("Dumped {0:N1} MB on staging" -f ($src.Length / 1MB))

    # -- Phase 4: transit -----------------------------------------------------
    Step "Phase 4 - copying staging -> here -> VPS"
    New-Item -ItemType Directory -Force $LocalTemp | Out-Null
    $local = Join-Path $LocalTemp $dumpNm

    Copy-Item -FromSession $sSess -Path $src.Path -Destination $local -Force
    if ((Get-FileHash $local -Algorithm SHA256).Hash -ne $src.Hash) {
        throw "Hash mismatch after pulling from staging"
    }
    OK "Pulled to this machine, hash verified"

    Invoke-Command -Session $vSess -ArgumentList $VpsTemp -ScriptBlock {
        param($tmp) New-Item -ItemType Directory -Force $tmp | Out-Null
    }
    $remote = Join-Path $VpsTemp $dumpNm
    Copy-Item -ToSession $vSess -Path $local -Destination $remote -Force

    $vHash = Invoke-Command -Session $vSess -ArgumentList $remote -ScriptBlock {
        param($p) (Get-FileHash $p -Algorithm SHA256).Hash
    }
    # A truncated transfer leaves a file that exists and looks plausible.
    if ($vHash -ne $src.Hash) { throw "Hash mismatch after pushing to the VPS" }
    OK "Pushed to the VPS, hash verified"

    # -- Phase 5: restore on the VPS -----------------------------------------
    Step "Phase 5 - stopping PM2 and restoring on the VPS"
    Invoke-Command -Session $vSess -ArgumentList $PmName -ScriptBlock {
        param($pm) & pm2 stop $pm 2>&1 | Out-Null
    }
    $pmDown = $true
    OK "PM2 '$PmName' stopped"

    $dstCounts = Invoke-Command -Session $vSess -ScriptBlock {
        param($bin, $db, $pw, $sql, $dump, $skipSafety, $tmp, $st)
        $psql = Join-Path $bin 'psql.exe'
        $env:PGPASSWORD = $pw
        try {
            function Sql([string]$d, [string]$q) {
                $o = & $psql -U postgres -d $d -t -A -c $q 2>&1
                if ($LASTEXITCODE -ne 0) { throw "psql failed ($LASTEXITCODE): $o" }
                $o
            }

            if (-not $skipSafety) {
                $safe = Join-Path $tmp "lhb_mms_pre_$st.dump"
                & (Join-Path $bin 'pg_dump.exe') -U postgres -F c -Z 6 -f $safe $db
                if ($LASTEXITCODE -ne 0) { throw "VPS safety pg_dump exited $LASTEXITCODE - aborting before anything destructive" }
                if ((Get-Item $safe).Length -lt 1MB) { throw "VPS safety dump implausibly small - aborting" }
            }

            # Stragglers (pgAdmin, a psql window) hold the DB open and DROP fails.
            Sql 'postgres' "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$db' AND pid <> pg_backend_pid();" | Out-Null
            Sql 'postgres' "DROP DATABASE IF EXISTS $db;" | Out-Null
            # No OWNER clause: postgres keeps ownership, which is what lets
            # deploy-test.ps1 -MigrateDb keep working (migrate deploy runs as postgres).
            Sql 'postgres' "CREATE DATABASE $db;" | Out-Null

            & (Join-Path $bin 'pg_restore.exe') -U postgres -d $db --no-owner --no-privileges --exit-on-error $dump
            if ($LASTEXITCODE -ne 0) { throw "pg_restore exited $LASTEXITCODE - the database is INCOMPLETE" }

            # A restore recreates every table and grants do NOT come with them.
            Sql $db "GRANT USAGE ON SCHEMA public TO lhb_app;" | Out-Null
            Sql $db "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO lhb_app;" | Out-Null
            Sql $db "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO lhb_app;" | Out-Null

            Sql $db $sql
        }
        finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
    } -ArgumentList $VpsPgBin, $Database, $vPgPw, $countSql, $remote, [bool]$SkipSafetyBackup, $VpsTemp, $stamp
    OK "Restored and lhb_app re-granted"

    # -- Phase 6: compare -----------------------------------------------------
    Step "Phase 6 - staging vs VPS"
    $diff = Compare-Object $srcCounts $dstCounts
    if ($diff) {
        Warn "Counts differ:"
        $diff | ForEach-Object {
            if ($_.SideIndicator -eq '=>') { $side = 'VPS    ' } else { $side = 'staging' }
            Write-Host ("      {0}  {1}" -f $side, $_.InputObject) -ForegroundColor Yellow
        }
        Warn "Investigate before handing the VPS back to users."
    } else {
        OK "Identical - $($dstCounts.Count) tables match exactly"
    }

    # -- Phase 7: restart -----------------------------------------------------
    Step "Phase 7 - restarting PM2"
    $health = Invoke-Command -Session $vSess -ArgumentList $PmName -ScriptBlock {
        param($pm)
        & pm2 start $pm 2>&1 | Out-Null
        & pm2 save 2>&1 | Out-Null
        Start-Sleep -Seconds 5
        try { (Invoke-WebRequest 'http://127.0.0.1:3001/api/health' -UseBasicParsing -TimeoutSec 15).StatusCode }
        catch { "FAIL: $($_.Exception.Message)" }
    }
    $pmDown = $false
    if ($health -eq 200) {
        OK "Backend health: HTTP 200"
    } else {
        Bad "Health check: $health"
        Warn "Check: pm2 logs $PmName --err --lines 30 --nostream"
    }

    # -- Phase 8: tidy --------------------------------------------------------
    Step "Phase 8 - removing transit copies"
    Invoke-Command -Session $sSess -ArgumentList $src.Path -ScriptBlock {
        param($p) Remove-Item $p -Force -ErrorAction SilentlyContinue
    }
    Invoke-Command -Session $vSess -ArgumentList $remote -ScriptBlock {
        param($p) Remove-Item $p -Force -ErrorAction SilentlyContinue
    }
    Remove-Item $local -Force -ErrorAction SilentlyContinue
    OK "Transit copies removed (the VPS safety dump is kept)"

    Write-Host "`n======================================================" -ForegroundColor Cyan
    Write-Host "  Sync complete. Log in at https://mms.leisureholidays.com.my" -ForegroundColor Green
    Write-Host "======================================================" -ForegroundColor Cyan
}
catch {
    Write-Host ""
    Bad $_.Exception.Message
    if ($pmDown) {
        Write-Host ""
        Write-Host "  PM2 on the VPS was left STOPPED deliberately - do not start it against a" -ForegroundColor Yellow
        Write-Host "  half-restored database. RDP to the VPS and roll back from the safety dump:" -ForegroundColor Yellow
        Write-Host "    lhb_mms_pre_$stamp.dump  in  $VpsTemp" -ForegroundColor Gray
        Write-Host "    drop + create the database, pg_restore --no-owner --no-privileges," -ForegroundColor Gray
        Write-Host "    re-run the GRANT block, then: pm2 start $PmName" -ForegroundColor Gray
    }
    Write-Host ""
    exit 1
}
finally {
    foreach ($s in @($sSess, $vSess)) {
        if ($s) { Remove-PSSession $s -ErrorAction SilentlyContinue }
    }
}
