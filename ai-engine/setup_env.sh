#!/bin/bash
# =============================================================================
# Nephro-AI Environment Setup Script (Linux/macOS)
# Run this script when cloning/pulling the repository
# =============================================================================

echo "🚀 Nephro-AI Environment Setup"
echo "================================"

# Check Python version
PYTHON_VERSION=$(python3 --version 2>&1)
echo "📌 Detected: $PYTHON_VERSION"

# Create virtual environment if not exists
if [ ! -d ".venv" ]; then
    echo -e "\n📦 Creating virtual environment..."
    python3 -m venv .venv
else
    echo -e "\n✅ Virtual environment already exists"
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source .venv/bin/activate

# Upgrade pip
echo -e "\n⬆️ Upgrading pip..."
python -m pip install --upgrade pip

# Install from locked requirements (exact versions)
if [ -f "requirements-lock.txt" ]; then
    echo -e "\n📥 Installing locked dependencies (exact versions)..."
    pip install -r requirements-lock.txt
else
    echo -e "\n📥 Installing from requirements.txt..."
    pip install -r requirements.txt
    
    # Generate lock file for future use
    echo -e "\n🔒 Generating requirements-lock.txt..."
    pip freeze > requirements-lock.txt
    echo "✅ Lock file created! Commit this to Git."
fi

# Install spaCy model
echo -e "\n🧠 Installing spaCy language model..."
python -m spacy download en_core_web_sm

# Install scispacy medical model
echo -e "\n🏥 Installing medical NER model..."
pip install https://s3-us-west-2.amazonaws.com/ai2-s2-scispacy/releases/v0.5.4/en_ner_bc5cdr_md-0.5.4.tar.gz

echo -e "\n✅ Setup Complete!"
echo "================================"
echo "To activate environment: source .venv/bin/activate"
echo "To run server: python server.py"
