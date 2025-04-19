#!/usr/bin/env python3
"""
Force update the auto-dosing status file to running = true
"""
import os
import json
import time

# Get data directory path
DATA_DIR = os.path.join(os.getcwd(), 'data')
STATUS_FILE = os.path.join(DATA_DIR, 'auto_dosing_status.json')

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# Read existing status if available
if os.path.exists(STATUS_FILE):
    try:
        with open(STATUS_FILE, 'r') as f:
            status_data = json.load(f)
            print(f"Current status: {status_data}")
            
            # Force running status to True
            status_data['running'] = True
            status_data['timestamp'] = time.time()
    except Exception as e:
        print(f"Error reading status file: {e}")
        # Create default status
        status_data = {
            "enabled": True,
            "running": True,
            "pid": os.getpid(),
            "timestamp": time.time()
        }
else:
    # Create default status
    status_data = {
        "enabled": True,
        "running": True,
        "pid": os.getpid(),
        "timestamp": time.time()
    }
    print("Status file not found, creating new one")

# Write updated status
try:
    with open(STATUS_FILE, 'w') as f:
        json.dump(status_data, f, indent=2)
    print(f"Status updated: {status_data}")
    print("Success! Auto-dosing status is now set to running=true")
except Exception as e:
    print(f"Error writing status file: {e}")
