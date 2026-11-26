@echo off
title Phone Camera AI Defect Detection Studio
color 0B

echo =====================================================================
echo  Phone Camera AI Defect Detection Orchestrator
echo  - Hardware: Smartphone High-Resolution Optical Camera
echo  - AI Inspection: Dust and Scratch Detection on Coloured Images
echo.
echo  Starting on Port 5005 (Web UI ^& Mobile Companion)...
echo =====================================================================

set PYTHON_EXE="C:\Users\MECH MIND\PycharmProjects\sure2coat_v1\.venv1\Scripts\python.exe"

if not exist %PYTHON_EXE% (
    set PYTHON_EXE=python
)

cd /d "%~dp0"
set PORT=5005
%PYTHON_EXE% app.py

pause
