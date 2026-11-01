@echo off
setlocal
cd /d "%~dp0"
title agent-go latest - 5174
if not exist "node_modules\concurrently\dist\bin\index.js" (
  echo Dependencies are missing. Run npm ci in this folder first.
  pause
  exit /b 1
)
set "PORT=8788"
set "HOST=127.0.0.1"
echo Starting agent-go from:
cd
echo Latest page: http://127.0.0.1:5174
echo Keep this window open. Press Ctrl+C to stop both services.
node node_modules\concurrently\dist\bin\index.js -k -n web,api "node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort --open" "node --import tsx server/index.ts"
pause
endlocal
