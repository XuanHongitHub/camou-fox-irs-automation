# FOX-AUTO COPILOT HUB - CLOUDFLARE WEB TUNNEL LAUNCHER
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "   FOX-AUTO COPILOT HUB -- WEB TUNNEL AND CLOUDFLARED AUTO-LAUNCHER" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ScriptDir) { $ScriptDir = "F:\Herd\fox-auto" }
$TtsBotDir = Join-Path $ScriptDir "additions\tts_bot"
if (-not (Test-Path $TtsBotDir)) {
    $TtsBotDir = "G:\RTTS\19-08-2026\fox-auto\additions\tts_bot"
}
$RuntimeDir = Join-Path $TtsBotDir "runtime"
if (-not (Test-Path $RuntimeDir)) { New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null }
$TunnelUrlFile = Join-Path $RuntimeDir "tunnel_url.txt"
$BinDir = Join-Path $ScriptDir "bin"
if (-not (Test-Path $BinDir)) { New-Item -ItemType Directory -Path $BinDir -Force | Out-Null }

# STEP 1: CHECK OR START TTS-BOT BACKEND (:8787)
Write-Host ""
Write-Host "[1/3] Kiem tra trang thai Backend (:8787)..." -ForegroundColor White
$isBackendRunning = $false
try {
    $conn = Get-NetTCPConnection -LocalPort 8787 -ErrorAction SilentlyContinue
    if ($conn) { $isBackendRunning = $true }
} catch {}

if ($isBackendRunning) {
    Write-Host "  [OK] Backend (:8787) dang chay san sang!" -ForegroundColor Green
} else {
    Write-Host "  [INFO] Backend chua chay. Dang tu dong khoi dong service.py tren port 8787..." -ForegroundColor Yellow
    
    $pythonCmd = "python"
    try {
        $null = Get-Command python -ErrorAction Stop
    } catch {
        if (Test-Path "C:\Python312\python.exe") { $pythonCmd = "C:\Python312\python.exe" }
        elseif (Test-Path "C:\Python311\python.exe") { $pythonCmd = "C:\Python311\python.exe" }
        elseif (Test-Path "C:\Python310\python.exe") { $pythonCmd = "C:\Python310\python.exe" }
        else {
            $pyCandidates = Get-ChildItem -Path "$env:LOCALAPPDATA\Programs\Python" -Filter "python.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue
            if ($pyCandidates) { $pythonCmd = $pyCandidates[0].FullName }
        }
    }
    
    $serviceScript = Join-Path $TtsBotDir "service.py"
    if (-not (Test-Path $serviceScript)) {
        Write-Host "  [ERROR] Khong tim thay service.py tai $serviceScript" -ForegroundColor Red
    } else {
        Start-Process -FilePath $pythonCmd -ArgumentList "service.py" -WorkingDirectory $TtsBotDir -WindowStyle Minimized
        Write-Host "  [WAIT] Dang cho Backend khoi tao (3-5 giay)..." -ForegroundColor Gray
        
        $retries = 15
        while ($retries -gt 0) {
            Start-Sleep -Seconds 1
            try {
                $check = Invoke-RestMethod -Uri "http://127.0.0.1:8787/api/status" -TimeoutSec 2 -ErrorAction SilentlyContinue
                if ($check) {
                    Write-Host "  [OK] Backend (:8787) da khoi dong thanh cong!" -ForegroundColor Green
                    $isBackendRunning = $true
                    break
                }
            } catch {}
            $retries--
        }
    }
}

# STEP 2: FIND OR AUTO-DOWNLOAD CLOUDFLARE TUNNEL (NON-DEV ZERO-FRICTION)
Write-Host ""
Write-Host "[2/3] Kiem tra Cloudflare Tunnel (cloudflared)..." -ForegroundColor White
$cfExe = $null

try {
    $found = Get-Command cloudflared -ErrorAction SilentlyContinue
    if ($found) { $cfExe = $found.Source }
} catch {}

if (-not $cfExe) {
    $progPaths = @(
        "C:\Program Files (x86)\cloudflared\cloudflared.exe",
        "C:\Program Files\cloudflared\cloudflared.exe",
        (Join-Path $BinDir "cloudflared.exe")
    )
    foreach ($p in $progPaths) {
        if (Test-Path $p) {
            $cfExe = $p
            break
        }
    }
}

if (-not $cfExe) {
    Write-Host "  [DOWNLOAD] May chua cai dat cloudflared. Tu dong tai tu Cloudflare..." -ForegroundColor Cyan
    $destExe = Join-Path $BinDir "cloudflared.exe"
    $downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri $downloadUrl -OutFile $destExe -UseBasicParsing
        if (Test-Path $destExe) {
            $cfExe = $destExe
            Write-Host "  [OK] Da tai thanh cong cloudflared.exe vao: $destExe" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [RETRY] Invoke-WebRequest gap su co, thu dung curl.exe..." -ForegroundColor Yellow
        try {
            & curl.exe -L -o $destExe $downloadUrl
            if (Test-Path $destExe) { $cfExe = $destExe }
        } catch {}
    }
}

