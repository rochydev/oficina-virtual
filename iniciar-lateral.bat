@echo off
rem Abre la oficina como una ventana estrecha, pensada para dejarla pegada a un lado de la pantalla.
title Oficina Virtual
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas tener instalado Node.js: https://nodejs.org
  pause
  exit /b 1
)
node server.js --lateral
pause
