@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT=%~dp0"

if not exist "%ROOT%package.json" (
  echo [DERO] package.json was not found.
  echo [DERO] Run this file from the lighthouse project root.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [DERO] Node.js was not found in PATH.
  echo [DERO] Install Node.js, then run this launcher again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [DERO] npm.cmd was not found in PATH.
  echo [DERO] Install Node.js/npm, then run this launcher again.
  pause
  exit /b 1
)

cd /d "%ROOT%"

if not exist "%ROOT%node_modules" (
  echo [DERO] Installing dependencies. This is only needed the first time.
  npm.cmd install
  if errorlevel 1 (
    echo [DERO] npm install failed.
    pause
    exit /b 1
  )
)

set "PORT="
for /l %%P in (3000,1,3010) do (
  netstat -ano | findstr /R /C:":%%P .*LISTENING" >nul
  if errorlevel 1 (
    set "PORT=%%P"
    goto port_found
  )
)

echo [DERO] No free port found in range 3000-3010.
pause
exit /b 1

:port_found
set "URL=http://127.0.0.1:%PORT%"
echo [DERO] Starting Lighting Manifest Builder on %URL%
echo [DERO] Keep this window open while using the builder.
echo [DERO] Press Ctrl+C in this window to stop the dev server.
echo.

start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 5; Start-Process '%URL%'"
npm.cmd run dev -- --host 127.0.0.1 --port %PORT%

echo.
echo [DERO] Dev server stopped.
pause
