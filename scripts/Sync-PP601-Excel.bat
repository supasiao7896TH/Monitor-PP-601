@echo off
title PP-601 Excel Sync
rem Shared manual sync for every user on this PC (linked from the Excel logbook via =HYPERLINK)
echo ========================================================
echo   PP-601 Sync: Cloudflare D1 + PI TI-2610B -^> Excel (Drive K:)
echo   User: %USERNAME%
echo ========================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-excel.ps1"
echo.
echo Sync completed.
timeout /t 5
