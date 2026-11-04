# scripts/sync-excel.ps1
# Automated Sync: Cloudflare D1 API -> K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx
param(
    [string]$ExcelPath = "K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx",
    [string]$ApiUrl = "https://monitor-pp-601.supasiao.workers.dev/api/readings?limit=200"
)

$ErrorActionPreference = "Stop"

# Security Guard: Script must only run on Local Drive (C:), never from Network Share (K:, D:\GCMSection, UNC)
if ($PSScriptRoot -match '^(K:|\\\\|D:\\GCMSection)') {
    Write-Error "SECURITY POLICY VIOLATION: sync-excel.ps1 must NOT be stored or executed from a Network Share. Corporate FSRM blocks scripts on server shares. Please execute from C:\ProgramData\PP601-Monitor."
    exit 1
}

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting PP-601 Excel Sync..."

# 1. Fetch readings from Cloudflare D1
try {
    $res = Invoke-RestMethod -Uri $ApiUrl -Method GET -TimeoutSec 10
    if (-not $res.ok -or -not $res.readings) {
        Write-Warning "API returned no readings or ok=false"
        exit 0
    }
    $readings = $res.readings
    Write-Host "Fetched $($readings.Count) readings from Cloudflare D1"
} catch {
    Write-Error "Failed to fetch from Cloudflare API: $($_.Exception.Message)"
    exit 1
}

# Index readings by slotTime and pump (Bangkok date = slotTime + 7 hours)
$readingsBySlot = @{}
foreach ($r in $readings) {
    $utcMs = [long]$r.slotTime
    $bkkDt = [DateTimeOffset]::FromUnixTimeMilliseconds($utcMs).AddHours(7).DateTime
    $slotKey = $bkkDt.ToString("yyyy-MM-dd HH:mm")
    if (-not $readingsBySlot.ContainsKey($slotKey)) {
        $readingsBySlot[$slotKey] = @{}
    }
    $readingsBySlot[$slotKey][$r.pump] = $r
}

# 2. Check File Lock and Open Excel via COM
if (-not (Test-Path $ExcelPath)) {
    Write-Error "Excel file not found at: $ExcelPath"
    exit 1
}

