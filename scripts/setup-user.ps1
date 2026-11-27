# scripts/setup-user.ps1
# Setup PP-601 Monitor Scheduled Task & Desktop Shortcuts for Current Logged-in User
$ErrorActionPreference = "Stop"

$username = $env:USERNAME
$desktopPath = [Environment]::GetFolderPath("Desktop")
# Always use ProgramData. The legacy C:\PP601-Monitor folder held a stale sync-excel.ps1 (no PI auto-pull);
# preferring it re-registered the old task (flashing console + missing TI-2610B) on 2026-11-26.
$sharedDir = "C:\ProgramData\PP601-Monitor"
if (Test-Path "C:\PP601-Monitor") {
    Write-Host "[WARN] Legacy folder C:\PP601-Monitor found - ignored. Rename/delete it to avoid confusion." -ForegroundColor Yellow
}
$syncScript = Join-Path $sharedDir "sync-excel.ps1"
. (Join-Path $PSScriptRoot "pp601-task.ps1")
$taskName = Get-PP601TaskName

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   PP-601 Monitor: Setup for User [$username]" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Install/refresh scripts in $sharedDir (always overwrite when run from the repo, so a stale copy never survives)
if (-not (Test-Path $sharedDir)) { New-Item -ItemType Directory -Path $sharedDir -Force | Out-Null }
$runningFromShared = (Resolve-Path $PSScriptRoot).Path.TrimEnd('\') -ieq $sharedDir
if (-not $runningFromShared) {
    foreach ($f in "sync-excel.ps1", "run-silent.vbs", "setup-user.ps1", "pp601-task.ps1", "Setup-PP601-For-My-Login.bat", "Sync-PP601-Excel.bat") {
        $src = Join-Path $PSScriptRoot $f
        if (Test-Path $src) { Copy-Item $src (Join-Path $sharedDir $f) -Force }
    }
}
$vbsPath = Join-Path $sharedDir "run-silent.vbs"
if (-not (Test-Path $syncScript) -or -not (Test-Path $vbsPath)) {
    Write-Error "Cannot find sync-excel.ps1 / run-silent.vbs in $sharedDir. Run this setup from the repo 'scripts' folder."
    exit 1
}

# 2. Register Scheduled Task (Every 5 minutes, Zero-Flash Silent)
Write-Host "`n[1/3] Registering Task Scheduler '$taskName' (Every 5 mins, Zero-Flash)..." -NoNewline
try {
    Write-Host ""
    Register-PP601UserTask -SharedDir $sharedDir | Out-Null
    Write-Host "  OK! (runs at logon + every 5 mins while $username is logged on)" -ForegroundColor Green
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
