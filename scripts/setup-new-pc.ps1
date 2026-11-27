# scripts/setup-new-pc.ps1
# Setup PP-601 Monitor on a New PC (Multi-User Shared PC Ready)
$ErrorActionPreference = "Stop"

# Security Guard: Setup must only run from Local Drive (C:), never from Network Share (K:, D:\GCMSection, UNC)
if ($PSScriptRoot -match '^(K:|\\\\|D:\\GCMSection)') {
    Write-Error "SECURITY POLICY VIOLATION: setup-new-pc.ps1 must NOT be run from a Network Share (K:). Corporate FSRM blocks script files. Please copy the project folder to local disk C: before running setup."
    exit 1
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "   PP-601 Monitor: 1-Click Multi-User Setup for PC" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$sharedDir = "C:\ProgramData\PP601-Monitor"
$syncScript = Join-Path $sharedDir "sync-excel.ps1"
$excelPath = "K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx"
$desktopPath = [Environment]::GetFolderPath("Desktop")

# 1. Ensure Shared Directory in C:\ProgramData
Write-Host "`n[1/5] Setting up shared folder ($sharedDir)..." -NoNewline
. (Join-Path $PSScriptRoot "pp601-task.ps1")
Write-Host ""
Install-PP601SharedFiles -SourceDir $PSScriptRoot -SharedDir $sharedDir
Write-Host " OK! (Accessible by all 4 B/M users)" -ForegroundColor Green

# 2. Check Network Drive K:
Write-Host "[2/5] Checking Drive K: access..." -NoNewline
if (Test-Path $excelPath) {
    Write-Host " OK! Found Excel file on Drive K:" -ForegroundColor Green
} else {
    Write-Host " WARNING: Cannot access $excelPath. Please ensure connected to GC-M network/VPN." -ForegroundColor Yellow
}

# 3. Check Cloudflare API connectivity
Write-Host "[3/5] Checking Cloudflare API connectivity..." -NoNewline
try {
    $health = Invoke-RestMethod -Uri "https://monitor-pp-601.supasiao.workers.dev/api/health" -TimeoutSec 5
    if ($health.status -eq "ok") {
        Write-Host " OK! (Worker & D1 online)" -ForegroundColor Green
    }
} catch {
    Write-Host " WARNING: Could not connect to API ($($_.Exception.Message))" -ForegroundColor Yellow
}

# 4. Register Scheduled Task (every 5 minutes, Zero-Flash Silent)
Write-Host "[4/5] Registering Windows Scheduled Task '$(Get-PP601TaskName)'..."
try {
    Register-PP601UserTask -SharedDir $sharedDir | Out-Null
    Write-Host "  OK! (this user only - other B/M users run C:\ProgramData\PP601-Monitor\Setup-PP601-For-My-Login.bat once)" -ForegroundColor Green
} catch {
    Write-Host " FAILED ($($_.Exception.Message))" -ForegroundColor Red
}

# 5. Create Desktop Shortcuts
Write-Host "[5/5] Creating Desktop Shortcuts..." -NoNewline
# 5.1 Batch Sync Shortcut
$batPath = Join-Path $desktopPath "Sync PP-601 Excel.bat"
$batContent = @"
@echo off
rem Thin wrapper: the shared bat reports OK, NOT SYNCED or FAILED by exit code.
rem (The old inline version had an unescaped redirect that wrote a junk file onto the K: share.)
call "$sharedDir\Sync-PP601-Excel.bat"
"@
Set-Content -Path $batPath -Value $batContent -Encoding ASCII

# 5.2 Web App Internet Shortcut
$urlPath = Join-Path $desktopPath "PP-601 Monitor WebApp.url"
$urlContent = @"
[InternetShortcut]
URL=https://monitor-pp-601.supasiao.workers.dev
IconIndex=0
"@
Set-Content -Path $urlPath -Value $urlContent -Encoding ASCII

Write-Host " OK! Created Sync & WebApp shortcuts on Desktop" -ForegroundColor Green

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "   Multi-User Setup Completed Successfully!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Cyan
