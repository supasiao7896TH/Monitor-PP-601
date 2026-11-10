# scripts/register-task.ps1
# Register Windows Task Scheduler job for PP-601 Excel Sync (Every 5 minutes)
$ErrorActionPreference = "Stop"

$sharedDir = "C:\ProgramData\PP601-Monitor"
if (-not (Test-Path $sharedDir)) {
    New-Item -ItemType Directory -Path $sharedDir -Force | Out-Null
}
$scriptPath = Join-Path $sharedDir "sync-excel.ps1"
if (-not (Test-Path $scriptPath)) {
    Copy-Item (Join-Path $PSScriptRoot "sync-excel.ps1") $scriptPath -Force
}
$vbsPath = Join-Path $sharedDir "run-silent.vbs"
if (-not (Test-Path $vbsPath)) {
    Copy-Item (Join-Path $PSScriptRoot "run-silent.vbs") $vbsPath -Force
}
$taskName = "PP601-Excel-Sync"

# 1. Action: run silently via wscript.exe (Zero-Flash, no console window)
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $sharedDir

# 2. Trigger: Run every 5 minutes (รันทุก 5 นาที เพื่อให้ทันเวลาก่อนออกกะ 07:30 และ 19:30)
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)

# 3. Settings: wake machine not needed, allow start on demand
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# 4. Register
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Auto-sync PP-601 temp readings from Cloudflare D1 into K:\PE1 Excel report (Every 5 minutes)" -Force

Write-Host "Successfully registered scheduled task: $taskName (Every 5 minutes)"
