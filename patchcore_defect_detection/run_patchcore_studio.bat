@echo off
title ABB Cobot + Mech-Mind PatchCore Defect Detection Studio
color 0B

echo =====================================================================
echo  ABB Cobot + Mech-Mind PatchCore Defect Detection Studio
echo  Starting on Port 5002 (Web UI) ^& Port 12343 (Cobot RAPID Socket)...
echo =====================================================================

set PYTHON_EXE="C:\Users\MECH MIND\PycharmProjects\sure2coat_v1\.venv1\Scripts\python.exe"

if not exist %PYTHON_EXE% (
    echo [ERROR] Virtual environment python.exe not found!
    pause
    exit /b 1
)

cd /d "%~dp0"
set TRUST_REMOTE_CODE=1
set PORT=5002
%PYTHON_EXE% app.py

pause
