# scripts/extract-excel.ps1
# Extract history from Monitor temp pump PP-601.xlsx to src/data/seed-data.json
param(
    [string]$ExcelPath = ".\Monitor temp pump PP-601.xlsx",
    [string]$OutputPath = ".\src\data\seed-data.json"
)

Add-Type -AssemblyName System.IO.Compression.FileSystem

if (-not (Test-Path $ExcelPath)) {
    Write-Error "Excel file not found: $ExcelPath"
    exit 1
}

$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path $ExcelPath))

# 1. Read shared strings
$sstEntry = $zip.GetEntry("xl/sharedStrings.xml")
$sstReader = New-Object System.IO.StreamReader($sstEntry.Open())
[xml]$sstXml = $sstReader.ReadToEnd()
$strings = @($sstXml.sst.si | ForEach-Object {
    if ($_.t) { $_.t -join '' }
    elseif ($_.r) { ($_.r | ForEach-Object { $_.t }) -join '' }
    else { "" }
})

# 2. Read sheet1.xml
$sheetEntry = $zip.GetEntry("xl/worksheets/sheet1.xml")
$sheetReader = New-Object System.IO.StreamReader($sheetEntry.Open())
[xml]$sheetXml = $sheetReader.ReadToEnd()
$zip.Dispose()

$readingsMap = [System.Collections.Specialized.OrderedDictionary]::new()
$curDate = $null

foreach ($row in $sheetXml.worksheet.sheetData.row) {
    if ([int]$row.r -lt 6) { continue }
    $cols = @{}
    foreach ($c in $row.c) {
        $colLetter = $c.r -replace '\d+',''
        $val = $c.v
        if ($c.t -eq "s") { $val = $strings[[int]$val] }
        $cols[$colLetter] = $val
    }
    if ($cols['A']) {
        $curDate = [int]$cols['A']
        if ($curDate -gt 0 -and $curDate -lt 45000) { $curDate += 3652 }
    }
    if (-not $curDate -or -not $cols['B']) { continue }

    $tNum = [double]$cols['B']
    $hour = ([Math]::Round($tNum * 24)) % 24

    # Calculate Epoch ms in UTC (Bangkok hour - 7)
    $utcMs = [long]($curDate - 25569) * 86400000 + [long]($hour - 7) * 3600000

    # Date string for slotKey
    $bkkDate = [DateTimeOffset]::FromUnixTimeMilliseconds($utcMs).AddHours(7).DateTime
    $dtStr = $bkkDate.ToString("yyyyMMddHHmm")

    # Shift calculation
    $timeOfDay = [TimeSpan]::FromHours($hour)
    $shiftKind = if ($timeOfDay -ge [TimeSpan]::FromHours(7.5) -and $timeOfDay -lt [TimeSpan]::FromHours(19.5)) { "D" } else { "N" }
    $shiftDate = if ($timeOfDay -lt [TimeSpan]::FromHours(7.5)) { $bkkDate.AddDays(-1).ToString("yyyy-MM-dd") } else { $bkkDate.ToString("yyyy-MM-dd") }
    $shiftId = "$($shiftDate)_$($shiftKind)"

    $note = ""
    if ($cols['N']) { $note = $cols['N'].Trim() }

    # Pump A
    if ($cols['C'] -and $cols['D']) {
        $id = "A_$dtStr"
        $readingsMap[$id] = [PSCustomObject]@{
            id = $id
            pump = "A"
            slotTime = $utcMs
            shiftId = $shiftId
            tg3602 = [double]$cols['C']
            tg3603 = [double]$cols['D']
            note = $note
            recordedBy = "Excel Import"
            voided = $false
        }
    }
    # Pump B
    if ($cols['E'] -and $cols['F']) {
        $id = "B_$dtStr"
        $readingsMap[$id] = [PSCustomObject]@{
            id = $id
            pump = "B"
            slotTime = $utcMs
            shiftId = $shiftId
            tg3602 = [double]$cols['E']
            tg3603 = [double]$cols['F']
            note = $note
            recordedBy = "Excel Import"
            voided = $false
        }
    }
    # Pump C
    if ($cols['G'] -and $cols['H']) {
        $id = "C_$dtStr"
        $readingsMap[$id] = [PSCustomObject]@{
            id = $id
            pump = "C"
            slotTime = $utcMs
            shiftId = $shiftId
            tg3602 = [double]$cols['G']
            tg3603 = [double]$cols['H']
            note = $note
            recordedBy = "Excel Import"
            voided = $false
        }
    }
}

$allReadings = @($readingsMap.Values)

# 3. Detect switch events
$bySlot = @{}
foreach ($r in $allReadings) {
    if (-not $bySlot.ContainsKey($r.slotTime)) { $bySlot[$r.slotTime] = [System.Collections.Generic.HashSet[string]]::new() }
    [void]$bySlot[$r.slotTime].Add($r.pump)
}

$sortedSlots = $bySlot.Keys | Sort-Object
$events = @()
$prevRunning = $null

foreach ($slot in $sortedSlots) {
    $running = $bySlot[$slot]
    if ($prevRunning) {
        $stopped = @($prevRunning | Where-Object { -not $running.Contains($_) })
        $started = @($running | Where-Object { -not $prevRunning.Contains($_) })

        if ($stopped.Count -eq 1 -and $started.Count -eq 1) {
            $events += [PSCustomObject]@{
                id = "ev_sw_$slot"
                type = "switch"
                at = $slot
                stop = $stopped[0]
                start = $started[0]
                reason = "Switch according to Excel history"
                by = "Excel Import"
                createdAt = $slot
            }
        }
    }
    $prevRunning = $running
}

# Add Special Event: 24/8/26 PP-601C use oil cooler from PTA#2
$cleanMs = [long](46258 - 25569) * 86400000 + [long](7.5 - 7) * 3600000
$events += [PSCustomObject]@{
    id = "ev_cl_20260824"
    type = "cleaning"
    at = $cleanMs
    pump = "C"
    target = "oil_cooler"
    endAt = $cleanMs
    note = "***24/8/26 PP-601C use oil cooler from PTA#2(Chemical claning aleardy)"
    by = "Excel Import"
    endedBy = "Excel Import"
    createdAt = $cleanMs
}

# 4. Prepare Output JSON
$targetFile = Join-Path (Get-Location) $OutputPath
$outDir = Split-Path -Parent $targetFile
if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$summary = [PSCustomObject]@{
    totalReadings = $allReadings.Count
    totalEvents = $events.Count
    firstReadingTime = $allReadings[0].slotTime
    lastReadingTime = $allReadings[-1].slotTime
    generatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

$seedData = [PSCustomObject]@{
    summary = $summary
    readings = $allReadings
    events = $events
}

$json = $seedData | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText($targetFile, $json, [System.Text.Encoding]::UTF8)

Write-Host "Extraction Success:"
Write-Host "  Unique Readings: $($allReadings.Count)"
Write-Host "  Events:          $($events.Count)"
Write-Host "  Saved to:        $targetFile"
