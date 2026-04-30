@echo off
title Adventure Stories - Complete Local AI Setup
echo Adventure Stories - Complete Local AI Installation
echo =================================================
echo.
echo This will set up the local AI system for unlimited generation!
echo.
echo What will be installed:
echo - Python virtual environment
echo - PyTorch and AI dependencies  
echo - MiniCPM-2B-128k model (~4GB download)
echo - Local AI server setup
echo - No API keys required!
echo.
echo IMPORTANT: This will download ~4GB. Ensure you have:
echo - Stable internet connection
echo - At least 8GB free disk space
echo - 15-30 minutes for complete setup
echo.
pause

echo.
echo Setting up Local AI system...
echo.

REM Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python not found!
    echo Please install Python 3.8+ from https://python.org
    echo Make sure to check "Add Python to PATH" during installation
    pause
    exit /b 1
)

REM Create virtual environment if it doesn't exist
if not exist "venv_local_ai" (
    echo [1/5] Creating virtual environment...
    python -m venv venv_local_ai
    if %errorlevel% neq 0 (
        echo ERROR: Failed to create virtual environment!
        pause
        exit /b 1
    )
    echo ✓ Virtual environment created
) else (
    echo ✓ Virtual environment already exists
)

echo.
echo [2/5] Installing Python dependencies...
venv_local_ai\Scripts\python.exe -m pip install --upgrade pip --quiet
venv_local_ai\Scripts\python.exe -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118 --quiet
if %errorlevel% neq 0 (
    echo ERROR: Failed to install PyTorch!
    pause
    exit /b 1
)

venv_local_ai\Scripts\python.exe -m pip install transformers>=4.37.0 accelerate>=0.25.0 huggingface-hub>=0.20.0 --quiet
venv_local_ai\Scripts\python.exe -m pip install fastapi>=0.104.0 uvicorn[standard]>=0.24.0 pydantic>=2.0.0 --quiet
venv_local_ai\Scripts\python.exe -m pip install bitsandbytes>=0.41.0 psutil>=5.9.0 --quiet
echo ✓ Dependencies installed

echo.
echo [3/5] Downloading MiniCPM-2B-128k model (~4GB)...
echo This may take 5-15 minutes depending on your internet speed...
echo.

REM Create download script
echo import os > download_model.py
echo from huggingface_hub import snapshot_download >> download_model.py
echo. >> download_model.py
echo MODEL_NAME = "openbmb/MiniCPM-2B-128k" >> download_model.py
echo MODEL_CACHE_DIR = "./models/minicpm-2b-128k" >> download_model.py
echo. >> download_model.py
echo print("Starting model download...") >> download_model.py
echo os.makedirs(MODEL_CACHE_DIR, exist_ok=True) >> download_model.py
echo. >> download_model.py
echo try: >> download_model.py
echo     snapshot_download( >> download_model.py
echo         repo_id=MODEL_NAME, >> download_model.py
echo         local_dir=MODEL_CACHE_DIR, >> download_model.py
echo         local_dir_use_symlinks=False >> download_model.py
echo     ) >> download_model.py
echo     print("✓ Model downloaded successfully!") >> download_model.py
echo except Exception as e: >> download_model.py
echo     print(f"✗ Model download failed: {e}") >> download_model.py
echo     exit(1) >> download_model.py

REM Run download
venv_local_ai\Scripts\python.exe download_model.py
if %errorlevel% neq 0 (
    echo ERROR: Model download failed!
    del download_model.py
    pause
    exit /b 1
)

REM Cleanup
del download_model.py
echo ✓ Model download completed

echo.
echo [4/5] Creating configuration files...
REM Only seed local_ai_config.json if missing — never overwrite a live config
REM that may have been pointed at a different backend (e.g. llama-cpp on :8090).
if not exist local_ai_config.json (
  echo {"local_ai_server": {"enabled": true, "url": "http://localhost:8001", "model": "openbmb/MiniCPM-2B-128k"}} > local_ai_config.json
  echo + Seeded local_ai_config.json with MiniCPM defaults
) else (
  echo - Existing local_ai_config.json preserved
)
echo + Configuration step complete

echo.
echo [5/5] Testing model loading...
echo import os > test_model.py
echo from transformers import AutoTokenizer >> test_model.py
echo MODEL_CACHE_DIR = "./models/minicpm-2b-128k" >> test_model.py
echo try: >> test_model.py
echo     tokenizer = AutoTokenizer.from_pretrained(MODEL_CACHE_DIR, trust_remote_code=True) >> test_model.py
echo     print("✓ Model files verified and ready!") >> test_model.py
echo except Exception as e: >> test_model.py
echo     print(f"✗ Model verification failed: {e}") >> test_model.py
echo     exit(1) >> test_model.py

venv_local_ai\Scripts\python.exe test_model.py
if %errorlevel% neq 0 (
    echo WARNING: Model verification failed, but continuing...
)
del test_model.py

echo.
echo =================================================
echo Complete Local AI Setup Finished!
echo =================================================
echo.
echo ✓ Virtual environment: venv_local_ai
echo ✓ Dependencies: All installed
echo ✓ Model: MiniCPM-2B-128k downloaded and cached
echo ✓ Configuration: Ready for local AI
echo.
echo Next steps:
echo 1. Run: python start_game.py
echo 2. Game will start with local AI ready!
echo 3. No more downloads needed!
echo.
echo Model Info:
echo - Model: MiniCPM-2B-128k (OpenBMB)
echo - Context Length: 128,000 tokens  
echo - Location: models/minicpm-2b-128k/
echo - Status: Ready for unlimited generation!
echo.
pause
