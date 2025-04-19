#!/usr/bin/env python3
"""
Utility script to check and update auto-dosing status
"""
import os
import json
import time
import subprocess
import sys

# Configuration
DATA_DIR = os.path.join(os.getcwd(), 'data')
STATUS_FILE = os.path.join(DATA_DIR, 'auto_dosing_status.json')

# Create data directory if it doesn't exist
os.makedirs(DATA_DIR, exist_ok=True)

# Check for running auto-dosing processes
try:
    result = subprocess.run(["pgrep", "-fa", "python.*auto_dosing_integration.py"], 
                           capture_output=True, text=True)
    processes = result.stdout.strip()
    
    running = len(processes) > 0
    print(f"Found auto-dosing processes: {processes}")
    print(f"Auto-dosing is {'running' if running else 'not running'}")
    
    # Update status file
    if os.path.exists(STATUS_FILE):
        try:
            with open(STATUS_FILE, 'r') as f:
                status_data = json.load(f)
                print(f"Current status file: {status_data}")
                
                # Update the running status
                status_data['running'] = running
                status_data['timestamp'] = time.time()
                
                with open(STATUS_FILE, 'w') as f:
                    json.dump(status_data, f, indent=2)
                    print(f"Updated status file: {status_data}")
        except Exception as e:
            print(f"Error updating status file: {e}")
    else:
        print(f"Status file not found at: {STATUS_FILE}")
        # Create a new status file
        status_data = {
            "enabled": True,
            "running": running,
            "pid": 0,
            "timestamp": time.time()
        }
        with open(STATUS_FILE, 'w') as f:
            json.dump(status_data, f, indent=2)
            print(f"Created new status file: {status_data}")
            
except Exception as e:
    print(f"Error checking processes: {e}")
    sys.exit(1)

sys.exit(0)
