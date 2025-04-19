#!/usr/bin/env python3
"""
NuTetra Auto Dosing Integration Script
Shows how to integrate the AutoDosing module with the main system.
"""
import asyncio
import json
import os
import sys
import signal
import time
from typing import Dict, Any
import subprocess
import logging

# Import the AutoDosing module
from auto_dosing import AutoDosing

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("auto_dosing_integration.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("auto_dosing_integration")

# Configuration
DATA_DIR = os.path.join(os.getcwd(), 'data')
CONFIG_FILE = os.path.join(DATA_DIR, 'auto_dosing_config.json')
DEFAULT_CONFIG = {
    "enabled": False,
    "check_interval": 60,     # Check sensors every 60 seconds
    "dosing_cooldown": 300,   # Wait 5 minutes after dosing before checking again
    "between_dose_delay": 30, # Wait 30 seconds between nutrient doses
    "ph_tolerance": 0.2,      # Default pH tolerance
    "ec_tolerance": 0.2       # Default EC tolerance
}

# Global auto doser instance
auto_doser = None


def ensure_data_dir():
    """Ensure the data directory exists"""
    os.makedirs(DATA_DIR, exist_ok=True)


def load_config() -> Dict[str, Any]:
    """Load auto dosing configuration"""
    ensure_data_dir()
    
    if not os.path.exists(CONFIG_FILE):
        # Create default config
        with open(CONFIG_FILE, 'w') as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        return DEFAULT_CONFIG.copy()
    
    try:
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
        return config
    except Exception as e:
        logger.error(f"Error loading config: {e}")
        return DEFAULT_CONFIG.copy()


def save_config(config: Dict[str, Any]):
    """Save auto dosing configuration"""
    ensure_data_dir()
    
    try:
        with open(CONFIG_FILE, 'w') as f:
            json.dump(config, f, indent=2)
        logger.info("Auto dosing configuration saved")
    except Exception as e:
        logger.error(f"Error saving config: {e}")


def get_sensor_readings() -> Dict[str, float]:
    """
    Get sensor readings from the Atlas Scientific sensors
    Returns dict with ph, ec, and waterTemp keys
    """
    try:
        # Call the sensors API directly instead of trying to import from src
        result = subprocess.run(
            ["curl", "-s", "http://localhost:3000/api/sensors"],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Parse the JSON result
        response = json.loads(result.stdout.strip())
        if response.get("status") == "success" and response.get("data"):
            readings = response["data"]
            logger.debug(f"Sensor readings: {readings}")
            return readings
        else:
            raise Exception(f"API returned error: {response.get('error', 'Unknown error')}")
    except Exception as e:
        logger.error(f"Error getting sensor readings: {e}")
        # Return some fallback values
        return {
            "ph": 7.0,
            "ec": 1.0,
            "waterTemp": 20.0
        }


def get_active_profile() -> Dict[str, Any]:
    """
    Get the active plant profile settings
    Returns the profile with targetPh, targetEc, and pumpAssignments
    """
    try:
        # Call the profiles API to get the active profile
        result = subprocess.run(
            ["curl", "-s", "http://localhost:3000/api/profiles/active"],
            capture_output=True,
            text=True,
            check=True
        )
        
        # Parse the JSON result
        response = json.loads(result.stdout.strip())
        if response.get("status") == "success" and response.get("data"):
            profile = response["data"]
            logger.debug(f"Found active profile: {profile.get('name', 'Unknown')}")
            return profile
        else:
            logger.warning(f"No active profile found: {response.get('error', 'Unknown error')}")
            return {}
    except Exception as e:
        logger.error(f"Error getting active profile: {e}")
        return {}


def dispense_pump(pump_name: str, amount: float, flow_rate: float):
    """
    Dispense from a pump
    
    Args:
        pump_name: Name of the pump ('pH Up', 'pH Down', 'Pump 1', etc.)
        amount: Amount to dispense in ml
        flow_rate: Flow rate in ml/s
    """
    try:
        # Call the pump API instead of trying to import from src
        data = {
            "pump": pump_name,
            "amount": amount,
            "flowRate": flow_rate
        }
        
        cmd = [
            "curl", "-s", "-X", "POST", 
            "-H", "Content-Type: application/json", 
            "-d", json.dumps(data), 
            "http://localhost:3000/api/pumps/dispense"
        ]
        
        result = subprocess.run(cmd, check=True)
        
        logger.info(f"Dispensed {amount}ml from {pump_name} at {flow_rate}ml/s")
    except Exception as e:
        logger.error(f"Error dispensing from pump {pump_name}: {e}")
        raise


async def start_auto_dosing():
    """Initialize and start the auto-dosing system"""
    global auto_doser
    
    # Load configuration
    config = load_config()
    
    # Create auto doser instance
    auto_doser = AutoDosing(
        get_sensor_readings,
        get_active_profile,
        dispense_pump,
        check_interval=config.get('check_interval', 60),
        dosing_cooldown=config.get('dosing_cooldown', 300),
        between_dose_delay=config.get('between_dose_delay', 30),
        ph_tolerance=config.get('ph_tolerance', 0.2),
        ec_tolerance=config.get('ec_tolerance', 0.2)
    )
    
    # Start auto dosing if enabled in config
    if config.get('enabled', False):
        logger.info("Auto dosing enabled in config, starting...")
        await auto_doser.start()
    else:
        logger.info("Auto dosing disabled in config, not starting automatically")


def handle_signal(sig, frame):
    """Signal handler for graceful shutdown"""
    logger.info(f"Received signal {sig}, shutting down...")
    if auto_doser and auto_doser.running:
        # We can't use await in a signal handler, so we'll just set the flag
        auto_doser.enabled = False
        auto_doser.running = False
    sys.exit(0)


async def main():
    """Main function"""
    # Setup signal handlers
    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)
    
    try:
        # Start auto dosing
        await start_auto_dosing()
        
        # Keep the process running
        while True:
            await asyncio.sleep(1)
            
    except asyncio.CancelledError:
        logger.info("Main task cancelled")
    except Exception as e:
        logger.error(f"Error in main: {e}", exc_info=True)
    finally:
        # Clean up
        if auto_doser and auto_doser.running:
            logger.info("Stopping auto dosing...")
            await auto_doser.stop()
            
            # Export history before exit
            auto_doser.export_history_to_file()


# API-like functions for external control

async def enable_auto_dosing():
    """Enable auto dosing"""
    global auto_doser
    
    if not auto_doser:
        await start_auto_dosing()
    
    if auto_doser.running:
        logger.info("Auto dosing already running")
        return
    
    await auto_doser.start()
    
    # Update config
    config = load_config()
    config['enabled'] = True
    save_config(config)
    
    logger.info("Auto dosing enabled")


async def disable_auto_dosing():
    """Disable auto dosing"""
    global auto_doser
    
    if not auto_doser or not auto_doser.running:
        logger.info("Auto dosing not running")
        return
    
    await auto_doser.stop()
    
    # Update config
    config = load_config()
    config['enabled'] = False
    save_config(config)
    
    logger.info("Auto dosing disabled")


def get_auto_dosing_status():
    """Get current auto dosing status"""
    global auto_doser
    
    if not auto_doser:
        return {
            "enabled": False,
            "running": False,
            "initialized": False
        }
    
    status = auto_doser.get_status()
    status["initialized"] = True
    
    return status


def get_auto_dosing_history(limit=50):
    """Get auto dosing history"""
    global auto_doser
    
    if not auto_doser:
        return {
            "dosing_history": [],
            "sensor_history": []
        }
    
    return auto_doser.get_history(limit)


def update_auto_dosing_config(new_config):
    """Update auto dosing configuration"""
    global auto_doser
    
    # Validate the config
    valid_keys = ['check_interval', 'dosing_cooldown', 'between_dose_delay', 
                 'ph_tolerance', 'ec_tolerance', 'enabled']
    
    # Load current config
    config = load_config()
    
    # Update only valid keys
    for key, value in new_config.items():
        if key in valid_keys:
            config[key] = value
    
    # Save the updated config
    save_config(config)
    
    # Update auto doser if it exists
    if auto_doser:
        auto_doser.check_interval = config.get('check_interval', 60)
        auto_doser.dosing_cooldown = config.get('dosing_cooldown', 300)
        auto_doser.between_dose_delay = config.get('between_dose_delay', 30)
        auto_doser.ph_tolerance = config.get('ph_tolerance', 0.2)
        auto_doser.ec_tolerance = config.get('ec_tolerance', 0.2)
    
    # Start or stop based on enabled status
    if config.get('enabled', False) and auto_doser and not auto_doser.running:
        asyncio.create_task(enable_auto_dosing())
    elif not config.get('enabled', True) and auto_doser and auto_doser.running:
        asyncio.create_task(disable_auto_dosing())
    
    logger.info(f"Auto dosing configuration updated: {config}")
    return config


# Run the script
if __name__ == "__main__":
    asyncio.run(main()) 