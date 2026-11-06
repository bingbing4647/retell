@echo off
title dora-retell preview (port 3120)
set "PYTHONPATH="
cd /d "%~dp0.."

rem Serve the frozen snapshot (dist-site) when it exists, so a concurrent
rem "npm run build" in another window cannot wipe the folder being served.
set "SERVE_DIR=out"
if exist "dist-site\index.html" set "SERVE_DIR=dist-site"

if not exist "%SERVE_DIR%\index.html" (
  echo [ERROR] neither dist-site\ nor out\ has index.html
  echo         run "npm run build" first
  pause
  exit /b 1
)

echo Serving: %SERVE_DIR%
echo Open:    http://127.0.0.1:3120/
echo Close this window to stop.
"C:\Users\Administrator\AppData\Local\Programs\Python\Python312\python.exe" -m http.server 3120 -d "%SERVE_DIR%" --bind 127.0.0.1
