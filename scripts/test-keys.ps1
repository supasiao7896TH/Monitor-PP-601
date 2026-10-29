# scripts/test-keys.ps1
# Diagnostic utility to test and list time slot keys fetched from Cloudflare D1
$ApiUrl = "https://monitor-pp-601.supasiao.workers.dev/api/readings?limit=200"
$res = Invoke-RestMethod -Uri $ApiUrl -Method GET -TimeoutSec 10
$readings = $res.readings

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

Write-Host "Keys in readingsBySlot:"
foreach ($k in ($readingsBySlot.Keys | Sort-Object)) {
    Write-Host "  SlotKey: '$k' -> Pumps: $(($readingsBySlot[$k].Keys) -join ', ')"
}
