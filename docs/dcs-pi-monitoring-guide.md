# คู่มือการดึงข้อมูล DCS Yokogawa ผ่าน OSIsoft PI AF SDK ด้วย PowerShell
## (GC-M PTA Industrial Digital Automation Standard)

> **ผู้บันทึก:** Supasit.A (พี่ A) & Antigravity (AI Assistant)  
> **องค์กร:** GC-M PTA (เครือ PTTGC) นิคมอุตสาหกรรมมาบตาพุด  
> **เวอร์ชัน:** 1.0 (2026-11-11)  
> **เป้าหมาย:** บันทึกองค์ความรู้และแม่แบบโค้ด (Reusable Template) สำหรับการดึงข้อมูล Process Variable จากระบบ DCS Yokogawa CENTUM VP ผ่าน OSIsoft PI Data Archive มาสร้างระบบ Monitoring, Real-time Dashboard, และ Excel Automation โดยอัตโนมัติ

---

## 🏛️ 1. สถาปัตยกรรมระบบ (System Architecture)

```
[ เครื่องมือวัดหน้างาน (Transmitters / Sensors) ]
                    │  (4-20 mA / Foundation Fieldbus)
                    ▼
[ Yokogawa CENTUM VP (DCS Field Control Station) ]
                    │  (Yokogawa Exaopc / PI Interface)
                    ▼
[ OSIsoft PI Data Archive Server: "gcmppisvr" ]
                    │
                    │  (TCP Port 5450 / 5457 · Windows Integrated Authentication)
                    ▼
[ PC วิศวกร / Control Room PC (Windows Domain User) ]
    ├── OSIsoft.AFSDK.dll (.NET Assembly v4.0)
    └── PowerShell Worker (Background Automation Task)
            │
            ├──► บันทึกลง K:\PE1 Excel Report อัตโนมัติ
            └──► ส่งต่อ REST API ขึ้น Cloudflare D1 / Web App Real-Time
```

---

## 🔑 2. ปัจจัยความสำเร็จที่ทำให้เชื่อมต่อได้ (Key Enablers)

1. **Windows Integrated Security (Zero-Credential):**
   * เครื่อง PC ต่ออยู่ในวงเครือข่ายของ GC-M PTA (LAN หรือ Corporate VPN)
   * ผู้ใช้ Login ด้วย Windows Domain Account (เช่น รหัสพนักงาน `26007294`)
   * OSIsoft AF SDK จะใช้ Kerberos/NTLM ยืนยันตัวตนกับเซิร์ฟเวอร์ PI อัตโนมัติ **ไม่ต้องเขียนรหัสผ่านทิ้งไว้ในโค้ด** ปลอดภัยสูงสุดตามมาตรฐาน Cybersecurity

2. **Native .NET Assembly (OSIsoft.AFSDK.dll):**
   * ติดตั้งมาพร้อมกับโปรแกรม OSIsoft PI DataLink หรือ PI ProcessBook
   * ตำแหน่งไฟล์มาตรฐาน:
     ```
     C:\Program Files (x86)\PIPC\AF\PublicAssemblies\4.0\OSIsoft.AFSDK.dll
     ```
   * รันได้รวดเร็ว ประสิทธิภาพสูงกว่าการเปิดผ่าน Excel COM Automation มหาศาล

---

## 💻 3. แม่แบบโค้ด PowerShell สำหรับนำไปใช้ซ้ำ (Reusable Code Template)

### 3.1 การเชื่อมต่อ PI Server และค้นหา Tag

```powershell
# 1. โหลดไลบรารี AF SDK
$afDll = "C:\Program Files (x86)\PIPC\AF\PublicAssemblies\4.0\OSIsoft.AFSDK.dll"
if (-not (Test-Path $afDll)) {
    throw "ไม่พบไฟล์ OSIsoft.AFSDK.dll กรุณาตรวจสอบการติดตั้ง PI DataLink"
}
[System.Reflection.Assembly]::LoadFrom($afDll) | Out-Null

# 2. เชื่อมต่อ PI Server
$piServerName = "gcmppisvr"
$srvs = New-Object OSIsoft.AF.PI.PIServers
$srv = $srvs[$piServerName]
if (-not $srv) { $srv = $srvs.Add($piServerName) }
$srv.Connect()

# 3. ระบุ Tag Name ที่ต้องการอ่านค่า
$piTagName = "1-pTA.2M.1TI2610B.PV"  # ตัวอย่าง Tag DCS ของ GC-M PTA
$piPoint = [OSIsoft.AF.PI.PIPoint]::FindPIPoint($srv, $piTagName)
Write-Host "เชื่อมต่อ PI Tag: $($piPoint.Name) สำเร็จ!" -ForegroundColor Green
```

---

### 3.2 ฟังก์ชันดึงค่าปัจจุบัน (Current Snapshot)

