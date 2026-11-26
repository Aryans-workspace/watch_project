@echo off
TITLE TG-QC Application
echo ====================================
echo Starting TG-QC Application...
echo ====================================

cd /d "%~dp0Application"

echo Building frontend for production...
call npm run build

echo Starting backend server...
cd server

echo Opening application in default browser...
start http://localhost:44444

echo Starting Node.js server...
node server.js

pause
