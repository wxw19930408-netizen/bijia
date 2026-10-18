@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found in PATH.
  echo Install Node.js 20 or newer, then run this file again.
  pause
  exit /b 1
)
node -e "const net=require('net');const s=net.connect({port:8787,host:'127.0.0.1'});s.on('connect',()=>{s.destroy();process.exit(1)});s.on('error',()=>process.exit(0));setTimeout(()=>process.exit(0),1200)"
if errorlevel 1 (
  start "" "http://127.0.0.1:8787/"
  exit /b 0
)
node server.mjs
if errorlevel 1 (
  echo.
  echo Failed to start. Make sure Node.js is installed and available in PATH.
  pause
)
