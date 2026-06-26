@echo off
title JENNY Server
cd /d "%~dp0"
echo ============================================
echo   JENNY wird gestartet...
echo   Browser oeffnet sich gleich automatisch.
echo   Dieses Fenster bitte OFFEN lassen.
echo   Zum Beenden: dieses Fenster schliessen.
echo ============================================
echo.

REM Browser nach kurzer Verzoegerung oeffnen
start "" cmd /c "timeout /t 2 >nul & start http://localhost:8080"

REM Server starten (probiert py, dann python)
py -m http.server 8080
if %errorlevel% neq 0 python -m http.server 8080

echo.
echo Konnte den Server nicht starten. Ist Python installiert?
echo Hole es von https://www.python.org/downloads/ und
echo aktiviere beim Setup "Add Python to PATH".
pause
