# scripts/setup-new-pc.ps1
# Setup PP-601 Monitor on a New PC (1-Click Setup)
$ErrorActionPreference = "Stop"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   PP-601 Monitor: 1-Click Setup for New PC" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$projectDir = Split-Path -Parent $PSScriptRoot
$syncScript = Join-Path $PSScriptRoot "sync-excel.ps1"
$excelPath = "K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx"
$desktopPath = [Environment]::GetFolderPath("Desktop")

# 1. Check Network Drive K:
Write-Host "`n[1/4] Checking Drive K: access..." -NoNewline
if (Test-Path $excelPath) {
    Write-Host " OK! Found Excel file on Drive K:" -ForegroundColor Green
} else {
    Write-Host " WARNING: Cannot access $excelPath. Please ensure you are connected to GC-M network/VPN." -ForegroundColor Yellow
}

# 2. Check Cloudflare API connectivity
Write-Host "[2/4] Checking Cloudflare API connectivity..." -NoNewline
try {
    $health = Invoke-RestMethod -Uri "https://monitor-pp-601.supasiao.workers.dev/api/health" -TimeoutSec 5
    if ($health.status -eq "ok") {
        Write-Host " OK! (Worker & D1 online)" -ForegroundColor Green
    }
} catch {
    Write-Host " WARNING: Could not connect to API ($($_.Exception.Message))" -ForegroundColor Yellow
}

# 3. Register Scheduled Task (every 30 minutes)
Write-Host "[3/4] Registering Windows Scheduled Task 'PP601-Excel-Sync'..." -NoNewline
try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$syncScript`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 30)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName "PP601-Excel-Sync" -Action $action -Trigger $trigger -Settings $settings -Description "Auto-sync PP-601 temp readings from Cloudflare D1 into K:\PE1 Excel report" -Force | Out-Null
    Write-Host " OK! (Runs every 30 minutes in background)" -ForegroundColor Green
} catch {
    Write-Host " FAILED ($($_.Exception.Message))" -ForegroundColor Red
}

# 4. Create Desktop Shortcut Batch File
Write-Host "[4/4] Creating Desktop Shortcut..." -NoNewline
$batPath = Join-Path $desktopPath "Sync PP-601 Excel.bat"
$batContent = @"
@echo off
title PP-601 Excel Sync
echo ========================================================
echo   PP-601 Auto-Sync to Excel (Drive K:)
echo   Cloudflare D1 -> K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx
echo ========================================================
powershell -ExecutionPolicy Bypass -File "$syncScript"
echo.
echo Sync completed.
timeout /t 5
"@

Set-Content -Path $batPath -Value $batContent -Encoding ASCII
Write-Host " OK! Created '$batPath'" -ForegroundColor Green

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   Setup Completed Successfully!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
