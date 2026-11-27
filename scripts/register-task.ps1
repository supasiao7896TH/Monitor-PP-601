# scripts/register-task.ps1
# Register the PP-601 Excel Sync task for the CURRENT user (per-user task, see pp601-task.ps1)
$ErrorActionPreference = "Stop"

$sharedDir = "C:\ProgramData\PP601-Monitor"
if (-not (Test-Path $sharedDir)) {
    New-Item -ItemType Directory -Path $sharedDir -Force | Out-Null
}
foreach ($f in "sync-excel.ps1", "run-silent.vbs", "pp601-task.ps1") {
    Copy-Item (Join-Path $PSScriptRoot $f) (Join-Path $sharedDir $f) -Force
}

. (Join-Path $PSScriptRoot "pp601-task.ps1")
$taskName = Register-PP601UserTask -SharedDir $sharedDir
Write-Host "Successfully registered scheduled task: $taskName (at logon + every 5 minutes)"
