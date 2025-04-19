#!/usr/bin/env python3
"""
Force kill all auto-dosing processes and ensure status file is set to disabled
"""
import os
import json
import time
import subprocess
import sys

# Configuration
DATA_DIR = os.path.join(os.getcwd(), 'data')
STATUS_FILE = os.path.join(DATA_DIR, 'auto_dosing_status.json')
CONFIG_FILE = os.path.join(DATA_DIR, 'auto_dosing_config.json')

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

print("===== Auto-Dosing Termination Utility =====")

# 1. Kill all auto-dosing processes
try:
    print("Looking for auto-dosing processes...")
    result = subprocess.run(["pgrep", "-fa", "python.*auto_dosing_integration.py"], 
                           capture_output=True, text=True)
    
    if result.returncode == 0 and result.stdout.strip():
        processes = result.stdout.strip().split('\n')
        print(f"Found {len(processes)} auto-dosing processes:")
        
        for process in processes:
            print(f"  - {process}")
            
        # Extract PIDs and kill them
        pids = [pid.strip().split()[0] for pid in processes if pid.strip()]
        if pids:
            print(f"Terminating {len(pids)} processes...")
            for pid in pids:
                try:
                    subprocess.run(["kill", "-9", pid], check=False)
                    print(f"  - Terminated process {pid}")
                except Exception as e:
                    print(f"  - Error terminating process {pid}: {e}")
            
            # Verify all processes are gone
            time.sleep(1)
            check = subprocess.run(["pgrep", "-fa", "python.*auto_dosing_integration.py"], 
                                  capture_output=True, text=True)
            if check.returncode == 0 and check.stdout.strip():
                remaining = check.stdout.strip().split('\n')
                print(f"WARNING: {len(remaining)} processes still running!")
            else:
                print("All auto-dosing processes successfully terminated!")
    else:
        print("No auto-dosing processes found.")
except Exception as e:
    print(f"Error managing processes: {e}")

# 2. Update status file to disabled state
try:
    if os.path.exists(STATUS_FILE):
        print(f"Updating status file: {STATUS_FILE}")
        with open(STATUS_FILE, 'r') as f:
            status = json.load(f)
        
        status['enabled'] = False
        status['running'] = False
        status['timestamp'] = time.time()
        
        with open(STATUS_FILE, 'w') as f:
            json.dump(status, f, indent=2)
        print("Status file updated to disabled state")
    else:
        print("Status file not found, creating new one...")
        status = {
            "enabled": False,
            "running": False,
            "pid": 0,
            "timestamp": time.time()
        }
        with open(STATUS_FILE, 'w') as f:
            json.dump(status, f, indent=2)
        print("Created new status file with disabled state")
except Exception as e:
    print(f"Error updating status file: {e}")

# 3. Update config file to disabled state
try:
    if os.path.exists(CONFIG_FILE):
        print(f"Updating config file: {CONFIG_FILE}")
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        
        config['enabled'] = False
        
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        print("Config file updated to disabled state")
    else:
        print("Config file not found, creating new one...")
        config = {
            "enabled": False,
            "check_interval": 60,
            "dosing_cooldown": 300,
            "between_dose_delay": 30,
            "ph_tolerance": 0.2,
            "ec_tolerance": 0.2
        }
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        print("Created new config file with disabled state")
except Exception as e:
    print(f"Error updating config file: {e}")

print("\n===== Auto-Dosing Terminated =====")
print("The auto-dosing system has been completely shut down.")
print("To restart it, you'll need to manually enable it from the dashboard.")
