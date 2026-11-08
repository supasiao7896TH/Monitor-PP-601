@echo off
title Setup PP-601 Auto-Sync
echo ========================================================
echo   Setting up PP-601 Excel Sync for user: %USERNAME%
echo ========================================================
powershell -ExecutionPolicy Bypass -File "C:\ProgramData\PP601-Monitor\setup-user.ps1"
echo.
pause
