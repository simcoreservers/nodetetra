@echo off
echo ===== Auto-Dosing Restart Utility =====

rem Check if auto_dosing_integration.py exists
if not exist auto_dosing_integration.py (
    echo ERROR: auto_dosing_integration.py not found in current directory!
    exit /b 1
)

rem Check if existing auto_dosing process is running
for /f "tokens=2" %%a in ('tasklist /fi "imagename eq python.exe" /fi "windowtitle eq *auto_dosing*" /fo list ^| find "PID:"') do (
    set PID=%%a
    echo Found existing auto_dosing process (PID: %%a). Stopping it...
    taskkill /PID %%a /F
    timeout /t 2 /nobreak > nul
)

rem Make sure the data directory exists
if not exist data mkdir data

rem Update config to ensure it's enabled
if exist data\auto_dosing_config.json (
    echo Ensuring auto_dosing is enabled in config...
    powershell -Command "(Get-Content data\auto_dosing_config.json) -replace '\"enabled\": *false', '\"enabled\": true' | Set-Content data\auto_dosing_config.json"
) else (
    echo Creating default config with enabled=true...
    echo {> data\auto_dosing_config.json
    echo   "enabled": true,>> data\auto_dosing_config.json
    echo   "check_interval": 60,>> data\auto_dosing_config.json
    echo   "dosing_cooldown": 300,>> data\auto_dosing_config.json
    echo   "between_dose_delay": 30,>> data\auto_dosing_config.json
    echo   "ph_tolerance": 0.5,>> data\auto_dosing_config.json
    echo   "ec_tolerance": 0.2>> data\auto_dosing_config.json
    echo }>> data\auto_dosing_config.json
)

rem Clear any existing log files to start fresh
echo Clearing old log files...
if exist auto_dosing.log del /f auto_dosing.log
if exist auto_dosing_integration.log del /f auto_dosing_integration.log

rem Start the auto_dosing_integration script in a new window
echo Starting auto_dosing_integration.py in a new window...
start "Auto Dosing" cmd /c "python auto_dosing_integration.py > auto_dosing_output.log 2>&1"

echo Auto-dosing started in new window
echo Waiting 5 seconds to check status...
timeout /t 5 /nobreak > nul

rem Check if process is still running
tasklist /fi "imagename eq python.exe" /fi "windowtitle eq Auto Dosing" > nul 2>&1
if not errorlevel 1 (
    echo [32m✅ Auto-dosing process is running![0m
    echo You can check logs in:
    echo   auto_dosing.log
    echo   auto_dosing_integration.log
) else (
    echo [31m❌ ERROR: Auto-dosing process failed to start or terminated quickly![0m
    echo Check auto_dosing_output.log for details
)

echo ===== Done =====
pause