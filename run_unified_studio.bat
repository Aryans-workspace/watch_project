@echo off
title Unified Defect Detection Studio
color 0B

echo =====================================================================
echo  ABB Cobot + Mech-Mind Unified Studio
echo  - Calibration Module
echo  - Data Collection Module
echo  - AI Patchcore Module
echo.
echo  Starting on Port 5000 (Web UI) ^& Port 12343 (Cobot RAPID Socket)...
echo =====================================================================

set PYTHON_EXE="%~dp0venv\Scripts\python.exe"

if not exist %PYTHON_EXE% (
    set PYTHON_EXE="C:\Users\MECH MIND\PycharmProjects\sure2coat_v1\.venv1\Scripts\python.exe"
)

if not exist %PYTHON_EXE% (
    set PYTHON_EXE=python
)

cd /d "%~dp0"
set TRUST_REMOTE_CODE=1
%PYTHON_EXE% hub.py

pause
