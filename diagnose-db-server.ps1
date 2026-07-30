<#
.SYNOPSIS
    Diagnose the PostgreSQL crash loop on the LHB MMS test server (199.1.1.32).

.DESCRIPTION
    Run this ON THE TEST SERVER over RDP, in an ELEVATED PowerShell window.

    Background: on 2026-07-28 both the dev and test logins were killed at once by
        "terminating connection because of crash of another server process"
    The server log showed the real cause:
        FATAL: could not reattach to shared memory (...): error code 1455
    Windows error 1455 is ERROR_COMMITMENT_LIMIT - "the paging file is too small
    for this operation to complete". PostgreSQL on Windows emulates fork(); each
    new backend must re-map shared memory at the same address. When Windows
    refuses the commit, the backend dies abnormally, and the postmaster reacts by
    killing every other session and entering crash recovery.

    PostgreSQL itself is NOT the hog (shared_buffers 128MB, 254MB database,
    12 backends). Something else on this box has exhausted the system commit
    charge. This script finds what.

    Everything here is READ-ONLY unless you pass -RestartPostgres.

.PARAMETER DataDir
    PostgreSQL data directory. Auto-detected from the service registration;
    falls back to E:\PostgreSQL18\data.

.PARAMETER LogLines
    How many recent matching server-log lines to display. Default 60.

.PARAMETER EventDays
    How many days of Windows event log and PostgreSQL server log to scan.
    Default 3. Ignored when -SinceLastBoot is given.

.PARAMETER SinceLastBoot
    Only count events that happened AFTER the current boot. Use this on a
    verification run: without it, sections 6 and 7 re-report the entire
    pre-fix history and every finding still reads FAIL even though the
    problem is resolved.

    Server-log lines are filtered by their own timestamp, not by file
    modification time. Both PostgreSQL timestamp forms are handled - the
    normal "+08" lines and the "GMT" lines that early-startup FATALs (such
    as the error-1455 reattach failures) are written with before the
    timezone is loaded.

.PARAMETER OutFile
    Optional path to save a full transcript, e.g. E:\pg-diag-2026-07-28.txt
    Send this file back for analysis.

.PARAMETER RestartPostgres
    THE ONLY ACTION THAT CHANGES ANYTHING. Restarts the PostgreSQL service to
    break the crash-recovery loop. Prompts for confirmation first. This drops
    all active connections - both the PM2 backend and any dev session.

.EXAMPLE
    .\diagnose-db-server.ps1 -OutFile E:\pg-diag.txt
    Read-only sweep, saved to a file.

.EXAMPLE
    .\diagnose-db-server.ps1 -SinceLastBoot -OutFile E:\pg-diag-after.txt
    Verification run after applying a fix and rebooting. Counts only what has
    happened since the current boot, so resolved history stops reading FAIL.

.EXAMPLE
    .\diagnose-db-server.ps1 -OutFile E:\pg-diag.txt -RestartPostgres
    Same as the first example, then offers to restart PostgreSQL at the end.

.NOTES
    PowerShell 5.1 compatible. ASCII only (PS 5.1 reads scripts as Windows-1252
    and mis-parses UTF-8 multi-byte characters inside string literals).
#>

[CmdletBinding()]
param(
    [string] $DataDir,
    [int]    $LogLines  = 60,
    [int]    $EventDays = 3,
    [string] $OutFile,
    [switch] $SinceLastBoot,
    [switch] $RestartPostgres
)

$ErrorActionPreference = 'Continue'

# ---------------------------------------------------------------- helpers ----

$script:Findings = @()

function Section([string] $Title) {
    Write-Host ''
    Write-Host ('=' * 78) -ForegroundColor DarkCyan
    Write-Host ('  ' + $Title) -ForegroundColor Cyan
    Write-Host ('=' * 78) -ForegroundColor DarkCyan
}

function Note([string] $Text) { Write-Host ('  ' + $Text) -ForegroundColor Gray }
function Good([string] $Text) { Write-Host ('  [OK]   ' + $Text) -ForegroundColor Green }

function Warn2([string] $Text) {
    Write-Host ('  [WARN] ' + $Text) -ForegroundColor Yellow
    $script:Findings += ('WARN  - ' + $Text)
}