# Function to test file lock without crashing
function Test-ExcelLocked {
    param([string]$FilePath)
    try {
        $fileStream = [System.IO.File]::Open($FilePath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
        if ($fileStream) {
            $fileStream.Close()
            $fileStream.Dispose()
        }
        return $false
    } catch [System.IO.IOException] {
        return $true
    } catch {
        return $false
    }
}

if (Test-ExcelLocked -FilePath $ExcelPath) {
    Write-Warning "[FILE LOCK] Excel file is currently open by another user or process ($ExcelPath)."
    Write-Host "[WARN] Skipping sync this cycle to avoid collision. Will retry automatically next scheduled run."
    exit 0
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$updatedRows = 0

try {
    $wb = $excel.Workbooks.Open($ExcelPath, $false, $false)
    $ws = $wb.Sheets.Item(1)
    $lastRow = $ws.UsedRange.Rows.Count

    # Check template remaining headroom
    $unfilledRows = 0
    for ($checkRow = $lastRow; $checkRow -ge 6; $checkRow--) {
        $hasValA = $ws.Cells.Item($checkRow, 3).Value2
        $hasValC = $ws.Cells.Item($checkRow, 7).Value2
        if (-not $hasValA -and -not $hasValC) {
            $unfilledRows++
        } else {
            break
        }
    }
    if ($unfilledRows -lt 24) {
        $daysLeft = [Math]::Round($unfilledRows / 8, 1)
        Write-Warning "[TEMPLATE ALERT] Only $unfilledRows empty slot(s) (~$daysLeft days) remaining in Excel! Please prepare next month's template rows soon."
    } else {
        Write-Host "Template headroom: $unfilledRows empty slot(s) remaining."
    }

    $currentDate = $null

    for ($r = 6; $r -le $lastRow; $r++) {
        $c1Val = $ws.Cells.Item($r, 1).Value2
        $c1Text = $ws.Cells.Item($r, 1).Text
        $timeText = $ws.Cells.Item($r, 2).Text

        # Normalize time from "1:00", "01:00", etc. to standard "HH:mm"
        $normalizedTime = $null
        if ($timeText -match '^\s*(\d{1,2}):(\d{2})\s*$') {
            $normalizedTime = "{0:D2}:{1:D2}" -f [int]$Matches[1], [int]$Matches[2]
        }

        if ($c1Val -and $c1Text) {
            # Read the date from Excel's serial number (Value2) first: it does not depend on the
            # Windows regional format. Parsing .Text broke on an en-US PC (M/d/yyyy: "8/21/2026"
            # was read as month 21) and failed the whole run.
            if ($c1Val -is [double] -and $c1Val -gt 40000) {
                $currentDate = [DateTime]::new(1899, 12, 30).AddDays([int]$c1Val)
            } elseif ($c1Text -match '^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$') {
                # Plain-text cell: only d/M/yyyy is understood; an impossible date skips the row
                try {
                    $currentDate = [DateTime]::new([int]$Matches[3], [int]$Matches[2], [int]$Matches[1])
                } catch {
                    Write-Warning "Row ${r}: unreadable date text '$c1Text' - skipped"
                }
            }
        } elseif ($normalizedTime -eq "01:00" -and $currentDate) {
            $currentDate = $currentDate.AddDays(1)
            # เติมวันที่ลงช่องซ้ายสุด (Col 1) ที่รอบ 01:00 หากยังไม่ได้กรอก
            if (-not $c1Val -or $c1Text -eq "") {
                $ws.Cells.Item($r, 1).NumberFormat = "dd/mm/yyyy"
                $ws.Cells.Item($r, 1).Value2 = $currentDate.ToOADate()
                $updatedRows++
                Write-Host "  Filled Date in Row $r [$($currentDate.ToString('dd/MM/yyyy'))]"
            }
        }

        if (-not $currentDate -or -not $normalizedTime) {
            continue
        }

        # Future Safety Guard: Never write readings into future slots
        $slotDateTime = $currentDate.Date.AddHours([int]$normalizedTime.Substring(0,2)).AddMinutes([int]$normalizedTime.Substring(3,2))
        if ($slotDateTime -gt (Get-Date).AddMinutes(30)) {
            continue
        }

        $rowSlotKey = "$($currentDate.ToString('yyyy-MM-dd')) $normalizedTime"

        if ($readingsBySlot.ContainsKey($rowSlotKey)) {
            $pumpReadings = $readingsBySlot[$rowSlotKey]
            $rowModified = $false

            # Pump A
            if ($pumpReadings.ContainsKey('A')) {
                $pA = $pumpReadings['A']
                $currIn = $ws.Cells.Item($r, 3).Value2
                if ($null -eq $currIn -or $currIn -eq "" -or [double]$currIn -ne [double]$pA.tg3602) {
                    $ws.Cells.Item($r, 3).Value2 = [double]$pA.tg3602
                    $ws.Cells.Item($r, 4).Value2 = [double]$pA.tg3603
                    $ws.Cells.Item($r, 10).Formula = "=C$r-D$r"
                    $rowModified = $true
                }
            }

            # Pump B
            if ($pumpReadings.ContainsKey('B')) {
                $pB = $pumpReadings['B']
                $currIn = $ws.Cells.Item($r, 5).Value2
                if ($null -eq $currIn -or $currIn -eq "" -or [double]$currIn -ne [double]$pB.tg3602) {
                    $ws.Cells.Item($r, 5).Value2 = [double]$pB.tg3602
                    $ws.Cells.Item($r, 6).Value2 = [double]$pB.tg3603
                    $ws.Cells.Item($r, 11).Formula = "=E$r-F$r"
                    $rowModified = $true
                }
            }

            # Pump C
            if ($pumpReadings.ContainsKey('C')) {
                $pC = $pumpReadings['C']
                $currIn = $ws.Cells.Item($r, 7).Value2
                if ($null -eq $currIn -or $currIn -eq "" -or [double]$currIn -ne [double]$pC.tg3602) {
                    $ws.Cells.Item($r, 7).Value2 = [double]$pC.tg3602
                    $ws.Cells.Item($r, 8).Value2 = [double]$pC.tg3603
                    $ws.Cells.Item($r, 12).Formula = "=G$r-H$r"
                    $rowModified = $true
                }
            }

            if ($rowModified) {
                if (-not $ws.Cells.Item($r, 9).Value2) { $ws.Cells.Item($r, 9).Value2 = 70 }
                if (-not $ws.Cells.Item($r, 13).Value2) { $ws.Cells.Item($r, 13).Value2 = 20 }
                $logA = if ($pumpReadings.ContainsKey('A')) { "$($pumpReadings['A'].tg3602)/$($pumpReadings['A'].tg3603)" } else { "-/-" }
                $logC = if ($pumpReadings.ContainsKey('C')) { "$($pumpReadings['C'].tg3602)/$($pumpReadings['C'].tg3603)" } else { "-/-" }
                $updatedRows++
                Write-Host "  Updated Row $r [$rowSlotKey] -> A: $logA | C: $logC"
            }
        }
    }

    if ($updatedRows -gt 0) {
        $wb.Save()
        Write-Host "Successfully updated $updatedRows row(s) and saved Excel."
    } else {
        Write-Host "No new readings to update. Excel is up to date."
    }

    $wb.Close($false)
} finally {
    if ($ws) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ws) | Out-Null; $ws = $null }
    if ($wb) { [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wb) | Out-Null; $wb = $null }
    if ($excel) {
        $excel.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
        $excel = $null
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
