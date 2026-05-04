@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0REBUILD_NOW.ps1"
echo.
echo ============================================================
echo Rebuild script finished. Press any key to close.
echo ============================================================
pause >nul
