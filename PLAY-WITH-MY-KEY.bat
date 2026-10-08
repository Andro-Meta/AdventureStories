@echo off
rem Play Adventure Stories with the OpenRouter key from .env (stays on this PC).
cd /d "%~dp0"
start "" http://127.0.0.1:8322
node tools\play_server.mjs
pause
