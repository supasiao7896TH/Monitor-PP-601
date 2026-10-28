# scripts/register-task.ps1
# Register Windows Task Scheduler job for PP-601 Excel Sync
$ErrorActionPreference = "Stop"

$scriptPath = "C:\Users\26007294\A(i)CODER2025TH\Monitior PP-601\scripts\sync-excel.ps1"
$taskName = "PP601-Excel-Sync"

# 1. Action: run powershell hidden
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`""

# 2. Trigger: Run every 30 minutes
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)

# 3. Settings: wake machine not needed, allow start on demand
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

# 4. Register
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Auto-sync PP-601 temp readings from Cloudflare D1 into K:\PE1 Excel report" -Force

Write-Host "Successfully registered scheduled task: $taskName (Every 30 minutes)"
