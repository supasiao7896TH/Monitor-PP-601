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

# 1.1 OSIsoft PI Auto-Pull Setup for PP-601B (TI-2610B)
$piServerName = "gcmppisvr"
$piTagName = "1-pTA.2M.1TI2610B.PV"
$afDll = "C:\Program Files (x86)\PIPC\AF\PublicAssemblies\4.0\OSIsoft.AFSDK.dll"
$piPoint = $null

if (Test-Path $afDll) {
    try {
        [System.Reflection.Assembly]::LoadFrom($afDll) | Out-Null
        $srvs = New-Object OSIsoft.AF.PI.PIServers
        $srv = $srvs[$piServerName]
        if (-not $srv) { $srv = $srvs.Add($piServerName) }
        $srv.Connect()
        $piPoint = [OSIsoft.AF.PI.PIPoint]::FindPIPoint($srv, $piTagName)
        Write-Host "Connected to PI Server '$piServerName', Tag '$($piPoint.Name)' ready for PP-601B auto-pull."
    } catch {
        Write-Warning "PI Auto-Pull initialization failed: $($_.Exception.Message)"
    }
}

function Get-PIValueForSlot {
    param([DateTime]$SlotDt)
    if (-not $piPoint) { return $null }
    try {
        $afTime = [OSIsoft.AF.Time.AFTime]::new($SlotDt)
        $valObj = $piPoint.InterpolatedValue($afTime)
        if ($valObj -and $valObj.IsGood) {
            return [Math]::Round([double]$valObj.Value, 1)
        }
    } catch {}
    return $null
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

    # -------------------------------------------------------------
    # Template Headroom & Smart Auto-Extend Engine
    # -------------------------------------------------------------
    $lastTemplateRow = 6
    $lastTemplateDate = $null
    $scanDate = $null

    # Accurately scan sheet to identify last configured template row and date
    for ($checkR = 6; $checkR -le $lastRow; $checkR++) {
        $chkVal = $ws.Cells.Item($checkR, 1).Value2
        $chkText = $ws.Cells.Item($checkR, 1).Text
        $tText = $ws.Cells.Item($checkR, 2).Text

        $normT = $null
        if ($tText -match '^\s*(\d{1,2}):(\d{2})\s*$') {
            $normT = "{0:D2}:{1:D2}" -f [int]$Matches[1], [int]$Matches[2]
        }

        if ($chkVal -and $chkText) {
            if ($chkVal -is [double] -and $chkVal -gt 40000) {
                $scanDate = [DateTime]::new(1899, 12, 30).AddDays([int]$chkVal)
            } elseif ($chkText -match '^\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*$') {
                try {
                    $scanDate = [DateTime]::new([int]$Matches[3], [int]$Matches[2], [int]$Matches[1])
                } catch {}
            }
        } elseif ($normT -eq "01:00" -and $scanDate) {
            $scanDate = $scanDate.AddDays(1)
        }

        if ($normT -and $scanDate) {
            $lastTemplateRow = $checkR
            $lastTemplateDate = $scanDate
        }
    }

    $daysAhead = if ($lastTemplateDate) { ($lastTemplateDate.Date - (Get-Date).Date).Days } else { 0 }
    if ($lastTemplateDate) {
        Write-Host "Template valid through: $($lastTemplateDate.ToString('yyyy-MM-dd')) ($daysAhead day(s) ahead, Row $lastTemplateRow)"
    }

    # Auto-Extend Trigger: If template headroom is less than 7 days, automatically extend through the end of next month
    if ($daysAhead -lt 7 -and $lastTemplateDate) {
        $targetMonth = $lastTemplateDate.AddMonths(1)
        $daysInTargetMonth = [DateTime]::DaysInMonth($targetMonth.Year, $targetMonth.Month)
        $targetEndDate = [DateTime]::new($targetMonth.Year, $targetMonth.Month, $daysInTargetMonth)

        Write-Host "[AUTO-EXTEND] Template headroom is low ($daysAhead day(s) < 7 days)."
        Write-Host "[AUTO-EXTEND] Automatically extending template through $($targetEndDate.ToString('yyyy-MM-dd'))..."

        $hours = @(1, 4, 7, 10, 13, 16, 19, 22)
        $currDate = $lastTemplateDate.AddDays(1)
        $newRow = $lastTemplateRow + 1

        while ($currDate -le $targetEndDate) {
            for ($hIdx = 0; $hIdx -lt 8; $hIdx++) {
                $hour = $hours[$hIdx]

                # Copy format from previous row to retain border/font/alignment
                try {
                    $ws.Range("A$($newRow-1):M$($newRow-1)").Copy() | Out-Null
                    $ws.Range("A$newRow:M$newRow").PasteSpecial(-4122) | Out-Null # -4122 = xlPasteFormats
                } catch {}

                # Col 1: Date on 01:00 slot
                if ($hour -eq 1) {
                    $ws.Cells.Item($newRow, 1).NumberFormat = "dd/mm/yyyy"
                    $ws.Cells.Item($newRow, 1).Value2 = $currDate.ToOADate()
                } else {
                    $ws.Cells.Item($newRow, 1).Value2 = $null
                }

                # Col 2: Time
                $ws.Cells.Item($newRow, 2).NumberFormat = "h:mm"
                $ws.Cells.Item($newRow, 2).Value2 = [double]$hour / 24.0

                # Clear temperature cells for safety
                $ws.Cells.Item($newRow, 3).Value2 = $null
                $ws.Cells.Item($newRow, 4).Value2 = $null
                $ws.Cells.Item($newRow, 5).Value2 = $null
                $ws.Cells.Item($newRow, 6).Value2 = $null
                $ws.Cells.Item($newRow, 7).Value2 = $null
                $ws.Cells.Item($newRow, 8).Value2 = $null

                # Col 9 & 13: Limits
                $ws.Cells.Item($newRow, 9).Value2 = 70
                $ws.Cells.Item($newRow, 13).Value2 = 20

                # Col 10, 11, 12: Diff Formulas
                $ws.Cells.Item($newRow, 10).Formula = "=C$newRow-D$newRow"
                $ws.Cells.Item($newRow, 11).Formula = "=E$newRow-F$newRow"
                $ws.Cells.Item($newRow, 12).Formula = "=G$newRow-H$newRow"

                $newRow++
            }
            $currDate = $currDate.AddDays(1)
        }

        try { $excel.CutCopyMode = $false } catch {}

        $lastRow = $newRow - 1
        $wb.Save()
        Write-Host "[AUTO-EXTEND] Extended successfully up to Row $lastRow ($($targetEndDate.ToString('yyyy-MM-dd')))."
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

        $hasD1Readings = $readingsBySlot.ContainsKey($rowSlotKey)
        $shouldCheckPi = $piPoint -and $slotDateTime -ge (Get-Date).AddHours(-12) -and $slotDateTime -le (Get-Date).AddMinutes(30)

        if ($hasD1Readings -or $shouldCheckPi) {
            $pumpReadings = if ($hasD1Readings) { $readingsBySlot[$rowSlotKey] } else { @{} }
            $rowModified = $false

            # Pump A
            if ($pumpReadings.ContainsKey('A')) {
                $pA = $pumpReadings['A']
                $currIn = $ws.Cells.Item($r, 3).Value2
                $currOut = $ws.Cells.Item($r, 4).Value2
                $aMod = $false
                if ($null -ne $pA.tg3602 -and $pA.tg3602 -ne "" -and ($null -eq $currIn -or $currIn -eq "" -or [double]$currIn -ne [double]$pA.tg3602)) {
                    $ws.Cells.Item($r, 3).Value2 = [double]$pA.tg3602
                    $aMod = $true
                }
                if ($null -ne $pA.tg3603 -and $pA.tg3603 -ne "" -and ($null -eq $currOut -or $currOut -eq "" -or [double]$currOut -ne [double]$pA.tg3603)) {
                    $ws.Cells.Item($r, 4).Value2 = [double]$pA.tg3603
                    $aMod = $true
                }
                if ($aMod) {
                    $ws.Cells.Item($r, 10).Formula = "=IF(AND(ISNUMBER(C$r),ISNUMBER(D$r)),C$r-D$r,"""")"
                    $rowModified = $true
                }
            }

            # Pump B
            $pB = if ($pumpReadings.ContainsKey('B')) { $pumpReadings['B'] } else { $null }
            $bInVal = if ($pB -and $null -ne $pB.tg3602 -and $pB.tg3602 -ne "") { [double]$pB.tg3602 } else { $null }
            $bOutVal = if ($pB -and $null -ne $pB.tg3603 -and $pB.tg3603 -ne "") { [double]$pB.tg3603 } else { $null }

            # Auto-pull TI-2610B from PI if Out is missing and slot is recent
            if ($null -eq $bOutVal -and $shouldCheckPi) {
                $piVal = Get-PIValueForSlot -SlotDt $slotDateTime
                if ($null -ne $piVal) {
                    $bOutVal = $piVal
                    # Push back to Cloudflare D1 so Web App & LINE Bot get it immediately
                    try {
                        $utcMs = [long]([DateTimeOffset]::new($slotDateTime, [TimeSpan]::FromHours(7)).ToUnixTimeMilliseconds())
                        $bId = "B_$($slotDateTime.ToString('yyyyMMddHHmm'))"
                        $postBody = @{
                            id = $bId
                            pump = "B"
                            slotTime = $utcMs
                            tg3603 = $bOutVal
                            recordedBy = "PI DataLink"
                        } | ConvertTo-Json
                        Invoke-RestMethod -Uri "https://monitor-pp-601.supasiao.workers.dev/api/readings" -Method POST -Body $postBody -ContentType "application/json" -TimeoutSec 5 | Out-Null
                        Write-Host "  [PI AUTO-PULL] Row $r [$rowSlotKey] TI-2610B -> $bOutVal °C synced to D1"
                    } catch {
                        Write-Warning "Failed to push PI reading to D1: $($_.Exception.Message)"
                    }
                }
            }

            $currBIn = $ws.Cells.Item($r, 5).Value2
            $currBOut = $ws.Cells.Item($r, 6).Value2
            $bMod = $false
            if ($null -ne $bInVal -and ($null -eq $currBIn -or $currBIn -eq "" -or [double]$currBIn -ne $bInVal)) {
                $ws.Cells.Item($r, 5).Value2 = $bInVal
                $bMod = $true
            }
            if ($null -ne $bOutVal -and ($null -eq $currBOut -or $currBOut -eq "" -or [double]$currBOut -ne $bOutVal)) {
                $ws.Cells.Item($r, 6).Value2 = $bOutVal
                $bMod = $true
            }
            if ($bMod) {
                $ws.Cells.Item($r, 11).Formula = "=IF(AND(ISNUMBER(E$r),ISNUMBER(F$r)),E$r-F$r,"""")"
                $rowModified = $true
            }

            # Pump C
            if ($pumpReadings.ContainsKey('C')) {
                $pC = $pumpReadings['C']
                $currIn = $ws.Cells.Item($r, 7).Value2
                $currOut = $ws.Cells.Item($r, 8).Value2
                $cMod = $false
                if ($null -ne $pC.tg3602 -and $pC.tg3602 -ne "" -and ($null -eq $currIn -or $currIn -eq "" -or [double]$currIn -ne [double]$pC.tg3602)) {
                    $ws.Cells.Item($r, 7).Value2 = [double]$pC.tg3602
                    $cMod = $true
                }
                if ($null -ne $pC.tg3603 -and $pC.tg3603 -ne "" -and ($null -eq $currOut -or $currOut -eq "" -or [double]$currOut -ne [double]$pC.tg3603)) {
                    $ws.Cells.Item($r, 8).Value2 = [double]$pC.tg3603
                    $cMod = $true
                }
                if ($cMod) {
                    $ws.Cells.Item($r, 12).Formula = "=IF(AND(ISNUMBER(G$r),ISNUMBER(H$r)),G$r-H$r,"""")"
                    $rowModified = $true
                }
            }

            if ($rowModified) {
                if (-not $ws.Cells.Item($r, 9).Value2) { $ws.Cells.Item($r, 9).Value2 = 70 }
                if (-not $ws.Cells.Item($r, 13).Value2) { $ws.Cells.Item($r, 13).Value2 = 20 }
                $logA = if ($pumpReadings.ContainsKey('A')) { "$($pumpReadings['A'].tg3602)/$($pumpReadings['A'].tg3603)" } else { "-/-" }
                $logB = "$($bInVal)/$($bOutVal)"
                $logC = if ($pumpReadings.ContainsKey('C')) { "$($pumpReadings['C'].tg3602)/$($pumpReadings['C'].tg3603)" } else { "-/-" }
                $updatedRows++
                Write-Host "  Updated Row $r [$rowSlotKey] -> A: $logA | B: $logB | C: $logC"
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
