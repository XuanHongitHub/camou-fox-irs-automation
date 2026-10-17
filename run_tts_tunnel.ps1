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
    Write-Host "  [INFO] Backend chua chay. Dang tu dong tim Python va khoi dong service.py tren port 8787..." -ForegroundColor Yellow
    
    $pythonCmd = $null

    # 1. Check local virtual environments first
    $venvCandidates = @(
        (Join-Path $ScriptDir ".venv\Scripts\python.exe"),
        (Join-Path $ScriptDir "venv\Scripts\python.exe"),
        (Join-Path $TtsBotDir ".venv\Scripts\python.exe"),
        (Join-Path $TtsBotDir "venv\Scripts\python.exe")
    )
    foreach ($v in $venvCandidates) {
        if (Test-Path $v) { $pythonCmd = $v; break }
    }

    # 2. Check py launcher (Windows Python Launcher)
    if (-not $pythonCmd) {
        try {
            $pyLauncher = Get-Command "py" -ErrorAction SilentlyContinue
            if ($pyLauncher -and (Test-Path $pyLauncher.Source)) {
                $pyOut = & py -3 -c "import sys; print(sys.executable)" 2>$null
                if ($pyOut -and (Test-Path $pyOut.Trim())) {
                    $pythonCmd = $pyOut.Trim()
                }
            }
        } catch {}
    }

    # 3. Check python in PATH, but strictly EXCLUDE the fake Microsoft Store WindowsApps stub
    if (-not $pythonCmd) {
        $allPy = Get-Command "python" -All -ErrorAction SilentlyContinue
        foreach ($p in $allPy) {
            if ($p.Source -and ($p.Source -notlike "*WindowsApps*") -and (Test-Path $p.Source)) {
                $pythonCmd = $p.Source
                break
            }
        }
    }

    # 4. Search common installation paths
    if (-not $pythonCmd) {
        $commonDirs = @(
            "C:\Python313\python.exe",
            "C:\Python312\python.exe",
            "C:\Python311\python.exe",
            "C:\Python310\python.exe",
            "C:\Program Files\Python313\python.exe",
            "C:\Program Files\Python312\python.exe",
            "C:\Program Files\Python311\python.exe",
            "C:\Program Files\Python310\python.exe"
        )
        foreach ($c in $commonDirs) {
            if (Test-Path $c) { $pythonCmd = $c; break }
        }
    }

    # 5. Search LocalAppData Programs Python (Default python.exe install location on Windows)
    if (-not $pythonCmd) {
        $localPy = Get-ChildItem -Path "$env:LOCALAPPDATA\Programs\Python" -Filter "python.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue
        if ($localPy) {
            $pythonCmd = $localPy[0].FullName
        }
    }

    if (-not $pythonCmd) {
        Write-Host "  [AUTO-INSTALL] May tinh chua co Python. Dang tu dong cai dat Python 3.11 (Zero-Friction)..." -ForegroundColor Yellow
        
        $installedSuccessfully = $false

        # Cach 1: Su dung winget (Co san tren Windows 10/11)
        try {
            $hasWinget = Get-Command "winget" -ErrorAction SilentlyContinue
            if ($hasWinget) {
                Write-Host "  [INSTALL] Dang goi winget de cai dat Python 3.11 tu dong..." -ForegroundColor Cyan
                & winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements --override "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0" | Out-Null
                
                $candidate = "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
                if (Test-Path $candidate) {
                    $pythonCmd = $candidate
                    $installedSuccessfully = $true
                }
            }
        } catch {}

        # Cach 2: Download truc tiep installer chinh thuc tu python.org ve bin/
        if (-not $installedSuccessfully) {
            Write-Host "  [INSTALL] Dang tai truc tiep bo cai Python 3.11 tu python.org..." -ForegroundColor Cyan
            $pyInstallerUrl = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
            $installerPath = Join-Path $BinDir "python-3.11.9-amd64.exe"
            try {
                [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
                Invoke-WebRequest -Uri $pyInstallerUrl -OutFile $installerPath -UseBasicParsing
                Write-Host "  [INSTALL] Dang chay cai dat ngam (Silent Install)..." -ForegroundColor Cyan
                $instProc = Start-Process -FilePath $installerPath -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1 Include_test=0" -Wait -PassThru
                
                $candidate = "$env:LOCALAPPDATA\Programs\Python\Python311\python.exe"
                if (Test-Path $candidate) {
                    $pythonCmd = $candidate
                    $installedSuccessfully = $true
                }
            } catch {
                Write-Host "  [WARN] Khong the tai bo cai python.org: $_" -ForegroundColor Yellow
            }
        }

        if (-not $pythonCmd) {
            $localPy = Get-ChildItem -Path "$env:LOCALAPPDATA\Programs\Python" -Filter "python.exe" -Recurse -Depth 2 -ErrorAction SilentlyContinue
            if ($localPy) { $pythonCmd = $localPy[0].FullName }
        }

        if (-not $pythonCmd) {
            Write-Host "  [ERROR] Khong the tu dong cai dat Python. Vui long kiem tra quyen hoac ket noi Internet." -ForegroundColor Red
            exit 1
        }
        Write-Host "  [SUCCESS] Da cai dat Python thanh cong tai: $pythonCmd!" -ForegroundColor Green
    }

    Write-Host "  [OK] Su dung Python tai: $pythonCmd" -ForegroundColor Cyan

    # Kiem tra va tu dong cai dat cac thu vien pip can thiet cho service.py
    Write-Host "  [DEPS] Kiem tra cac thu vien can thiet cho service.py..." -ForegroundColor Gray
    try {
        & $pythonCmd -c "import fastapi, uvicorn, requests, PIL" 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [AUTO-INSTALL] Dang tu dong cai dat thu vien (fastapi, uvicorn, requests, pillow)..." -ForegroundColor Yellow
            & $pythonCmd -m pip install --quiet --disable-pip-version-check fastapi uvicorn requests pillow python-multipart
            Write-Host "  [OK] Thu vien da duoc cai dat day du!" -ForegroundColor Green
        } else {
            Write-Host "  [OK] Cac thu vien phuc vu service.py da san sang!" -ForegroundColor Green
        }
    } catch {}
    $serviceScript = Join-Path $TtsBotDir "service.py"
    if (-not (Test-Path $serviceScript)) {
        Write-Host "  [ERROR] Khong tim thay service.py tai $serviceScript" -ForegroundColor Red
    } else {
        $serviceLog = Join-Path $RuntimeDir "service.log"
        $serviceErr = Join-Path $RuntimeDir "service_err.log"
        $proc = Start-Process -FilePath $pythonCmd -ArgumentList "service.py" -WorkingDirectory $TtsBotDir -WindowStyle Minimized -RedirectStandardOutput $serviceLog -RedirectStandardError $serviceErr -PassThru
        Write-Host "  [WAIT] Dang cho Backend khoi tao tren port 8787..." -ForegroundColor Gray
        
        $retries = 10
        while ($retries -gt 0) {
            Start-Sleep -Milliseconds 600
            try {
                $checkPort = Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue
                if ($checkPort) {
                    Write-Host "  [OK] Backend (:8787) da khoi dong thanh cong!" -ForegroundColor Green
                    $isBackendRunning = $true
                    break
                }
            } catch {}
            if ($proc.HasExited) {
                Write-Host "  [ERROR] Tien trinh service.py da dung dot ngot voi ma thoat $($proc.ExitCode)!" -ForegroundColor Red
                if (Test-Path $serviceErr) {
                    $errText = Get-Content $serviceErr -Tail 10 -ErrorAction SilentlyContinue
                    if ($errText) { Write-Host "  Chi tiet loi: $errText" -ForegroundColor Red }
                }
                break
            }
            $retries--
        }
        if (-not $isBackendRunning -and -not $proc.HasExited) {
            Write-Host "  [WARN] Backend chua phan hoi port 8787 sau 6 giay. Van tiep tuc khoi chay tunnel..." -ForegroundColor Yellow
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
