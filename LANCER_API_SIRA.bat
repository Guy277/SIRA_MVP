@echo off
title SIRA - Services (API 4000, SIRA-MORE, comptes, voix)
cd /d "%~dp0"
set SIRA_MOBILE=false
set CORS_ORIGIN=http://localhost:8081,http://localhost:8082,http://localhost:8080
echo Demarrage des services SIRA (API port 4000) sans relancer Expo...
call npm run dev:stack
echo.
echo [SIRA] Services arretes.
pause
