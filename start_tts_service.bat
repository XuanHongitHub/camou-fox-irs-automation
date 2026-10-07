@echo off
chcp 65001 > nul
title TTS-Bot Backend Service (Port 8787)
echo ========================================================
echo   Starting TTS-Bot Service on http://127.0.0.1:8787
echo ========================================================
cd /d "%~dp0additions\tts_bot"
python service.py
pause
