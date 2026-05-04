@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0GIT_FIX.ps1"
echo.
echo ============================================================
echo Git fix script finished. Press any key to close.
echo ============================================================
pause >nul