function Bad([string] $Text) {
    Write-Host ('  [FAIL] ' + $Text) -ForegroundColor Red
    $script:Findings += ('FAIL  - ' + $Text)
}

function ToMB([double] $Bytes) { return [math]::Round($Bytes / 1MB, 0) }
function GBfromKB([double] $Kb) { return [math]::Round($Kb / 1MB, 2) }

function Get-PgLogLineTime([string] $Line) {
    # PostgreSQL writes TWO timestamp forms into the same log file:
    #   2026-07-28 15:18:09 +08        LOG:   ...    normal, timezone loaded
    #   2026-07-28 07:30:14.713 GMT [123] FATAL: ... early startup, before the
    #                                                timezone GUC is applied
    # The error-1455 reattach FATALs are always the GMT kind. Treating those as
    # local time would place them 8 hours in the past and silently drop genuine
    # post-boot failures from a -SinceLastBoot run, so both forms are converted
    # to local time properly. Returns $null for lines with no timestamp.

    if ($Line -notmatch '^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})(\.\d+)?\s+(GMT|UTC|[+-]\d{1,2}:?\d{0,2})\b') {
        return $null
    }

    $stamp = $Matches[1] -replace 'T', ' '
    $zone  = $Matches[3]

    $dt = [datetime]::MinValue
    $ok = [datetime]::TryParseExact($stamp, 'yyyy-MM-dd HH:mm:ss',
              [Globalization.CultureInfo]::InvariantCulture,
              [Globalization.DateTimeStyles]::None, [ref] $dt)
    if (-not $ok) { return $null }

    if ($zone -eq 'GMT' -or $zone -eq 'UTC') {
        return [datetime]::SpecifyKind($dt, 'Utc').ToLocalTime()
    }

    # Numeric offset: +08, -05, +0530, +05:30
    $sign = 1
    if ($zone.StartsWith('-')) { $sign = -1 }
    $digits = ($zone.TrimStart('+', '-')) -replace ':', ''

    $h = 0
    $m = 0
    if ($digits.Length -ge 2) { $h = [int] $digits.Substring(0, 2) }
    if ($digits.Length -ge 4) { $m = [int] $digits.Substring(2, 2) }

    $offset = [timespan]::FromMinutes($sign * (($h * 60) + $m))
    return [datetime]::SpecifyKind($dt.Subtract($offset), 'Utc').ToLocalTime()
}

if ($OutFile) {
    try {
        Start-Transcript -Path $OutFile -Force | Out-Null
        Write-Host ("Transcript: " + $OutFile) -ForegroundColor DarkGray
    } catch {
        Write-Host ("Could not start transcript: " + $_.Exception.Message) -ForegroundColor Yellow
    }
}

