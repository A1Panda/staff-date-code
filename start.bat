@echo off
setlocal

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  pause
  exit /b 1
)

echo Starting personnel date encoder server...
echo Browser will open in a moment.
echo Keep this window open while the server is running.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:3100'"

node ".\scripts\server.js"

echo.
echo Server stopped.
pause
