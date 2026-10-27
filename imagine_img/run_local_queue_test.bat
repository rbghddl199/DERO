@echo off
rem ============================================================================
rem  One-click local queue test.  ASCII only on purpose: .bat is read in the
rem  console ANSI codepage (cp949 here), so Korean text turns into mojibake.
rem ============================================================================
rem
rem  What it does
rem    1. serves inputs/captures/test7 over http://127.0.0.1:877
rem    2. starts the worker on an ISOLATED queue key, results stay local
rem    3. pushes one job that points at the served capture
rem    4. leaves the images in outputs/queue-local/<correlationId>/
rem
rem  Why an isolated queue key
rem    LOCAL_ONLY_RESULTS never uploads.  A worker like that must not consume the
rem    shared queue: it would swallow a real user request and answer nothing, so
rem    that request fails on the backend's 5 minute timeout.  The worker refuses
rem    to start on the shared key -- see app/queue/runner.py.
rem
rem  Nothing is uploaded and no DB is touched.
rem ============================================================================

setlocal
cd /d "%~dp0"

set PY=.venv\Scripts\python.exe
set PORT=877
set REDIS_REQUEST_KEY=image:generate:requests:local-test
set LOCAL_ONLY_RESULTS=true
set PYTHONIOENCODING=utf-8

if not exist "%PY%" (
  echo [error] %PY% not found. Run from the imagine_img folder.
  exit /b 1
)

echo [1/4] serving captures on http://127.0.0.1:%PORT%
start "capture-server" /min "%PY%" -m http.server %PORT% --bind 127.0.0.1 --directory inputs\captures\test7

echo [2/4] starting worker  queue=%REDIS_REQUEST_KEY%  local-only=%LOCAL_ONLY_RESULTS%
start "queue-worker" "%PY%" -m app.cli worker

echo       waiting for the model to load (first run takes minutes)...
timeout /t 45 /nobreak >nul

echo [3/4] pushing one job
"%PY%" scripts\queue_smoke.py --push --i-know-this-is-not-production ^
  --screenshot-url "http://127.0.0.1:%PORT%/render-glb-crop.png" ^
  --count 1 --wait 600

echo [4/4] done. results:
dir /b outputs\queue-local 2>nul

echo.
echo Close the "queue-worker" and "capture-server" windows when finished.
endlocal
