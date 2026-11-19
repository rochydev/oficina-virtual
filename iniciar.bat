@echo off
title Oficina Virtual
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas tener instalado Node.js: https://nodejs.org
  pause
  exit /b 1
)
node server.js --abrir
pause