Write-Host ''
Write-Host '  LHB MMS - PostgreSQL crash-loop diagnostics' -ForegroundColor White
Write-Host ('  Run at ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) -ForegroundColor DarkGray

$isAdmin = ([Security.Principal.WindowsPrincipal] `
            [Security.Principal.WindowsIdentity]::GetCurrent() `
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Warn2 'Not running elevated. Event log and some process details will be incomplete. Re-run as Administrator.'
}

# ------------------------------------------------------- 1. system summary ---

Section '1. System'

$os = Get-CimInstance Win32_OperatingSystem
$cs = Get-CimInstance Win32_ComputerSystem

$uptime = (Get-Date) - $os.LastBootUpTime

Note ('Host          : ' + $env:COMPUTERNAME)
Note ('OS            : ' + $os.Caption + ' (build ' + $os.BuildNumber + ')')
Note ('Logical CPUs  : ' + $cs.NumberOfLogicalProcessors)
Note ('Last boot     : ' + $os.LastBootUpTime)
Note ('Uptime        : ' + [math]::Floor($uptime.TotalDays) + 'd ' + $uptime.Hours + 'h ' + $uptime.Minutes + 'm')

# The scan window for sections 6 and 7. -SinceLastBoot exists so a verification
# run does not re-report crashes that a fix has already resolved.
$bootTime = $os.LastBootUpTime

if ($SinceLastBoot) {
    $scanStart = $bootTime
    $scanLabel = 'since last boot, ' + $bootTime.ToString('yyyy-MM-dd HH:mm:ss')
} else {
    $scanStart = (Get-Date).AddDays(-$EventDays)
    $scanLabel = 'last ' + $EventDays + ' day(s)'
}

Note ('Scan window   : ' + $scanLabel + '   (sections 6 and 7)')
if (-not $SinceLastBoot) {
    Note '                pass -SinceLastBoot on a verification run to exclude already-fixed history'
}

# --------------------------------------------- 2. memory and commit charge ---

Section '2. Memory and commit charge  (the error-1455 smoking gun)'

$ramGB         = GBfromKB $os.TotalVisibleMemorySize
$freeRamGB     = GBfromKB $os.FreePhysicalMemory
$commitLimitGB = GBfromKB $os.TotalVirtualMemorySize   # this IS the commit limit
$commitFreeGB  = GBfromKB $os.FreeVirtualMemory
$commitUsedGB  = [math]::Round($commitLimitGB - $commitFreeGB, 2)

$commitPct = 0
if ($commitLimitGB -gt 0) {
    $commitPct = [math]::Round(($commitUsedGB / $commitLimitGB) * 100, 1)
}

Note ('Physical RAM      : ' + $ramGB         + ' GB')
Note ('  free            : ' + $freeRamGB     + ' GB')
Note ('Commit limit      : ' + $commitLimitGB + ' GB   (RAM + pagefile)')
Note ('  committed       : ' + $commitUsedGB  + ' GB   (' + $commitPct + '% used)')
Note ('  available       : ' + $commitFreeGB  + ' GB')

# Peak commit is the number that proves whether we hit the ceiling earlier,
# even if the box looks calm right now.
try {
    $peak = Get-Counter '\Memory\Committed Bytes' -ErrorAction Stop
    $nowCommitGB = [math]::Round($peak.CounterSamples[0].CookedValue / 1GB, 2)
    Note ('  perf counter    : ' + $nowCommitGB + ' GB committed right now')
} catch {
    Note '  perf counter    : unavailable (localized counter names?)'
}

if ($commitPct -ge 90) {
    Bad ('Commit charge at ' + $commitPct + '% - this is what produces error 1455. PostgreSQL backends cannot start.')
} elseif ($commitPct -ge 75) {
    Warn2 ('Commit charge at ' + $commitPct + '% - little headroom. A spike will trigger error 1455 again.')
} else {
    Good ('Commit charge at ' + $commitPct + '% right now. If crashes continue, the spike is intermittent - check peak pagefile usage in section 3 and the leak candidates in section 4.')
}

$headroomGB = [math]::Round($commitLimitGB - $ramGB, 2)
if ($headroomGB -lt ($ramGB * 0.5)) {
    Warn2 ('Commit limit is only ' + $headroomGB + ' GB above physical RAM. Pagefile is too small - see section 3.')
}

# --------------------------------------------------------- 3. the pagefile ---

Section '3. Pagefile  (prime suspect for error 1455)'

Note ('AutomaticManagedPagefile : ' + $cs.AutomaticManagedPagefile)

$pfUsage = @(Get-CimInstance Win32_PageFileUsage -ErrorAction SilentlyContinue)

if ($pfUsage.Count -eq 0) {
    Bad 'NO PAGEFILE IS ACTIVE. With the pagefile disabled the commit limit equals physical RAM, which is exactly how error 1455 happens. Fix this first.'
} else {
    foreach ($pf in $pfUsage) {
        Note ''
        Note ('File          : ' + $pf.Name)
        Note ('  allocated   : ' + $pf.AllocatedBaseSize + ' MB')
        Note ('  in use now  : ' + $pf.CurrentUsage      + ' MB')
        Note ('  peak usage  : ' + $pf.PeakUsage         + ' MB')

        if ($pf.AllocatedBaseSize -gt 0) {
            $peakPct = [math]::Round(($pf.PeakUsage / $pf.AllocatedBaseSize) * 100, 1)
            if ($peakPct -ge 90) {
                Bad ('Pagefile ' + $pf.Name + ' peaked at ' + $peakPct + '% of its allocated size. It ran out - this is the crash cause.')
            } elseif ($peakPct -ge 70) {
                Warn2 ('Pagefile ' + $pf.Name + ' peaked at ' + $peakPct + '% of allocated size.')
            }
        }

        $recommendedMB = [int]($ramGB * 1024 * 1.5)
        if ($pf.AllocatedBaseSize -lt $recommendedMB) {
            Warn2 ('Pagefile ' + $pf.Name + ' is ' + $pf.AllocatedBaseSize +
                   ' MB; recommended for ' + $ramGB + ' GB RAM is at least ' + $recommendedMB + ' MB (1.5x RAM).')
        }
    }
}

Note ''
Note 'Configured pagefile settings (Win32_PageFileSetting):'
$pfSetting = @(Get-CimInstance Win32_PageFileSetting -ErrorAction SilentlyContinue)
if ($pfSetting.Count -eq 0) {
    Note '  (none explicitly configured - system managed, or disabled)'
} else {
    foreach ($s in $pfSetting) {
        $init = $s.InitialSize
        $max  = $s.MaximumSize
        if ($init -eq 0 -and $max -eq 0) {
            Note ('  ' + $s.Name + ' : system managed')
        } else {
            Note ('  ' + $s.Name + ' : initial ' + $init + ' MB, maximum ' + $max + ' MB')
        }
    }
}

Note ''
Note 'Disk free space (a pagefile cannot grow on a full drive):'
$disks = Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3'
foreach ($d in $disks) {
    $freeGB  = [math]::Round($d.FreeSpace / 1GB, 1)
    $totalGB = [math]::Round($d.Size      / 1GB, 1)
    $pctFree = 0
    if ($d.Size -gt 0) { $pctFree = [math]::Round(($d.FreeSpace / $d.Size) * 100, 1) }
    Note ('  ' + $d.DeviceID + ' ' + $freeGB + ' GB free of ' + $totalGB + ' GB (' + $pctFree + '% free)')
    if ($pctFree -lt 10) {
        Bad ('Drive ' + $d.DeviceID + ' is ' + $pctFree + '% free. A system-managed pagefile there cannot expand.')
    }
}

# ---------------------------------------------- 4. who is eating the memory --

Section '4. Top memory consumers  (who exhausted the commit charge)'

Note 'Private_MB is committed memory - that is what counts against the commit limit.'
Note ''

$procs = Get-Process | Sort-Object PrivateMemorySize64 -Descending

$procs |
    Select-Object -First 20 @{n='Name';e={$_.Name}},
                            @{n='Id';e={$_.Id}},
                            @{n='WS_MB';e={ToMB $_.WorkingSet64}},
                            @{n='Private_MB';e={ToMB $_.PrivateMemorySize64}},
                            @{n='Threads';e={$_.Threads.Count}},
                            @{n='StartTime';e={ if ($_.StartTime) { $_.StartTime.ToString('MM-dd HH:mm') } else { '-' } }} |
    Format-Table -AutoSize |
    Out-String -Width 200 |
    Write-Host

$totalPrivateGB = [math]::Round((($procs | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1GB, 2)
Note ('Sum of all process private bytes: ' + $totalPrivateGB + ' GB')

# node.exe is the leak candidate - PM2 restarts plus any orphaned ts-node /
# migration process from refresh-test-db.ps1 accumulate here.
$nodeProcs = @($procs | Where-Object { $_.Name -eq 'node' })
Note ''
if ($nodeProcs.Count -eq 0) {
    Note 'node.exe processes: none'
} else {
    $nodeGB = [math]::Round((($nodeProcs | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1GB, 2)
    Note ('node.exe processes: ' + $nodeProcs.Count + ', total private ' + $nodeGB + ' GB')
    $nodeProcs |
        Select-Object @{n='Id';e={$_.Id}},
                      @{n='Private_MB';e={ToMB $_.PrivateMemorySize64}},
                      @{n='StartTime';e={ if ($_.StartTime) { $_.StartTime.ToString('MM-dd HH:mm') } else { '-' } }} |
        Format-Table -AutoSize | Out-String -Width 200 | Write-Host

    if ($nodeProcs.Count -gt 3) {
        Warn2 ('There are ' + $nodeProcs.Count + ' node.exe processes. PM2 expects 1 backend plus its daemon. Orphaned ts-node / migration processes from refresh-test-db.ps1 are a likely leak - check the command lines below.')
    }
    if ($nodeGB -ge 1) {
        Warn2 ('node.exe is holding ' + $nodeGB + ' GB of committed memory.')
    }

    Note ''
    Note 'node.exe command lines:'
    try {
        Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
            Select-Object ProcessId, @{n='CommandLine';e={
                if ($_.CommandLine) { $_.CommandLine.Substring(0, [math]::Min(150, $_.CommandLine.Length)) } else { '-' }
            }} |
            Format-Table -AutoSize -Wrap | Out-String -Width 200 | Write-Host
    } catch {
        Note '  (could not read command lines - needs elevation)'
    }
}

# ------------------------------------------------ 5. PostgreSQL processes ----

Section '5. PostgreSQL service and processes'

$pgSvc = @(Get-Service | Where-Object { $_.Name -like '*postgres*' })
if ($pgSvc.Count -eq 0) {
    Bad 'No PostgreSQL service found.'
} else {
    foreach ($s in $pgSvc) {
        Note ('Service : ' + $s.Name + '  [' + $s.Status + ']  ' + $s.DisplayName)
        if ($s.Status -ne 'Running') {
            Bad ('Service ' + $s.Name + ' is ' + $s.Status + ' - PostgreSQL is DOWN.')
        }
    }
}

# Auto-detect the data directory from the service registration. The path is
# normally quoted and contains spaces ("C:\Program Files\..."), so try the
# quoted form first - an unquoted \S+ match would stop at the first space.
if (-not $DataDir) {
    $svcCim = Get-CimInstance Win32_Service -Filter "Name LIKE 'postgresql%'" -ErrorAction SilentlyContinue |
              Select-Object -First 1
    if ($svcCim -and $svcCim.PathName) {
        if     ($svcCim.PathName -match '-D\s+"([^"]+)"') { $DataDir = $Matches[1] }
        elseif ($svcCim.PathName -match '-D\s+(\S+)')     { $DataDir = $Matches[1] }

        if ($DataDir) {
            if (Test-Path $DataDir) {
                Note ('Data dir detected from service : ' + $DataDir)
            } else {
                Note ('Service named a data dir that does not exist (' + $DataDir + ') - falling back to probing.')
                $DataDir = $null
            }
        }
    }
}
if (-not $DataDir) {
    foreach ($cand in @('E:\PostgreSQL18\data', 'E:\PostgreSQL\18\data', 'C:\Program Files\PostgreSQL\18\data')) {
        if (Test-Path $cand) { $DataDir = $cand; break }
    }
    if ($DataDir) { Note ('Data dir found by probing : ' + $DataDir) }
}
if (-not $DataDir) {
    Bad 'Could not locate the PostgreSQL data directory. Re-run with -DataDir "E:\PostgreSQL18\data".'
}

$pgProcs = @(Get-Process -Name postgres -ErrorAction SilentlyContinue)
Note ''
if ($pgProcs.Count -eq 0) {
    Bad 'No postgres.exe processes are running.'
} else {
    $pgGB = [math]::Round((($pgProcs | Measure-Object PrivateMemorySize64 -Sum).Sum) / 1GB, 2)
    Note ('postgres.exe processes : ' + $pgProcs.Count + ', total private ' + $pgGB + ' GB')
    Note 'Expect roughly: 1 postmaster + background workers + 1 per client connection.'
    if ($pgProcs.Count -gt 60) {
        Warn2 ('There are ' + $pgProcs.Count + ' postgres.exe processes - connection leak from the app pool?')
    }
}

# ------------------------------------------------- 6. PostgreSQL server log --

Section '6. PostgreSQL server log'

$logDir = $null
if ($DataDir) {
    foreach ($sub in @('log', 'pg_log')) {
        $cand = Join-Path $DataDir $sub
        if (Test-Path $cand) { $logDir = $cand; break }
    }
}

if (-not $logDir) {
    Bad 'Could not find the server log directory under the data dir.'
} else {
    Note ('Log directory : ' + $logDir)

    $logs = @(Get-ChildItem -Path $logDir -Filter '*.log' -ErrorAction SilentlyContinue |
              Sort-Object LastWriteTime -Descending)

    if ($logs.Count -eq 0) {
        Bad 'No .log files found.'
    } else {
        Note ''
        Note 'Most recent log files:'
        $logs | Select-Object -First 6 @{n='Name';e={$_.Name}},
                                       @{n='Size_KB';e={[math]::Round($_.Length/1KB,0)}},
                                       @{n='Modified';e={$_.LastWriteTime.ToString('yyyy-MM-dd HH:mm')}} |
                Format-Table -AutoSize | Out-String -Width 200 | Write-Host

        # Narrow to files that could hold in-window lines. This is only a cheap
        # pre-filter - a file can straddle the boundary, so the real cut is made
        # per line below, using each line's own timestamp.
        $recent = @($logs | Where-Object { $_.LastWriteTime -ge $scanStart })

        if ($recent.Count -eq 0) {
            if ($SinceLastBoot) {
                Warn2 'No server log has been written since boot. Is PostgreSQL running? (see section 5)'
            } else {
                $recent = @($logs | Select-Object -First 1)
            }
        }

        # Ascending, so the display genuinely reads oldest-first and
        # "Select-Object -Last" keeps the NEWEST lines rather than the oldest.
        $scanFiles = @($recent | Sort-Object LastWriteTime)

        $patterns = @(
            'could not reattach',
            'out of memory',
            'crash of another server process',
            'automatic recovery in progress',
            'database system was interrupted',
            'PANIC',
            'FATAL'
        )

        $joined  = ($patterns -join '|')
        $matched = @()
        if ($scanFiles.Count -gt 0) {
            $matched = @(Select-String -Path $scanFiles.FullName -Pattern $joined -ErrorAction SilentlyContinue)
        }

        $dropped = 0
        if ($SinceLastBoot -and $matched.Count -gt 0) {
            $kept = @()
            foreach ($m in $matched) {
                $t = Get-PgLogLineTime $m.Line
                if ($t -and $t -ge $scanStart) { $kept += $m } else { $dropped++ }
            }
            $matched = $kept
        }

        Note ''
        Note ('Crash-signature counts (' + $scanLabel + '):')

        $reattachTotal = 0
        $oomTotal      = 0
        $recoveryTotal = 0

        foreach ($p in $patterns) {
            $c = @($matched | Where-Object { $_.Line -like ('*' + $p + '*') }).Count
            Note ('  ' + $p.PadRight(34) + ' : ' + $c)
            if ($p -eq 'could not reattach')              { $reattachTotal = $c }
            if ($p -eq 'out of memory')                   { $oomTotal      = $c }
            if ($p -eq 'automatic recovery in progress')  { $recoveryTotal = $c }
        }

        if ($dropped -gt 0) {
            Note ('  (' + $dropped + ' older or untimestamped line(s) excluded by -SinceLastBoot)')
        }

        if ($reattachTotal -gt 0) {
            Bad ([string]$reattachTotal + ' x "could not reattach to shared memory" (' + $scanLabel + ') - error 1455 (ERROR_COMMITMENT_LIMIT). Backends are being refused memory by Windows.')
        }
        if ($oomTotal -gt 0) {
            Bad ([string]$oomTotal + ' x "out of memory" inside PostgreSQL (' + $scanLabel + ').')
        }
        if ($recoveryTotal -gt 0) {
            Bad ([string]$recoveryTotal + ' x crash recovery (' + $scanLabel + '). Each one disconnects every user - that is the "terminating connection because of crash of another server process" message.')
        }
        if ($reattachTotal -eq 0 -and $oomTotal -eq 0 -and $recoveryTotal -eq 0) {
            Good ('No crash signatures ' + $scanLabel + '.')
        }

        Note ''
        Note ('Last ' + $LogLines + ' matching lines (newest at the bottom):')
        Note ('-' * 74)

        $matched |
            Select-Object -Last $LogLines |
            ForEach-Object {
                Write-Host ('  ' + $_.Filename + ':' + $_.LineNumber + '  ' + $_.Line.Trim()) -ForegroundColor DarkYellow
            }
    }
}

# ------------------------------------------------------ 7. Windows events ----

Section ('7. Windows event log  (' + $scanLabel + ')')

# Event ID 2004 from Resource-Exhaustion-Detector is Windows explicitly saying
# "virtual memory is exhausted, here are the processes responsible". If this is
# present it names the leak outright.
Note 'Resource-Exhaustion-Detector (Windows low-virtual-memory warnings):'
try {
    $res = @(Get-WinEvent -FilterHashtable @{
        LogName      = 'System'
        ProviderName = 'Microsoft-Windows-Resource-Exhaustion-Detector'
        StartTime    = $scanStart
    } -ErrorAction Stop)

    if ($res.Count -eq 0) {
        Note '  none'
    } else {
        Bad ([string]$res.Count + ' resource-exhaustion event(s) (' + $scanLabel + '). Windows ran out of virtual memory. The message names the top consumers.')
        foreach ($e in ($res | Select-Object -First 5)) {
            Write-Host ('  ' + $e.TimeCreated.ToString('yyyy-MM-dd HH:mm:ss') + '  Id=' + $e.Id) -ForegroundColor Red
            $msg = $e.Message
            if ($msg) {
                foreach ($line in ($msg -split "`n" | Select-Object -First 8)) {
                    Write-Host ('      ' + $line.Trim()) -ForegroundColor DarkYellow
                }
            }
        }
    }
} catch {
    Note '  none found (or access denied - re-run elevated)'
}

Note ''
Note 'Application-log entries from PostgreSQL:'
try {
    $pgEvents = @(Get-WinEvent -FilterHashtable @{
        LogName   = 'Application'
        StartTime = $scanStart
    } -ErrorAction Stop | Where-Object { $_.ProviderName -like '*postgres*' })

    if ($pgEvents.Count -eq 0) {
        Note '  none'
    } else {
        Note ('  ' + $pgEvents.Count + ' event(s); showing the 10 most recent:')
        foreach ($e in ($pgEvents | Select-Object -First 10)) {
            $short = ($e.Message -split "`n")[0]
            if ($short.Length -gt 120) { $short = $short.Substring(0, 120) }
            Write-Host ('  ' + $e.TimeCreated.ToString('MM-dd HH:mm:ss') + '  [' + $e.LevelDisplayName + ']  ' + $short.Trim()) -ForegroundColor DarkYellow
        }
    }
} catch {
    Note '  none found (or access denied)'
}

Note ''
Note 'System-log Critical/Error events, grouped by source:'
try {
    $sysEvents = @(Get-WinEvent -FilterHashtable @{
        LogName   = 'System'
        Level     = 1, 2
        StartTime = $scanStart
    } -ErrorAction Stop)

    if ($sysEvents.Count -eq 0) {
        Note '  none'
    } else {
        $sysEvents | Group-Object ProviderName |
            Sort-Object Count -Descending |
            Select-Object -First 10 @{n='Count';e={$_.Count}}, @{n='Source';e={$_.Name}} |
            Format-Table -AutoSize | Out-String -Width 200 | Write-Host
    }
} catch {
    Note '  none found (or access denied)'
}

# ------------------------------------------------------------- 8. summary ----

Section '8. Summary'

if ($script:Findings.Count -eq 0) {
    Good 'No problems detected in this run.'
    Note 'If crashes are still happening, the spike is intermittent - re-run this'
    Note 'script DURING a crash, and check the pagefile PeakUsage in section 3,'
    Note 'which records the high-water mark even after memory is released.'
} else {
    Write-Host ''
    Write-Host '  Findings, most important first:' -ForegroundColor White
    Write-Host ''
    foreach ($f in $script:Findings) {
        if ($f.StartsWith('FAIL')) {
            Write-Host ('    ' + $f) -ForegroundColor Red
        } else {
            Write-Host ('    ' + $f) -ForegroundColor Yellow
        }
    }
}

Section '9. Remediation'

$recommendedMB = [int]($ramGB * 1024 * 1.5)

Write-Host @"
  Apply in this order.

  STEP 1 - Break the crash loop (immediate, ~10 seconds of downtime)
  ------------------------------------------------------------------
      Get-Service *postgres*
      Restart-Service postgresql-x64-18       # use the real name from above

      Or re-run this script with -RestartPostgres.

  STEP 2 - Fix the pagefile (this is what error 1455 is complaining about)
  -----------------------------------------------------------------------
  Option A, simplest - let Windows manage it:

      `$cs = Get-CimInstance Win32_ComputerSystem
      `$cs.AutomaticManagedPagefile = `$true
      Set-CimInstance -InputObject `$cs

  Option B - fixed size on a drive with room (recommended: E: if C: is tight).
  For this box that is at least $recommendedMB MB (1.5x the $ramGB GB of RAM):

      `$cs = Get-CimInstance Win32_ComputerSystem
      `$cs.AutomaticManagedPagefile = `$false
      Set-CimInstance -InputObject `$cs

      # remove any existing setting, then create the new one
      Get-CimInstance Win32_PageFileSetting | Remove-CimInstance
      New-CimInstance -ClassName Win32_PageFileSetting -Property @{
          Name        = 'E:\pagefile.sys'
          InitialSize = $recommendedMB
          MaximumSize = $($recommendedMB * 2)
      }

  A REBOOT IS REQUIRED for pagefile changes to take effect.
  Stop PM2 first so the backend comes back cleanly:

      pm2 stop lhb-mms-backend
      Restart-Computer

  STEP 3 - Kill the leak
  ----------------------
  Section 4 names the consumer. If it is orphaned node.exe processes from an
  aborted refresh-test-db.ps1 or a PM2 restart storm:

      pm2 list
      pm2 delete lhb-mms-backend
      Get-Process node | Where-Object { `$_.StartTime -lt (Get-Date).AddHours(-6) } | Stop-Process -Force
      pm2 start E:\Apps\lhb-mms\backend\ecosystem.config.js --env production

  STEP 4 - Verify
  ---------------
      .\diagnose-db-server.ps1 -SinceLastBoot -OutFile E:\pg-diag-after.txt

  Use -SinceLastBoot here. Without it, sections 6 and 7 rescan days of history
  and every already-fixed crash still reports FAIL.

  Commit charge should sit well under 75%, and no new "could not reattach"
  lines should appear in the server log.

  NOTE ON DATA SAFETY
  -------------------
  Every recovery in the log so far completed cleanly (redo done -> checkpoint
  complete), so there is no evidence of corruption. But the 2026-07-27 log
  contains a crash DURING recovery, which carries a real corruption risk.
  Take a backup before rebooting:

      & 'E:\PostgreSQL18\bin\pg_dump.exe' -U postgres -F c -f E:\lhb_mms_backup.dump lhb_mms

"@ -ForegroundColor Gray

# ------------------------------------------------- optional service restart --

if ($RestartPostgres) {
    Section 'Restart PostgreSQL'

    $target = $pgSvc | Select-Object -First 1
    if (-not $target) {
        Bad 'No PostgreSQL service to restart.'
    } else {
        Write-Host ''
        Write-Host ('  About to restart: ' + $target.Name) -ForegroundColor Yellow
        Write-Host '  This DROPS ALL CONNECTIONS - the PM2 backend and any dev session.' -ForegroundColor Yellow
        $answer = Read-Host '  Type YES to proceed'

        if ($answer -eq 'YES') {
            try {
                Restart-Service -Name $target.Name -Force -ErrorAction Stop
                Start-Sleep -Seconds 3
                $after = Get-Service -Name $target.Name
                if ($after.Status -eq 'Running') {
                    Good ('Service ' + $target.Name + ' restarted and is Running.')
                    Note 'Now restart the backend so its connection pool reconnects cleanly:'
                    Note '    pm2 restart lhb-mms-backend'
                } else {
                    Bad ('Service ' + $target.Name + ' is ' + $after.Status + ' after restart.')
                }
            } catch {
                Bad ('Restart failed: ' + $_.Exception.Message)
            }
        } else {
            Note 'Skipped - no changes made.'
        }
    }
}

Write-Host ''
Write-Host '  Done.' -ForegroundColor White
if ($OutFile) {
    Write-Host ('  Saved to ' + $OutFile + ' - send this file back for analysis.') -ForegroundColor DarkGray
}
Write-Host ''

if ($OutFile) {
    try { Stop-Transcript | Out-Null } catch { }
}
