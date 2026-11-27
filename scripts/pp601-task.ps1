# scripts/pp601-task.ps1
# Shared helper (dot-source it): register the PP-601 Excel sync task for the CURRENT Windows user.
#
# Why per-user: this PC is shared by several B/M logins. One shared task name ("PP601-Excel-Sync") meant
# whoever ran setup last owned the task, and it only ran while that one person was logged on
# (286 skipped runs, event 332, 2026-11-25..27). Each user now gets "PP601-Excel-Sync (<username>)".
# Concurrent sessions are serialised by a machine-wide mutex inside sync-excel.ps1.

$script:PP601LegacyTaskName = "PP601-Excel-Sync"

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
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
        -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

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