if (-not $cfExe -or -not (Test-Path $cfExe)) {
    Write-Host "  [ERROR] Khong the tai hoac tim thay cloudflared.exe!" -ForegroundColor Red
    pause
    exit 1
}

$cfVer = (& $cfExe --version 2>&1) -join " "
Write-Host "  [OK] Su dung Cloudflare Tunnel: $cfExe" -ForegroundColor Green
Write-Host "       $cfVer" -ForegroundColor Gray

# STEP 3: ACTIVATE QUICK TUNNEL AND BROADCAST PUBLIC URL
Write-Host ""
Write-Host "[3/3] Dang kich hoat Quick Tunnel noi toi http://127.0.0.1:8787..." -ForegroundColor White
Write-Host "  [CONNECTING] Dang ket noi toi Cloudflare Edge Network..." -ForegroundColor Gray

$script:capturedLines = [System.Collections.Generic.List[string]]::new()

$pinfo = New-Object System.Diagnostics.ProcessStartInfo
$pinfo.FileName = $cfExe
$pinfo.Arguments = "tunnel --url http://127.0.0.1:8787 --no-autoupdate"
$pinfo.RedirectStandardError = $true
$pinfo.RedirectStandardOutput = $true
$pinfo.UseShellExecute = $false
$pinfo.CreateNoWindow = $true

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $pinfo

$process.add_ErrorDataReceived({
    param($sender, $e)
    if ($e.Data) {
        $script:capturedLines.Add($e.Data)
    }
})

$process.Start() | Out-Null
$process.BeginErrorReadLine()

$tunnelUrl = $null
$maxWait = 35
$startTime = Get-Date

while (-not $tunnelUrl -and ((Get-Date) - $startTime).TotalSeconds -lt $maxWait) {
    if ($process.HasExited) { break }
    
    foreach ($line in @($script:capturedLines)) {
        if ($line -match "(https://[a-zA-Z0-9-]+\.trycloudflare\.com)") {
            $tunnelUrl = $matches[1]
            break
        }
    }
    if ($tunnelUrl) { break }
    Start-Sleep -Milliseconds 300
}

if ($tunnelUrl) {
    $copilotWebUrl = "$tunnelUrl/copilot"
    
    Set-Content -Path $TunnelUrlFile -Value $tunnelUrl -Encoding UTF8 -Force
    $dotPsdUrlFile = "G:\RTTS\dotpsd\runtime\tunnel_url.txt"
    if (Test-Path (Split-Path $dotPsdUrlFile -Parent)) {
        Set-Content -Path $dotPsdUrlFile -Value $tunnelUrl -Encoding UTF8 -Force
    }

    try {
        Set-Clipboard -Value $copilotWebUrl
        $clipMsg = "DA TU DONG COPY LINK VAO CLIPBOARD! BAM CTRL+V DE DAN."
    } catch {
        $clipMsg = "Hay copy link ben duoi."
    }

    Write-Host ""
    Write-Host "================================================================================" -ForegroundColor Green
    Write-Host "   CLOUDFLARE WEB TUNNEL DA HOAT DONG HOAN HAO!" -ForegroundColor Yellow
    Write-Host "================================================================================" -ForegroundColor Green
    Write-Host "  Link Web Truy Cap:   " -NoNewline -ForegroundColor White
    Write-Host $copilotWebUrl -ForegroundColor Cyan
    Write-Host "  Thiet bi tu xa:      Mo bang trinh duyet tren dien thoai hoac may khac" -ForegroundColor Gray
    Write-Host "  Clipboard:           $clipMsg" -ForegroundColor Yellow
    Write-Host "  Local Host:          http://127.0.0.1:8787/copilot" -ForegroundColor DarkGray
    Write-Host "================================================================================" -ForegroundColor Green
    Write-Host "  [CHU Y] Giu cua so nay mo de duy tri ket noi Tunnel." -ForegroundColor White
    Write-Host "  (Nhan Ctrl+C de dung Tunnel khi khong su dung)" -ForegroundColor Gray
    Write-Host ""

    Start-Sleep -Seconds 2
    try {
        Start-Process $copilotWebUrl
    } catch {}

    while (-not $process.HasExited) {
        Start-Sleep -Seconds 2
    }
} else {
    Write-Host ""
    Write-Host "  [ERROR] Khong the lay public URL tu Cloudflare Tunnel sau $maxWait giay!" -ForegroundColor Red
    Write-Host "  Vui long kiem tra lai firewall hoac ket noi internet." -ForegroundColor Yellow
}

if (Test-Path $TunnelUrlFile) { Remove-Item $TunnelUrlFile -Force -ErrorAction SilentlyContinue }
if (Test-Path $dotPsdUrlFile) { Remove-Item $dotPsdUrlFile -Force -ErrorAction SilentlyContinue }
pause
