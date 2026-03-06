# ── Resolve repo root (folder this script lives in) ─────────────────────────
$ROOT = Split-Path -Parent $MyInvocation.MyCommand.Definition

# ── Auto-detect adb ──────────────────────────────────────────────────────────
$ADB = Get-Command adb -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
if (-not $ADB) {
    # Search common Android SDK locations under every user profile
    $candidates = @(
        "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe",
        "$env:USERPROFILE\AppData\Local\Android\Sdk\platform-tools\adb.exe",
        "C:\Android\Sdk\platform-tools\adb.exe",
        "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk\platform-tools\adb.exe"
    )
    foreach ($c in $candidates) {
        if (Test-Path $c) { $ADB = $c; break }
    }
}
if (-not $ADB) {
    Write-Host "[ERROR] adb not found. Add Android SDK platform-tools to PATH or install Android Studio." -ForegroundColor Red
    exit 1
}
Write-Host "Using adb: $ADB" -ForegroundColor DarkGray

# ── Step 1: Fix axiosConfig IP to 127.0.0.1 (works with adb reverse) ────────
Write-Host "`n[1/5] Patching axiosConfig.js to use 127.0.0.1..." -ForegroundColor Cyan
$axiosFile = Join-Path $ROOT "mobile-app\src\api\axiosConfig.js"
$axiosContent = Get-Content $axiosFile -Raw
$axiosContent = $axiosContent -replace 'const API_IP = "[^"]+";', 'const API_IP = "127.0.0.1";'
Set-Content $axiosFile $axiosContent -NoNewline
Write-Host "axiosConfig.js patched." -ForegroundColor Green

# ── Step 2: adb reverse ───────────────────────────────────────────────────────
Write-Host "`n[2/5] Running adb reverse..." -ForegroundColor Cyan
& $ADB reverse tcp:5000 tcp:5000
& $ADB reverse tcp:8001 tcp:8001
Write-Host "adb reverse done." -ForegroundColor Green

# ── Step 3: Start FastAPI inference service ───────────────────────────────────
Write-Host "`n[3/5] Starting FastAPI inference on port 8001..." -ForegroundColor Cyan
$aiEnginePath = Join-Path $ROOT "ai-engine"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$aiEnginePath'; python -m uvicorn src.ckd_stage.inference_api:app --host 127.0.0.1 --port 8001" -WindowStyle Normal

# Wait for FastAPI health endpoint so backend won't hit ECONNREFUSED
$fastApiReady = $false
for ($i = 0; $i -lt 20; $i++) {
    try {
        $health = Invoke-WebRequest -UseBasicParsing "http://127.0.0.1:8001/health" -TimeoutSec 2
        if ($health.StatusCode -eq 200) {
            $fastApiReady = $true
            break
        }
    } catch {
        Start-Sleep -Milliseconds 750
    }
}

if ($fastApiReady) {
    Write-Host "FastAPI started and healthy." -ForegroundColor Green
} else {
    Write-Host "[WARN] FastAPI did not become healthy in time. Backend will fall back to spawn." -ForegroundColor Yellow
}

# ── Step 4: Start backend ─────────────────────────────────────────────────────
Write-Host "`n[4/5] Starting backend on port 5000..." -ForegroundColor Cyan
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1
$backendPath = Join-Path $ROOT "backend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$backendPath'; node server.js" -WindowStyle Normal
Start-Sleep -Seconds 3
Write-Host "Backend started." -ForegroundColor Green

# ── Step 5: Launch app ────────────────────────────────────────────────────────
Write-Host "`n[5/5] Launching Expo app on Android..." -ForegroundColor Cyan
Set-Location (Join-Path $ROOT "mobile-app")
npx expo run:android
