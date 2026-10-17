@echo off
chcp 65001 > nul
title TTS-Bot Backend Service (Port 8787)
echo ========================================================
echo   Starting TTS-Bot Service on http://127.0.0.1:8787
echo ========================================================
cd /d "%~dp0additions\tts_bot"

set "PY_CMD="

:: 1. Check venvs
if exist "%~dp0.venv\Scripts\python.exe" set "PY_CMD=%~dp0.venv\Scripts\python.exe"
if not defined PY_CMD if exist "%~dp0venv\Scripts\python.exe" set "PY_CMD=%~dp0venv\Scripts\python.exe"
if not defined PY_CMD if exist "%~dp0additions\tts_bot\.venv\Scripts\python.exe" set "PY_CMD=%~dp0additions\tts_bot\.venv\Scripts\python.exe"

:: 2. Check LocalAppData Programs Python
if not defined PY_CMD if exist "%LOCALAPPDATA%\Programs\Python\Python313\python.exe" set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python313\python.exe"
if not defined PY_CMD if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
if not defined PY_CMD if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
if not defined PY_CMD if exist "%LOCALAPPDATA%\Programs\Python\Python310\python.exe" set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python310\python.exe"

:: 3. Check C:\Program Files or C:\Python
if not defined PY_CMD if exist "C:\Python312\python.exe" set "PY_CMD=C:\Python312\python.exe"
if not defined PY_CMD if exist "C:\Python311\python.exe" set "PY_CMD=C:\Python311\python.exe"
if not defined PY_CMD if exist "C:\Python310\python.exe" set "PY_CMD=C:\Python310\python.exe"
if not defined PY_CMD if exist "C:\Program Files\Python312\python.exe" set "PY_CMD=C:\Program Files\Python312\python.exe"
if not defined PY_CMD if exist "C:\Program Files\Python311\python.exe" set "PY_CMD=C:\Program Files\Python311\python.exe"

:: 4. Check py launcher
if not defined PY_CMD (
    py -3 -c "import sys" 2>nul
    if not errorlevel 1 set "PY_CMD=py -3"
)

:: 5. Fallback to python command
if not defined PY_CMD set "PY_CMD=python"

echo [INFO] Python command: %PY_CMD%
%PY_CMD% service.py
if errorlevel 1 (
    echo.
    echo ========================================================
    echo [ERROR] Không thể chạy service.py bằng lệnh: %PY_CMD%
    echo Nếu lỗi 'Python was not found' từ Microsoft Store:
    echo   1. Mở PowerShell chạy: winget install Python.Python.3.11
    echo   2. Hoặc vào Settings > Apps > Advanced app settings
    echo      > App execution aliases -> Tắt 'python.exe'
    echo ========================================================
)
pause
