@echo off
REM open-cdp.bat -- Launch Chrome or Edge with CDP remote debugging enabled
REM Usage: open-cdp.bat [chrome|edge] [port] [user-data-dir]

setlocal enabledelayedexpansion

set BROWSER=%1
if /i "%BROWSER%"=="chrome" goto CHROME
if /i "%BROWSER%"=="edge" goto EDGE

echo Usage: open-cdp.bat chrome^|edge [port] [user-data-dir]
echo Example: open-cdp.bat chrome 9222
echo          open-cdp.bat edge 9222 ".state\profiles\edge-cdp"
pause
exit /b 1

:CHROME
set BROWSER_LABEL=Chrome
set BROWSER_EXE=chrome.exe
set ENV_VAR=PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
set PROFILE_DIR=chrome-cdp
set PATHS="C:\Program Files\Google\Chrome\Application\chrome.exe" "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" "%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"
goto COMMON

:EDGE
set BROWSER_LABEL=Edge
set BROWSER_EXE=msedge.exe
set ENV_VAR=PLAYWRIGHT_EDGE_EXECUTABLE_PATH
set PROFILE_DIR=edge-cdp
set PATHS="C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" "%LOCALAPPDATA%\Microsoft\Edge\Application\msedge.exe"
goto COMMON

:COMMON
set PORT=%2
if "%PORT%"=="" set PORT=9222

set USER_DATA_DIR=%3
if "%USER_DATA_DIR%"=="" set USER_DATA_DIR=%~dp0..\.state\profiles\%PROFILE_DIR%

echo [CDP] Launching %BROWSER_LABEL% with remote debugging on port %PORT%...
echo [CDP] User data dir: %USER_DATA_DIR%

if not exist "%USER_DATA_DIR%" mkdir "%USER_DATA_DIR%"

call set FOUND_PATH=%%%ENV_VAR%%%
if not "%FOUND_PATH%"=="" goto LAUNCH

for %%p in (%PATHS%) do (
    if exist %%p (
        set FOUND_PATH=%%p
        goto LAUNCH
    )
)

echo [CDP] ERROR: %BROWSER_LABEL% not found. Install %BROWSER_LABEL% or set %ENV_VAR%.
pause
exit /b 1

:LAUNCH
start "" %FOUND_PATH% --remote-debugging-port=%PORT% --user-data-dir="%USER_DATA_DIR%" --no-first-run --no-default-browser-check

echo [CDP] %BROWSER_LABEL% started. Connect via CDP on ws://localhost:%PORT%
pause >nul
