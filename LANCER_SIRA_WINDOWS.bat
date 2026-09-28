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
  echo Installation des outils SIRA...
  call npm install
  if errorlevel 1 (
    echo [ERREUR] L'installation a echoue. Verifie ta connexion Internet.
    pause
    exit /b 1
  )
)

if not exist mobile
ode_modules (
  echo Installation de l'application mobile, une seule fois, quelques minutes...
  call npm --prefix mobile install
  if errorlevel 1 (
    echo [ERREUR] L'installation de l'application a echoue. Verifie ta connexion Internet.
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
echo Demarrage de SIRA : SIRA-MORE, comptes, assistant vocal, API et application mobile.
echo Application : http://localhost:8081  -  sur telephone : scanne le QR code avec Expo Go (meme Wi-Fi).
echo Le premier lancement installe aussi les dependances de l'API et de SIRA-MORE.
echo Pour arreter tous les services, appuie sur Ctrl+C.
echo.
call npm run dev:stack

if errorlevel 1 (
  echo.
  echo [ERREUR] Le serveur SIRA s'est arrete avec une erreur.
  pause
)

endlocal
