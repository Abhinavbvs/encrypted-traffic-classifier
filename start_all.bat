@echo off
setlocal enabledelayedexpansion

title MetaFlow - Encrypted Traffic Classifier

echo ======================================================================
echo                MetaFlow - Encrypted Traffic Classifier
echo ======================================================================
echo.

cd /d "%~dp0"

:: 1. Detect Python executable
set "PY_BIN="
if exist ".venv\Scripts\python.exe" (
    set "PY_BIN=.venv\Scripts\python.exe"
    echo [*] Using virtual environment: .venv\Scripts\python.exe
) else (
    where python >nul 2>nul
    if %errorlevel% equ 0 (
        set "PY_BIN=python"
        echo [*] Using system python
    ) else (
        echo [!] Python 3.11+ is required but was not found on PATH.
        pause
        exit /b 1
    )
)

echo.
echo [*] Starting unified MetaFlow server on http://127.0.0.1:8600 ...
echo     - MetaFlow Web UI:  http://127.0.0.1:8600/
echo     - Live Analyzer:    http://127.0.0.1:8600/analyze.html
echo     - Streamlit Studio: http://127.0.0.1:8600/studio/ (auto-managed)
echo.

start "Open Browser" cmd /c "timeout /t 3 /nobreak >nul && start http://127.0.0.1:8600"
!PY_BIN! web/server.py --port 8600
