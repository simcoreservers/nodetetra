#!/bin/bash
# Script to restart the auto-dosing system

echo "===== Auto-Dosing Restart Utility ====="

# Check if auto_dosing_integration.py exists
if [ ! -f "auto_dosing_integration.py" ]; then
    echo "ERROR: auto_dosing_integration.py not found in current directory!"
    exit 1
fi

# Check if existing auto_dosing process is running
PID=$(pgrep -f "python.*auto_dosing_integration.py" || echo "")
if [ ! -z "$PID" ]; then
    echo "Found existing auto_dosing process (PID: $PID). Stopping it..."
    kill $PID
    sleep 2
    
    # Check if it's still running
    if ps -p $PID > /dev/null; then
        echo "Process still running, forcing termination..."
        kill -9 $PID
        sleep 1
    fi
    echo "Previous process stopped."
fi

# Make sure the data directory exists
mkdir -p data

# Update config to ensure it's enabled
if [ -f "data/auto_dosing_config.json" ]; then
    echo "Ensuring auto_dosing is enabled in config..."
    # Use temporary file to avoid issues with in-place editing
    cat data/auto_dosing_config.json | sed 's/"enabled": *false/"enabled": true/g' > data/auto_dosing_config.json.tmp
    mv data/auto_dosing_config.json.tmp data/auto_dosing_config.json
else
    echo "Creating default config with enabled=true..."
    echo '{
  "enabled": true,
  "check_interval": 60,
  "dosing_cooldown": 300,
  "between_dose_delay": 30,
  "ph_tolerance": 0.5,
  "ec_tolerance": 0.2
}' > data/auto_dosing_config.json
fi

# Clear any existing log files to start fresh
echo "Clearing old log files..."
rm -f auto_dosing.log auto_dosing_integration.log

# Start the auto_dosing_integration script
echo "Starting auto_dosing_integration.py..."
nohup python auto_dosing_integration.py > auto_dosing_output.log 2>&1 &
NEW_PID=$!

echo "Auto-dosing started with PID: $NEW_PID"
echo "Waiting 5 seconds to check status..."
sleep 5

# Check if process is still running
if ps -p $NEW_PID > /dev/null; then
    echo "✅ Auto-dosing process is running!"
    echo "You can check logs with:"
    echo "  tail -f auto_dosing.log"
    echo "  tail -f auto_dosing_integration.log"
else
    echo "❌ ERROR: Auto-dosing process failed to start or terminated quickly!"
    echo "Check auto_dosing_output.log for details"
fi

echo "===== Done ====="