# scripts/register-task.ps1
# Register the PP-601 Excel Sync task for the CURRENT user (per-user task, see pp601-task.ps1)
$ErrorActionPreference = "Stop"

$sharedDir = "C:\ProgramData\PP601-Monitor"
. (Join-Path $PSScriptRoot "pp601-task.ps1")
Install-PP601SharedFiles -SourceDir $PSScriptRoot -SharedDir $sharedDir
$taskName = Register-PP601UserTask -SharedDir $sharedDir
Write-Host "Successfully registered scheduled task: $taskName (at logon + every 5 minutes)"
