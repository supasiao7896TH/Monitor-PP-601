# scripts/pp601-task.ps1
# Shared helper (dot-source it): register the PP-601 Excel sync task for the CURRENT Windows user.
#
# Why per-user: this PC is shared by several B/M logins. One shared task name ("PP601-Excel-Sync") meant
# whoever ran setup last owned the task, and it only ran while that one person was logged on
# (286 skipped runs, event 332, 2026-11-25..27). Each user now gets "PP601-Excel-Sync (<username>)".
# Concurrent sessions are serialised by a machine-wide mutex inside sync-excel.ps1.

$script:PP601LegacyTaskName = "PP601-Excel-Sync"

# Single source of truth for what gets installed into C:\ProgramData\PP601-Monitor
$script:PP601SharedFiles = @(
    "sync-excel.ps1", "run-silent.vbs", "pp601-task.ps1",
    "setup-user.ps1", "Setup-PP601-For-My-Login.bat", "Sync-PP601-Excel.bat"
)

function Install-PP601SharedFiles {
    # Copies only files whose content differs. Files in ProgramData are owned by whoever installed them and
    # other users only get Read/Execute - on purpose: never widen to Modify, or any user could edit a script
    # that runs under every other user's task. So a copy failure is a warning, not a fatal error.
    param([Parameter(Mandatory)][string]$SourceDir, [Parameter(Mandatory)][string]$SharedDir)
    if (-not (Test-Path $SharedDir)) { New-Item -ItemType Directory -Path $SharedDir -Force | Out-Null }
    foreach ($f in $script:PP601SharedFiles) {
        $src = Join-Path $SourceDir $f
        $dst = Join-Path $SharedDir $f
        if (-not (Test-Path $src)) { continue }
        if ((Test-Path $dst) -and (Get-FileHash $src).Hash -eq (Get-FileHash $dst).Hash) { continue }
        try {
            Copy-Item $src $dst -Force
            Write-Host "  Updated $f" -ForegroundColor DarkGray
        } catch {
            Write-Host "  [WARN] Cannot update $dst ($($_.Exception.Message)) - ask the user who installed it to re-run setup from the repo." -ForegroundColor Yellow
        }
    }
}

function Get-PP601TaskName {
    param([string]$UserName = $env:USERNAME)
    return "PP601-Excel-Sync ($UserName)"
}

function Register-PP601UserTask {
    param([Parameter(Mandatory)][string]$SharedDir)

    $me = "$env:USERDOMAIN\$env:USERNAME"
    $taskName = Get-PP601TaskName
    $vbsPath = Join-Path $SharedDir "run-silent.vbs"

    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $SharedDir
    # Run at this user's logon, and every 5 minutes while they stay logged on
    $triggers = @(
        (New-ScheduledTaskTrigger -AtLogOn -User $me),
        (New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5))
    )
    $principal = New-ScheduledTaskPrincipal -UserId $me -LogonType Interactive -RunLevel Limited
    # No MultipleInstances/ExecutionTimeLimit: run-silent.vbs returns immediately, so the task never "runs long".
    # Overlapping runs (same user or other sessions) are prevented by the Global\PP601-Excel-Sync mutex in sync-excel.ps1.
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Principal $principal -Settings $settings `
        -Description "Auto-sync PP-601 readings (Cloudflare D1 + PI TI-2610B) into K:\PE1 Excel for $me (Zero-Flash)" -Force | Out-Null

    # Remove the old shared-name task, but only if it belongs to this user (cannot/should not touch others')
    $legacy = Get-ScheduledTask -TaskName $script:PP601LegacyTaskName -ErrorAction SilentlyContinue
    if ($legacy) {
        $owner = $legacy.Principal.UserId
        if ($owner -and ($owner -ieq $env:USERNAME -or $owner -ieq $me)) {
            Unregister-ScheduledTask -TaskName $script:PP601LegacyTaskName -Confirm:$false
            Write-Host "  Removed legacy shared task '$($script:PP601LegacyTaskName)'." -ForegroundColor DarkGray
        } else {
            Write-Host "  [WARN] Legacy task '$($script:PP601LegacyTaskName)' belongs to '$owner'. Ask that user to run setup once to migrate it." -ForegroundColor Yellow
        }
    }
    return $taskName
}
