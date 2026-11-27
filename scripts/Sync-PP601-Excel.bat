@echo off
title PP-601 Excel Sync
rem Shared manual sync for every user on this PC (linked from the Excel logbook via =HYPERLINK)
echo ========================================================
echo   PP-601 Sync: Cloudflare D1 + PI TI-2610B -^> Excel (Drive K:)
echo   User: %USERNAME%
echo ========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-excel.ps1"
set "RC=%ERRORLEVEL%"
echo.
echo ========================================================
if "%RC%"=="0" (
    echo   [OK] Sync completed. Excel is up to date.
    timeout /t 5
    exit /b 0
)
if "%RC%"=="2" (
    echo   [NOT SYNCED] Excel was NOT updated this time - see the reason above:
    echo   - [FILE LOCK]  "Monitor temp pump PP-601.xlsx" is open: close it, then click again.
    echo   - [SKIP]       another user's sync is running: wait 1 minute, then click again.
    echo   - not found    drive K: is not reachable: check the network / K: drive.
) else (
    echo   [FAILED] Sync failed ^(code %RC%^). Check the network / K: drive and try again.
)
echo ========================================================
pause
exit /b %RC%
