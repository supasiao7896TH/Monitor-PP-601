# scripts/backfill-pi.ps1
# One-time backfill of missing TI-2610B values from PI Archive into Cloudflare D1
$ErrorActionPreference = "Stop"

$afDll = 'C:\Program Files (x86)\PIPC\AF\PublicAssemblies\4.0\OSIsoft.AFSDK.dll'
if (-not (Test-Path $afDll)) {
    Write-Error "PI AF SDK not found at: $afDll"
    exit 1
}

[System.Reflection.Assembly]::LoadFrom($afDll) | Out-Null
$srvs = New-Object OSIsoft.AF.PI.PIServers
$srv = $srvs['gcmppisvr']
if (-not $srv) { $srv = $srvs.Add('gcmppisvr') }
$srv.Connect()
$piPoint = [OSIsoft.AF.PI.PIPoint]::FindPIPoint($srv, '1-pTA.2M.1TI2610B.PV')
Write-Host "Connected to PI Server 'gcmppisvr', tag '$($piPoint.Name)'"

$apiUrl = 'https://monitor-pp-601.supasiao.workers.dev/api/readings?limit=500'
$res = Invoke-RestMethod -Uri $apiUrl -Method GET -TimeoutSec 10
$postUrl = 'https://monitor-pp-601.supasiao.workers.dev/api/readings'
$missingB = $res.readings | Where-Object { $_.pump -eq 'B' -and ($null -eq $_.tg3603 -or $_.tg3603 -eq '') }
Write-Host "Found $($missingB.Count) Pump B readings missing tg3603 in D1"

$now = Get-Date
$backfilledCount = 0

foreach ($item in $missingB) {
    $utcMs = [long]$item.slotTime
    $bkkDt = [DateTimeOffset]::FromUnixTimeMilliseconds($utcMs).AddHours(7).DateTime
    
    # Don't backfill future slots
    if ($bkkDt -gt $now.AddMinutes(30)) { continue }

    $localDt = [DateTime]::SpecifyKind($bkkDt, [DateTimeKind]::Local)
    $afTime = [OSIsoft.AF.Time.AFTime]::new($localDt)
    $valObj = $piPoint.InterpolatedValue($afTime)
    
    if ($valObj -and $valObj.IsGood) {
        $piVal = [Math]::Round([double]$valObj.Value, 1)
        
        $recBy = if ($item.recordedBy -and $item.recordedBy -notmatch 'PI DataLink') {
            "$($item.recordedBy) / PI DataLink"
        } else {
            'PI DataLink'
        }

        $postBody = @{
            id = $item.id
            pump = 'B'
            slotTime = $utcMs
            shiftId = $item.shiftId
            tg3603 = $piVal
            recordedBy = $recBy
        } | ConvertTo-Json

        try {
            Invoke-RestMethod -Uri $postUrl -Method POST -Body $postBody -ContentType 'application/json' -TimeoutSec 5 | Out-Null
            $backfilledCount++
            Write-Host "  [OK] $($bkkDt.ToString('yyyy-MM-dd HH:mm')) -> $piVal °C (tg3602 was $($item.tg3602))"
        } catch {
            Write-Warning "  [FAIL] $($item.id): $($_.Exception.Message)"
        }
    } else {
        Write-Warning "  [NO GOOD PI DATA] $($bkkDt.ToString('yyyy-MM-dd HH:mm'))"
    }
}

Write-Host "`nSuccessfully backfilled $backfilledCount readings to Cloudflare D1!"
