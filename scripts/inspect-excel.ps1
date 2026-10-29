# scripts/inspect-excel.ps1
# Diagnostic utility to inspect the last 30 rows of Monitor temp pump PP-601.xlsx on drive K:
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
try {
    $path = "K:\PE1\Daily report PTA1\Monitor temp pump PP-601.xlsx"
    $wb = $excel.Workbooks.Open($path, $false, $true)
    $ws = $wb.Sheets.Item(1)
    $lastRow = $ws.UsedRange.Rows.Count
    Write-Host "K: Drive Last row: $lastRow"
    $start = [Math]::Max(6, $lastRow - 30)
    for ($r = $start; $r -le $lastRow; $r++) {
        $d = $ws.Cells.Item($r, 1).Text
        $t = $ws.Cells.Item($r, 2).Text
        $aIn = $ws.Cells.Item($r, 3).Text
        $aOut = $ws.Cells.Item($r, 4).Text
        $cIn = $ws.Cells.Item($r, 7).Text
        $cOut = $ws.Cells.Item($r, 8).Text
        Write-Host "Row $r | Date: '$d' | Time: '$t' | A: $aIn/$aOut | C: $cIn/$cOut"
    }
    $wb.Close($false)
} finally {
    $excel.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
