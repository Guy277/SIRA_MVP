@echo off
setlocal
title SIRA Mobility MVP

where node >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] Node.js n'est pas installe.
  echo Installe Node.js 22 LTS depuis https://nodejs.org/ puis relance ce fichier.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERREUR] npm est introuvable. Reinstalle Node.js 22 LTS.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installation des dependances SIRA...
  call npm install
  if errorlevel 1 (
    echo [ERREUR] L'installation a echoue. Verifie ta connexion Internet.
    pause
    exit /b 1
  )
)

echo.
echo SIRA sera disponible sur http://localhost:3000
echo Pour arreter le serveur, appuie sur Ctrl+C.
echo.
call npm run dev

if errorlevel 1 (
  echo.
  echo [ERREUR] Le serveur SIRA s'est arrete avec une erreur.
  pause
)

endlocal
