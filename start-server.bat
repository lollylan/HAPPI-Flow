@echo off
setlocal
title HAEPPI-Flow Server
rem UTF-8 im Fenster, sonst kommen die Umlaute der Servermeldungen verstuemmelt an.
chcp 65001 >nul
cd /d "%~dp0"

rem ------------------------------------------------------------------
rem  HAEPPI-Flow lokal starten und im Browser oeffnen.
rem
rem    start-server.bat        Praxisdaten  (%%APPDATA%%\HAEPPI-Flow\haeppi.db)
rem    start-server.bat reset  setzt das Passwort der Praxisleitung zurueck und
rem                            zeigt die neuen Zugangsdaten hier im Fenster
rem    start-server.bat dev    Testdaten    (%%APPDATA%%\HAEPPI-Flow\dev\haeppi.db)
rem                            mit Beispielteam; beim ersten Aufruf fuehrt die
rem                            Oberflaeche durch die Einrichtung des Zugangs.
rem
rem  Andere Rechner im Praxisnetz erreichen den Server unter
rem  http://<IP dieses Rechners>:4173 - die Adresse steht unten im Fenster.
rem  Fenster schliessen oder Strg+C beendet den Server.
rem ------------------------------------------------------------------

set "PORT=4173"
set "MODE="
set "RESET="
for %%a in (%*) do (
  if /i "%%~a"=="dev" set "MODE=dev"
  if /i "%%~a"=="reset" set "RESET=1"
)

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte Node.js 20 oder neuer installieren.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo Abhaengigkeiten werden installiert ...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist "apps\server\dist\index.js" goto build
if not exist "apps\client\dist\index.html" goto build
goto run

:build
echo Anwendung wird gebaut, das dauert beim ersten Mal etwa eine Minute ...
call npm run build
if errorlevel 1 (
  echo Der Build ist fehlgeschlagen.
  pause
  exit /b 1
)

:run
if /i "%MODE%"=="dev" (
  echo Modus: Testdaten
  echo Beispielteam wird angelegt, falls die Testdatenbank noch leer ist ...
  call npx tsx apps\server\scripts\seed-dev-team.ts
) else (
  set "NODE_ENV=production"
  echo Modus: Praxisdaten
)
set "HAEPPI_PORT=%PORT%"
if "%RESET%"=="1" (
  set "HAEPPI_RESET_ACCESS=1"
  echo Der Zugang der Praxisleitung wird zurueckgesetzt - die neuen Zugangsdaten
  echo erscheinen gleich in diesem Fenster.
)

rem Browser oeffnen, sobald der Server antwortet - im Hintergrund.
start "" /b powershell -NoProfile -Command ^
  "for ($i = 0; $i -lt 60; $i++) { try { Invoke-WebRequest -UseBasicParsing 'http://localhost:%PORT%/api/health' -TimeoutSec 1 | Out-Null; Start-Process 'http://localhost:%PORT%'; exit } catch { Start-Sleep -Milliseconds 500 } }"

echo.
echo HAEPPI-Flow startet auf http://localhost:%PORT%
echo Dieses Fenster offen lassen. Beenden mit Strg+C oder Fenster schliessen.
echo.
node apps\server\dist\index.js
