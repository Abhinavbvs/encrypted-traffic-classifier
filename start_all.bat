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
echo [*] Starting MetaFlow Web Server on http://127.0.0.1:8600 ...
start "MetaFlow Web Server (Port 8600)" /B !PY_BIN! web/server.py --port 8600

echo [*] Starting Streamlit Dashboard on http://127.0.0.1:8501 ...
start "MetaFlow Streamlit App (Port 8501)" /B !PY_BIN! -m streamlit run app.py --server.port 8501 --server.headless true

:: Wait 3 seconds for ports to bind
timeout /t 3 /nobreak >nul

echo.
echo ======================================================================
echo  [+] MetaFlow Web UI:    http://127.0.0.1:8600
echo  [+] Streamlit App:      http://127.0.0.1:8501
echo  [+] Live Analyzer:      http://127.0.0.1:8600/analyze.html
echo ======================================================================
echo.
echo Opening default browser...
start http://127.0.0.1:8600

echo.
echo Both servers are actively running in this background session.
echo Press Ctrl+C or close this window when you wish to stop them.
echo.

:: Keep script alive to hold process window
cmd /k
