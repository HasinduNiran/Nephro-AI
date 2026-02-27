# =============================================================================
# setup_chatbot.ps1 — Creates and bootstraps the Nephro-AI chatbot venv (Windows)
# Usage:  .\setup_chatbot.ps1 [-Dev]
# =============================================================================
[CmdletBinding()]
param(
    [switch]$Dev   # Install dev layer (tests, linting, notebooks)
)

$ErrorActionPreference = "Stop"

$RootDir   = $PSScriptRoot
$VenvDir   = Join-Path $RootDir ".venv"
$ReqDir    = Join-Path $RootDir "requirements"
$PyVersion = Join-Path $RootDir ".python-version"

$Target = if ($Dev) { "dev" } else { "api" }

Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "  Nephro-AI Chatbot - Environment Setup"       -ForegroundColor Cyan
Write-Host "  Target layer : $Target"
Write-Host "  Venv path    : $VenvDir"
Write-Host "==============================================" -ForegroundColor Cyan

# ── Locate Python ─────────────────────────────────────────────────────────────
$PythonBin = (Get-Command python -ErrorAction SilentlyContinue)?.Source
if (-not $PythonBin) {
    $PythonBin = (Get-Command python3 -ErrorAction SilentlyContinue)?.Source
}
if (-not $PythonBin) { throw "Python not found. Install Python 3.12+ and add it to PATH." }

$ActualVersion = & $PythonBin -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')"
Write-Host "[1/4] Python $ActualVersion found at $PythonBin"

# ── Create venv ───────────────────────────────────────────────────────────────
Write-Host "[2/4] Creating virtual environment..."
if (-not (Test-Path $VenvDir)) {
    & $PythonBin -m venv $VenvDir --prompt "nephro-ai-chatbot"
    Write-Host "      Created at $VenvDir"
} else {
    Write-Host "      Already exists - skipping creation."
}

# ── Activate ──────────────────────────────────────────────────────────────────
Write-Host "[3/4] Activating venv..."
$ActivateScript = Join-Path $VenvDir "Scripts\Activate.ps1"
if (-not (Test-Path $ActivateScript)) { throw "Activation script not found: $ActivateScript" }
& $ActivateScript

# ── Upgrade bootstrap tools ───────────────────────────────────────────────────
Write-Host "      Upgrading pip / setuptools / wheel..."
& (Join-Path $VenvDir "Scripts\python.exe") -m pip install --quiet --upgrade pip setuptools wheel

# ── Install dependencies ──────────────────────────────────────────────────────
$ReqFile = Join-Path $ReqDir "$Target.txt"
Write-Host "[4/4] Installing $ReqFile..."
& (Join-Path $VenvDir "Scripts\pip.exe") install -r $ReqFile

# ── Post-install: spaCy model ─────────────────────────────────────────────────
Write-Host ""
Write-Host "Post-install: downloading spaCy 'en_core_web_sm' model..."
& (Join-Path $VenvDir "Scripts\python.exe") -m spacy download en_core_web_sm --quiet

Write-Host ""
Write-Host "==============================================" -ForegroundColor Green
Write-Host "  Setup complete!"                              -ForegroundColor Green
Write-Host "  Activate with:"
Write-Host "    .\.venv\Scripts\Activate.ps1"
Write-Host "==============================================" -ForegroundColor Green
