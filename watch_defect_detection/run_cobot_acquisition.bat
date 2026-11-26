@echo off
title ABB Cobot & Mech-Mind Watch Inspection
echo ===================================================================
echo        ABB Cobot & Mech-Mind Watch Dataset Acquisition
echo                     PatchCore Inspection Studio
echo ===================================================================
echo.
echo Launching Web Server on http://localhost:5001 ...
echo Listening for ABB Cobot RAPID on port 12343 ...
echo.

cd /d "%~dp0"

:: Open default browser automatically in 2 seconds
start "" powershell -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:5001'"

:: Execute Flask app using Python virtual environment with Mech-Eye SDK
"C:\Users\MECH MIND\PycharmProjects\sure2coat_v1\.venv1\Scripts\python.exe" app.py

pause
