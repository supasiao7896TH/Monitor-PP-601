# scripts/fix-excel-template.ps1
# Populates missing Time slots (Col 2), Dates (Col 1), and formulas for Rows 619 to 786 in K: Drive Excel
param(
    [string]$ExcelPath = "K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx"
)

$ErrorActionPreference = "Stop"

Write-Host "Checking Excel file lock on $ExcelPath..."
try {
    $fileStream = [System.IO.File]::Open($ExcelPath, [System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    if ($fileStream) {
        $fileStream.Close()
        $fileStream.Dispose()
    }
} catch {
    Write-Error "Excel file is currently locked: $($_.Exception.Message)"
    exit 1
}

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false

try {
    Write-Host "Opening workbook..."
    $wb = $excel.Workbooks.Open($ExcelPath, $false, $false)
    $ws = $wb.Sheets.Item(1)

    $hours = @(1, 4, 7, 10, 13, 16, 19, 22)
    $startDate = [DateTime]::new(2026, 11, 10)
    $startRow = 619
    $endRow = 786

    Write-Host "Filling template rows from $startRow to $endRow..."
    for ($r = $startRow; $r -le $endRow; $r++) {
        $slotIdx = ($r - $startRow) % 8
        $dayOffset = [int][Math]::Floor(($r - $startRow) / 8)
        $date = $startDate.AddDays($dayOffset)
        $hour = $hours[$slotIdx]

        # 1. Date at 1:00 slot (Col 1)
        if ($slotIdx -eq 0) {
            $ws.Cells.Item($r, 1).NumberFormat = "dd/mm/yyyy"
            $ws.Cells.Item($r, 1).Value2 = $date.ToOADate()
        }

        # 2. Time (Col 2)
        $timeFraction = [double]$hour / 24.0
        $ws.Cells.Item($r, 2).NumberFormat = "h:mm"
        $ws.Cells.Item($r, 2).Value2 = $timeFraction

        # 3. Diff formulas (Cols 10, 11, 12)
        $ws.Cells.Item($r, 10).Formula = "=C$r-D$r"
        $ws.Cells.Item($r, 11).Formula = "=E$r-F$r"
        $ws.Cells.Item($r, 12).Formula = "=G$r-H$r"

        # 4. Limits (Cols 9, 13)
        $ws.Cells.Item($r, 9).Value2 = 70
        $ws.Cells.Item($r, 13).Value2 = 20
    }

    $wb.Save()
    Write-Host "Successfully populated rows $startRow to $endRow and saved workbook!"
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
