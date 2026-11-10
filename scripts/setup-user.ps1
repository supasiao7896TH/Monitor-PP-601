# scripts/setup-user.ps1
# Setup PP-601 Monitor Scheduled Task & Desktop Shortcuts for Current Logged-in User
$ErrorActionPreference = "Stop"

$username = $env:USERNAME
$desktopPath = [Environment]::GetFolderPath("Desktop")
$sharedDir = if (Test-Path "C:\PP601-Monitor\sync-excel.ps1") { "C:\PP601-Monitor" } else { "C:\ProgramData\PP601-Monitor" }
$syncScript = Join-Path $sharedDir "sync-excel.ps1"
$taskName = "PP601-Excel-Sync"

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   PP-601 Monitor: Setup for User [$username]" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Check sync script existence
if (-not (Test-Path $syncScript)) {
    if (Test-Path (Join-Path $PSScriptRoot "sync-excel.ps1")) {
        if (-not (Test-Path $sharedDir)) { New-Item -ItemType Directory -Path $sharedDir -Force | Out-Null }
        Copy-Item (Join-Path $PSScriptRoot "sync-excel.ps1") $syncScript -Force
    } else {
        Write-Error "Cannot find sync-excel.ps1 in $sharedDir or script folder."
        exit 1
    }
}
$vbsPath = Join-Path $sharedDir "run-silent.vbs"
if (Test-Path (Join-Path $PSScriptRoot "run-silent.vbs")) {
    Copy-Item (Join-Path $PSScriptRoot "run-silent.vbs") $vbsPath -Force
}

# 2. Register Scheduled Task (Every 5 minutes, Zero-Flash Silent)
Write-Host "`n[1/3] Registering Task Scheduler '$taskName' (Every 5 mins, Zero-Flash)..." -NoNewline
try {
    $action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbsPath`"" -WorkingDirectory $sharedDir
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Auto-sync PP-601 temp readings from Cloudflare D1 into K:\PE1 Excel report ($username, Zero-Flash)" -Force | Out-Null
    Write-Host " OK!" -ForegroundColor Green
} catch {
    Write-Host " FAILED ($($_.Exception.Message))" -ForegroundColor Red
}

# 3. Create Desktop Shortcuts
Write-Host "[2/3] Creating Desktop Shortcuts on [$desktopPath]..." -NoNewline
try {
    # 3.1 Batch Sync Shortcut
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

    # 3.2 Web App Internet Shortcut
    $urlPath = Join-Path $desktopPath "PP-601 Monitor WebApp.url"
    $urlContent = @"
[InternetShortcut]
URL=https://monitor-pp-601.supasiao.workers.dev
IconIndex=0
"@
    Set-Content -Path $urlPath -Value $urlContent -Encoding ASCII
    Write-Host " OK!" -ForegroundColor Green
} catch {
    Write-Host " FAILED ($($_.Exception.Message))" -ForegroundColor Red
}

# 4. Test Connectivity
Write-Host "[3/3] Checking Cloudflare D1 & Drive K: access..." -NoNewline
$kOk = Test-Path "K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx"
if ($kOk) {
    Write-Host " Drive K: OK!" -ForegroundColor Green
} else {
    Write-Host " Drive K: not connected yet (please check network)" -ForegroundColor Yellow
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   Setup Completed for $username!" -ForegroundColor Green
Write-Host "   Excel sync will run in background every 5 minutes." -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