```powershell
function Get-PICurrentValue {
    param([OSIsoft.AF.PI.PIPoint]$Point)
    
    $snap = $Point.CurrentValue()
    if ($snap -and $snap.IsGood) {
        return [double]$snap.Value
    }
    return $null
}
```

---

### 3.3 ฟังก์ชันดึงค่าย้อนหลัง ณ เวลาที่ต้องการ (Interpolated Value at Specific Time)

> [!IMPORTANT]
> **เรื่อง Timezone สำคัญมาก:** เวลาในโรงงาน GC-M PTA เป็นเวลาไทย (UTC+7) ต้องระบุ `[DateTimeKind]::Local` ชัดเจนก่อนส่งให้ `AFTime` เพื่อไม่ให้เวลาคลาดเคลื่อน

```powershell
function Get-PIValueAtTime {
    param(
        [OSIsoft.AF.PI.PIPoint]$Point,
        [DateTime]$TargetDateTime
    )
    
    # บังคับระบุเป็น Local Time ป้องกันการแปลง UTC ผิดพลาด
    $localDt = [DateTime]::SpecifyKind($TargetDateTime, [DateTimeKind]::Local)
    $afTime = [OSIsoft.AF.Time.AFTime]::new($localDt)
    
    # อ่านค่าแบบ Interpolated ณ เวลานั้น
    $valObj = $Point.InterpolatedValue($afTime)
    
    # ตรวจสอบว่าสัญญาณปกติ (IsGood = true ไม่ใช่ Bad/Scan Off)
    if ($valObj -and $valObj.IsGood) {
        return [Math]::Round([double]$valObj.Value, 1)
    }
    return $null
}

# ตัวอย่างการเรียกใช้งาน: ดึงค่าเมื่อ 30 นาทีที่แล้ว
$val = Get-PIValueAtTime -Point $piPoint -TargetDateTime (Get-Date).AddMinutes(-30)
Write-Host "ค่าอุณหภูมิ: $val °C"
```

---

### 3.4 ฟังก์ชันดึงค่าสถิติเฉลี่ย (Summary / Average / Min / Max)

```powershell
function Get-PIAverage {
    param(
        [OSIsoft.AF.PI.PIPoint]$Point,
        [DateTime]$StartTime,
        [DateTime]$EndTime
    )
    
    $timeRange = [OSIsoft.AF.Time.AFTimeRange]::new($StartTime, $EndTime)
    $summary = $Point.Summary($timeRange, [OSIsoft.AF.Data.AFSummaryTypes]::Average, [OSIsoft.AF.Data.AFCalculationBasis]::TimeWeighted, [OSIsoft.AF.Data.AFTimestampCalculation]::Auto)
    
    foreach ($val in $summary.Values) {
        if ($val.IsGood) {
            return [Math]::Round([double]$val.Value, 2)
        }
    }
    return $null
}
```

---

## 🎯 4. ไอเดียการนำไปต่อยอดในโรงงาน GC-M PTA (Future Ideas)

1. **Critical Pump / Machine Monitoring:**
   * มอนิเตอร์ Bearing Temperature, Motor Winding Temp, Motor Current (Amps), Vibration ของปั๊มตัวสำคัญในยูนิต PTA
2. **Heat Exchanger & Cooler Fouling Detection:**
   * ดึงค่า In/Out Temp และ Flow Rate มาคำนวณ Heat Duty ($Q = m C_p \Delta T$) หรือ Differential Pressure ($\Delta P$) ตรวจจับ Strainer / Plate ตันล่วงหน้า
3. **Fired Heater / Furnace Coil Balance:**
   * ดึงค่า Temp ราย Pass ของเตาเผาเพื่อดู Balance การกระจายความร้อน
4. **Automated LINE Alert on Anomaly:**
   * ตั้ง Task รันเบื้องหลังทุก 1-5 นาที หากพบค่า Tag ผิดปกติ หรืออัตราการเปลี่ยนแปลง ($\frac{dT}{dt}$) สูงผิดปกติ ให้ส่ง Webhook ยิงแจ้งเตือนเข้ากลุ่ม LINE ของทีมวิศวกรทันที

---

## 🔒 5. มาตรฐานความปลอดภัย (Safety & Reliability Rules)

* **Read-Only by Default:** สคริปต์ต้องทำหน้าที่ดึงข้อมูลมาอ่านและวิเคราะห์เท่านั้น (ห้ามใช้สิทธิ์เขียนค่ากลับเข้า DCS)
* **Quality Check (`IsGood`):** ต้องตรวจสอบ `$valObj.IsGood` ทุกครั้งเพื่อป้องกันการนำค่า Bad Quality (เช่น Sensor Fault, Scan Off) ไปประมวลผล
* **Fail-Safe Timeout:** มี `try...catch` คลุมเสมอ หาก Network หลุดหรือ PI Server ไม่พร้อมใช้งาน สคริปต์ต้องข้ามไปได้โดยไม่ทำให้เครื่องหรือไฟล์ Excel เสียหาย
