@echo off
setlocal
cd /d "%~dp0"
title agent-go Behavior Lab - 5175
if not exist "node_modules\concurrently\dist\bin\index.js" (
  echo Dependencies are missing. Run npm ci in this folder first.
  pause
  exit /b 1
)
set "PORT=8790"
set "HOST=127.0.0.1"
echo Starting Behavior Lab from:
cd
echo Lab URL: http://127.0.0.1:5175/
echo This port always opens the Behavior Lab, including after refresh.
echo Keep this window open. Ctrl+C stops both lab services.
node node_modules\concurrently\dist\bin\index.js -k -n lab,api "node node_modules/vite/bin/vite.js --config vite.lab.config.ts --mode behavior-lab --open /lab.html" "node --import tsx server/index.ts"
pause
endlocal
