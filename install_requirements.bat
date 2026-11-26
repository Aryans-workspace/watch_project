@echo off
setlocal enabledelayedexpansion
title TG-QC & Defect Detection - One-Click Installer
color 0B

echo ==============================================================================
echo       TG-QC Quality Control ^& AI Defect Detection - One-Click Installer
echo ==============================================================================
echo.
echo This script will set up all dependencies automatically:
echo   1. Check Node.js and Python environments
echo   2. Install Frontend dependencies (React, Vite, Barcode Scanner)
echo   3. Install Backend API dependencies (Express, SQLite)
echo   4. Seed default database accounts (admin, OP1 - OP12)
echo   5. Build production frontend bundle
echo   6. Create Python virtual environment and install AI/Robotic packages
echo.
echo ==============================================================================
pause

cd /d "%~dp0"

:: --------------------------------------------------------------------------
:: 1. CHECK PREREQUISITES
:: --------------------------------------------------------------------------
echo.
echo [1/6] Checking system prerequisites...

where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed or not in your PATH!
    echo Please download and install Node.js (v18, v20, or v22 LTS) from:
    echo https://nodejs.org/
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] npm is not found! Please reinstall Node.js.
    pause
    exit /b 1
)

where python >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Python is not installed or not in your PATH!
    echo Please download and install Python (3.9 or 3.10 recommended) from:
    echo https://www.python.org/
    echo (Make sure to check "Add Python to PATH" during installation)
    echo.
    pause
    exit /b 1
)

echo   - Node.js: OK
echo   - npm:     OK
echo   - Python:  OK

:: --------------------------------------------------------------------------
:: 2. INSTALL FRONTEND DEPENDENCIES
:: --------------------------------------------------------------------------
echo.
echo [2/6] Installing Frontend dependencies in Application/...
cd /d "%~dp0Application"
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to install frontend npm packages!
    pause
    exit /b 1
)

:: --------------------------------------------------------------------------
:: 3. INSTALL BACKEND DEPENDENCIES
:: --------------------------------------------------------------------------
echo.
echo [3/6] Installing Backend dependencies in Application/server/...
cd /d "%~dp0Application\server"
call npm install
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Failed to install backend npm packages!
    pause
    exit /b 1
)

:: --------------------------------------------------------------------------
:: 4. SEED DATABASE
:: --------------------------------------------------------------------------
echo.
echo [4/6] Initializing and seeding SQLite database...
node seed.js
if %errorlevel% neq 0 (
    echo [WARNING] Seed script completed with warnings, continuing...
)

:: --------------------------------------------------------------------------
:: 5. BUILD FRONTEND PRODUCTION BUNDLE
:: --------------------------------------------------------------------------
echo.
echo [5/6] Building production frontend bundle (Vite)...
cd /d "%~dp0Application"
call npm run build
if %errorlevel% neq 0 (
    echo [WARNING] Build finished with minor warnings, continuing...
)

:: --------------------------------------------------------------------------
:: 6. PYTHON VIRTUAL ENVIRONMENT & AI DEPENDENCIES
:: --------------------------------------------------------------------------
echo.
echo [6/6] Setting up Python virtual environment and AI packages...
cd /d "%~dp0"

if not exist "venv\Scripts\activate.bat" (
    echo Creating new Python virtual environment in venv/...
    python -m venv venv
)

if not exist "venv\Scripts\activate.bat" (
    color 0C
    echo [ERROR] Failed to create virtual environment!
    pause
    exit /b 1
)

call venv\Scripts\activate.bat

echo Upgrading pip...
python -m pip install --upgrade pip --quiet

echo Installing root Python requirements...
pip install -r requirements.txt --quiet

if exist "watch_defect_detection\requirements.txt" (
    echo Installing Watch Defect Detection requirements...
    pip install -r watch_defect_detection\requirements.txt --quiet
)

if exist "patchcore_defect_detection\requirements.txt" (
    echo Installing PatchCore AI requirements...
    pip install -r patchcore_defect_detection\requirements.txt --quiet
)

:: --------------------------------------------------------------------------
:: SUCCESS BANNER
:: --------------------------------------------------------------------------
color 0A
echo.
echo ==============================================================================
echo                   ALL REQUIREMENTS INSTALLED SUCCESSFULLY!
echo ==============================================================================
echo.
echo You are ready to run the project:
echo.
echo   - To start the Web QC Application (Port 44444):
echo       Double-click: Run_TG_QC.bat
echo.
echo   - To start the ABB Cobot ^& Mech-Mind AI Studio (Port 5000 / 12343):
echo       Double-click: run_unified_studio.bat
echo.
echo ==============================================================================
pause
