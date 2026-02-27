#!/usr/bin/env bash
# =============================================================================
# setup_chatbot.sh — Creates and bootstraps the Nephro-AI chatbot venv (macOS/Linux)
# Usage:  bash setup_chatbot.sh [--dev]
# =============================================================================
set -euo pipefail

VENV_DIR="$(dirname "$0")/.venv"
PYTHON_VERSION_FILE="$(dirname "$0")/.python-version"
REQ_DIR="$(dirname "$0")/requirements"

# ── Detect target (api vs dev) ────────────────────────────────────────────────
TARGET="api"
if [[ "${1:-}" == "--dev" ]]; then
  TARGET="dev"
fi

echo "=============================================="
echo "  Nephro-AI Chatbot — Environment Setup"
echo "  Target layer : $TARGET"
echo "  Venv path    : $VENV_DIR"
echo "=============================================="

# ── Preferred Python version ──────────────────────────────────────────────────
REQUIRED_PYTHON="3.12"
PYTHON_BIN=$(command -v python3 || command -v python)

if [[ -f "$PYTHON_VERSION_FILE" ]]; then
  REQUIRED_PYTHON=$(cat "$PYTHON_VERSION_FILE" | tr -d '[:space:]')
fi

echo "[1/4] Checking Python ($REQUIRED_PYTHON)..."
ACTUAL_VERSION=$("$PYTHON_BIN" -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "      Found Python $ACTUAL_VERSION"

# ── Create venv ───────────────────────────────────────────────────────────────
echo "[2/4] Creating virtual environment at $VENV_DIR..."
if [[ ! -d "$VENV_DIR" ]]; then
  "$PYTHON_BIN" -m venv "$VENV_DIR" --prompt "nephro-ai-chatbot"
  echo "      Created."
else
  echo "      Already exists — skipping creation."
fi

# ── Activate ──────────────────────────────────────────────────────────────────
echo "[3/4] Activating venv..."
# shellcheck source=/dev/null
source "$VENV_DIR/bin/activate"

# ── Upgrade bootstrap tools ───────────────────────────────────────────────────
echo "      Upgrading pip / setuptools / wheel..."
pip install --quiet --upgrade pip setuptools wheel

# ── Install dependencies ──────────────────────────────────────────────────────
echo "[4/4] Installing requirements/$TARGET.txt..."
pip install -r "$REQ_DIR/$TARGET.txt"

# ── Post-install: spaCy model ─────────────────────────────────────────────────
echo ""
echo "Post-install: downloading spaCy 'en_core_web_sm' model..."
python -m spacy download en_core_web_sm --quiet

echo ""
echo "=============================================="
echo "  Setup complete!"
echo "  Activate with:"
echo "    source .venv/bin/activate"
echo "=============================================="
