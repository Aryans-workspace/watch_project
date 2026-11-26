@echo off
title Mech-Eye Calibration Program
echo ===================================================================
echo             Mech-Eye Web-Based Calibration Program
echo                      AI Defect Detection
echo ===================================================================
echo.
echo Launching Web Server on http://localhost:5000 ...
echo.

cd /d "%~dp0"

:: Open default browser automatically in 2 seconds
start "" powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:5000'"

:: Execute Flask app using Python virtual environment
set PYTHON_EXE="%~dp0venv\Scripts\python.exe"
if not exist %PYTHON_EXE% (
    set PYTHON_EXE="C:\Users\MECH MIND\PycharmProjects\sure2coat_v1\.venv1\Scripts\python.exe"
)
if not exist %PYTHON_EXE% (
    set PYTHON_EXE=python
)
%PYTHON_EXE% app.py

pause
