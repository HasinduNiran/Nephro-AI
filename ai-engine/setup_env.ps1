# =============================================================================
# Nephro-AI Environment Setup Script (Windows PowerShell)
# Run this script when cloning/pulling the repository
# =============================================================================

Write-Host "🚀 Nephro-AI Environment Setup" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Check Python version
$pythonVersion = python --version 2>&1
Write-Host "📌 Detected: $pythonVersion" -ForegroundColor Yellow

# Verify Python 3.10+ (recommended for ML dependencies)
$versionMatch = $pythonVersion -match "Python 3\.(\d+)"
if ($matches[1] -lt 10) {
    Write-Host "⚠️ Warning: Python 3.10+ recommended. You have $pythonVersion" -ForegroundColor Red
}

# Create virtual environment if not exists
if (-not (Test-Path ".venv")) {
    Write-Host "`n📦 Creating virtual environment..." -ForegroundColor Green
    python -m venv .venv
} else {
    Write-Host "`n✅ Virtual environment already exists" -ForegroundColor Green
}

# Activate virtual environment
Write-Host "🔄 Activating virtual environment..." -ForegroundColor Green
& ".\.venv\Scripts\Activate.ps1"

# Upgrade pip
Write-Host "`n⬆️ Upgrading pip..." -ForegroundColor Green
python -m pip install --upgrade pip

# Install from locked requirements (exact versions)
if (Test-Path "requirements-lock.txt") {
    Write-Host "`n📥 Installing locked dependencies (exact versions)..." -ForegroundColor Green
    pip install -r requirements-lock.txt
} else {
    Write-Host "`n📥 Installing from requirements.txt..." -ForegroundColor Yellow
    pip install -r requirements.txt
    
    # Generate lock file for future use
    Write-Host "`n🔒 Generating requirements-lock.txt..." -ForegroundColor Green
    pip freeze > requirements-lock.txt
    Write-Host "✅ Lock file created! Commit this to Git." -ForegroundColor Cyan
}

# Install spaCy model
Write-Host "`n🧠 Installing spaCy language model..." -ForegroundColor Green
python -m spacy download en_core_web_sm

# Install scispacy medical model (if needed)
Write-Host "`n🏥 Installing medical NER model..." -ForegroundColor Green
pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_ner_bc5cdr_md-0.5.4.tar.gz

# Verify installation
Write-Host "`n✅ Setup Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan
Write-Host "To activate environment: .\.venv\Scripts\Activate.ps1" -ForegroundColor Yellow
Write-Host "To run server: python server.py" -ForegroundColor Yellow
