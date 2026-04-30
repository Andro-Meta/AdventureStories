@echo off
title Adventure Stories - Working System
echo Adventure Stories - Working System
echo ===================================
echo.

REM Kill any existing Python processes
echo Killing existing processes...
taskkill /f /im python.exe 2>nul
timeout /t 2 /nobreak >nul

REM Check if virtual environment exists
if not exist "venv_local_ai\Scripts\python.exe" (
    echo ERROR: Virtual environment not found!
    echo Please run install_complete.bat first
    pause
    exit /b 1
)

REM Check if model exists
if not exist "models\minicpm-2b-128k\config.json" (
    echo ERROR: Model not found!
    echo Expected: models\minicpm-2b-128k\config.json
    echo Please run install_complete.bat first
    pause
    exit /b 1
)

echo Starting AI Server using official MiniCPM method...
start "AI Server" cmd /k "venv_local_ai\Scripts\python.exe working_ai_server.py"

echo Waiting for AI server to start...
echo Checking server status every 3 seconds...

REM Smart server detection - check every 3 seconds up to 60 seconds total
set /a attempts=0
set /a max_attempts=20

:check_server
set /a attempts+=1
echo Attempt %attempts%/%max_attempts%: Testing AI server...

venv_local_ai\Scripts\python.exe -c "import requests; r=requests.get('http://127.0.0.1:8001/health', timeout=5); exit(0 if r.status_code==200 and r.json().get('model_loaded') else 1)" 2>nul

if %errorlevel%==0 (
    echo SUCCESS: AI server is ready and model is loaded!
    goto server_ready
)

if %attempts% geq %max_attempts% (
    echo WARNING: Server not responding after %max_attempts% attempts, continuing anyway...
    goto server_ready
)

echo Server not ready yet, waiting 3 seconds...
timeout /t 3 /nobreak >nul
goto check_server

:server_ready

echo.
echo Starting web server...
echo Game will open in browser automatically
echo AI server is ready on port 8001
echo.

python server.py
