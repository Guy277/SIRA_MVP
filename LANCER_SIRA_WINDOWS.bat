@echo off
setlocal
title SIRA Mobility MVP - Stack complete

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

where python >nul 2>nul
if errorlevel 1 (
  where py >nul 2>nul
  if errorlevel 1 (
    echo [ERREUR] Python 3 est requis pour le moteur SIRA-MORE.
    echo Installe Python 3 depuis https://www.python.org/downloads/ puis relance ce fichier.
    pause
    exit /b 1
  )
)

echo.
echo Demarrage de la stack SIRA complete : interface, API NestJS et moteur SIRA-MORE.
echo SIRA sera disponible sur http://localhost:3001
echo Le premier lancement installe aussi les dependances de l'API et du moteur IA.
echo Pour arreter tous les services, appuie sur Ctrl+C.
echo.
set PORT=3001
call npm run dev:stack

if errorlevel 1 (
  echo.
  echo [ERREUR] Le serveur SIRA s'est arrete avec une erreur.
  pause
)

endlocal
