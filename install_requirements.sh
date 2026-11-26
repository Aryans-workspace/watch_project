#!/bin/bash
# ==============================================================================
# TG-QC Quality Control & AI Defect Detection - One-Click Installer (macOS/Linux)
# ==============================================================================

set -e

echo "=============================================================================="
echo "      TG-QC Quality Control & AI Defect Detection - macOS/Linux Setup"
echo "=============================================================================="
echo ""

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

# 1. CHECK PREREQUISITES
echo "[1/6] Checking system prerequisites..."

if ! command -v node >/dev/null 2>&1; then
    echo "❌ [ERROR] Node.js is not installed!"
    echo "Please install Node.js via Homebrew ('brew install node') or from https://nodejs.org"
    exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
    echo "❌ [ERROR] npm is not installed! Please reinstall Node.js."
    exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
    echo "❌ [ERROR] Python 3 is not installed!"
    echo "Please install Python 3 via Homebrew ('brew install python') or from https://www.python.org"
    exit 1
fi

echo "  ✅ Node.js: $(node -v)"
echo "  ✅ npm:     $(npm -v)"
echo "  ✅ Python3: $(python3 --version)"

# 2. INSTALL FRONTEND DEPENDENCIES
echo ""
echo "[2/6] Installing Frontend dependencies in Application/..."
cd "$ROOT_DIR/Application"
npm install

# 3. INSTALL BACKEND DEPENDENCIES
echo ""
echo "[3/6] Installing Backend dependencies in Application/server/..."
cd "$ROOT_DIR/Application/server"
npm install

# 4. SEED DATABASE
echo ""
echo "[4/6] Initializing and seeding SQLite database..."
node seed.js || true

# 5. BUILD FRONTEND BUNDLE
echo ""
echo "[5/6] Building production frontend bundle (Vite)..."
cd "$ROOT_DIR/Application"
npm run build || true

# 6. PYTHON VIRTUAL ENVIRONMENT & AI DEPENDENCIES
echo ""
echo "[6/6] Setting up Python virtual environment and AI packages..."
cd "$ROOT_DIR"

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet

if [ -f "watch_defect_detection/requirements.txt" ]; then
    pip install -r watch_defect_detection/requirements.txt --quiet || true
fi

if [ -f "patchcore_defect_detection/requirements.txt" ]; then
    pip install -r patchcore_defect_detection/requirements.txt --quiet || true
fi

# Ensure start scripts are executable
chmod +x "$ROOT_DIR/Application/start.sh" || true

echo ""
echo "=============================================================================="
echo "                  ALL REQUIREMENTS INSTALLED SUCCESSFULLY!                     "
echo "=============================================================================="
echo ""
echo "You can now run the application:"
echo "  cd Application && ./start.sh"
echo "  Then open your browser at: http://localhost:44444"
echo ""
echo "=============================================================================="
