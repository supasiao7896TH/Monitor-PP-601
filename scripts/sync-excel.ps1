# scripts/sync-excel.ps1
# Automated Sync: Cloudflare D1 API -> K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx
param(
    [string]$ExcelPath = "K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx",
    [string]$ApiUrl = "https://monitor-pp-601.supasiao.workers.dev/api/readings?limit=200"
)

$ErrorActionPreference = "Stop"

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

# 2. Open Excel via COM
if (-not (Test-Path $ExcelPath)) {
    Write-Error "Excel file not found at: $ExcelPath"
    exit 1
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

$updatedRows = 0

try {
    $wb = $excel.Workbooks.Open($ExcelPath, $false, $false)
    $ws = $wb.Sheets.Item(1)
    $lastRow = $ws.UsedRange.Rows.Count

    $currentDate = $null

    for ($r = 6; $r -le $lastRow; $r++) {
        $c1Val = $ws.Cells.Item($r, 1).Value2
        $c1Text = $ws.Cells.Item($r, 1).Text
        $timeText = $ws.Cells.Item($r, 2).Text

        if ($c1Val -and $c1Text) {
            if ($c1Text -match '(\d{1,2})/(\d{1,2})/(\d{4})') {
                $currentDate = [DateTime]::new([int]$Matches[3], [int]$Matches[2], [int]$Matches[1])
            } elseif ($c1Val -gt 40000) {
                $currentDate = [DateTime]::new(1899, 12, 30).AddDays([int]$c1Val)
            }
        } elseif ($timeText -eq "01:00" -and $currentDate) {
            $currentDate = $currentDate.AddDays(1)
            # เติมวันที่ลงช่องซ้ายสุด (Col 1) ที่รอบ 01:00 หากยังไม่ได้กรอก
            if (-not $c1Val -or $c1Text -eq "") {
                $ws.Cells.Item($r, 1).NumberFormat = "dd/mm/yyyy"
                $ws.Cells.Item($r, 1).Value2 = $currentDate.ToOADate()
                $updatedRows++
                Write-Host "  Filled Date in Row $r [$($currentDate.ToString('dd/MM/yyyy'))]"
            }
        }

        if (-not $currentDate -or -not $timeText -or $timeText -notmatch '^\d{2}:\d{2}$') {
            continue
        }

        $rowSlotKey = "$($currentDate.ToString('yyyy-MM-dd')) $timeText"

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
