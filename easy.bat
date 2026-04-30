@echo off
REM ============================================================
REM   Adventure Stories - one-click launcher (Windows)
REM ============================================================
REM   Double-click this file to start the game.
REM   - Opens the AI server (llama-server, port 8090)
REM   - Opens the web server (port 8000+)
REM   - Opens your browser to the game
REM   - Prints a phone-friendly URL if you're on Wi-Fi
REM ============================================================

REM Always run from the script's own folder, even if you double-clicked
REM from a shortcut elsewhere.
cd /d "%~dp0"

title Adventure Stories Launcher
echo.
echo  Adventure Stories - launching...
echo  Project folder: %CD%
echo.

REM Prefer the Python Launcher (py) when present; fall back to python.
where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    py start_game.py
) else (
    where python >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        python start_game.py
    ) else (
        echo ERROR: Python is not installed or not on PATH.
        echo.
        echo Install Python 3.10+ from https://www.python.org/downloads/
        echo Make sure to check "Add Python to PATH" during install.
        echo.
        pause
        exit /b 1
    )
)

REM Keep the window open if the game exited (so you can read any error).
echo.
echo Game launcher exited. Press any key to close this window.
pause >nul
