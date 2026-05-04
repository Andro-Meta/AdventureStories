@echo off
REM Launches SHIP_IT.ps1 with execution policy bypass so PowerShell will actually run it.
REM Double-click this .bat file from File Explorer.
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0SHIP_IT.ps1"
echo.
echo ============================================================
echo Build script finished. Press any key to close this window.
echo ============================================================
pause >nul
