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

:: Kiem tra thu vien truoc khi chay
%PY_CMD% -c "import fastapi, uvicorn, requests, PIL" 2>nul
if errorlevel 1 (
    echo [AUTO-SETUP] Dang tu dong cai dat cac thu vien con thieu (fastapi, uvicorn, requests, pillow)...
    %PY_CMD% -m pip install --quiet --disable-pip-version-check fastapi uvicorn requests pillow python-multipart
)

%PY_CMD% service.py
if errorlevel 1 (
    echo.
    echo ========================================================
    echo [AUTO-REPAIR] Phat hien loi khoi dong. Dang tu dong cai dat Python 3.11...
    echo ========================================================
    powershell -NoProfile -ExecutionPolicy Bypass -Command "& { Write-Host 'Dang cai dat Python 3.11 tu dong qua winget...'; winget install Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements --override '/quiet InstallAllUsers=0 PrependPath=1 Include_test=0' }"
    
    if exist "%LOCALAPPDATA%\Programs\Python\Python311\python.exe" (
        set "PY_CMD=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"
        echo [INFO] Da cai dat thanh cong tai: %PY_CMD%
        echo [INFO] Dang cai dat tiep thu vien...
        %PY_CMD% -m pip install --quiet --disable-pip-version-check fastapi uvicorn requests pillow python-multipart
        echo [INFO] Dang khoi dong lai service.py...
        %PY_CMD% service.py
    ) else (
        echo [ERROR] Khong the tu dong cai dat Python. Vui long kiem tra ket noi internet hoac chay thu cong: winget install Python.Python.3.11
    )
)
pause
