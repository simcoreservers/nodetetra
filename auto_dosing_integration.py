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
    level=logging.DEBUG,
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
        logger.debug("Calling sensor API endpoint...")
        # Call the sensors API directly
        cmd = ["curl", "-v", "-s", "http://localhost:3000/api/sensors"]
        logger.debug(f"Running command: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False  # Don't raise exception on non-zero exit
        )
        
        if result.returncode != 0:
            logger.error(f"Curl command failed with return code {result.returncode}")
            logger.error(f"Stderr: {result.stderr}")
            # Fall back to using default values
            return {
                "ph": 7.0,
                "ec": 1.0,
                "waterTemp": 20.0
            }
        
        # Parse the JSON result
        try:
            response = json.loads(result.stdout.strip())
            logger.debug(f"API response: {response}")
            
            # Check various response formats
            if response.get("status") == "success" and response.get("data"):
                # Standard format: { status: "success", data: {...} }
                readings = response["data"]
                logger.debug(f"Parsed sensor readings from data field: {readings}")
                return readings
            elif isinstance(response, dict) and all(k in response for k in ["ph", "ec", "waterTemp"]):
                # Direct format: { ph: X, ec: Y, waterTemp: Z }
                logger.debug(f"Parsed sensor readings from direct response: {response}")
                return response
            else:
                logger.error(f"API error or unexpected format: {response.get('error', 'Unknown error')}")
                # Fall back to using default values
                return {
                    "ph": 7.0,
                    "ec": 1.0,
                    "waterTemp": 20.0
                }
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            logger.error(f"Response was: {result.stdout}")
            # Fall back to using default values
            return {
                "ph": 7.0,
                "ec": 1.0,
                "waterTemp": 20.0
            }
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
        logger.debug("Calling profiles API endpoint...")
        # Call the profiles API to get the active profile
        cmd = ["curl", "-v", "-s", "http://localhost:3000/api/profiles/active"]
        logger.debug(f"Running command: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False  # Don't raise exception on non-zero exit
        )
        
        if result.returncode != 0:
            logger.error(f"Curl command failed with return code {result.returncode}")
            logger.error(f"Stderr: {result.stderr}")
            return {}
        
        # Parse the JSON result
        try:
            response = json.loads(result.stdout.strip())
            logger.debug(f"API response: {response}")
            
            # Check if this is a direct profile object (has name, targetPh, targetEc)
            if isinstance(response, dict) and response.get("name") and response.get("targetPh") and response.get("targetEc"):
                logger.debug(f"Found active profile directly in response: {response.get('name', 'Unknown')}")
                return response
            # Check standard API response format
            elif response.get("status") == "success" and response.get("data"):
                profile = response["data"]
                logger.debug(f"Found active profile in data field: {profile.get('name', 'Unknown')}")
                return profile
            else:
                logger.warning(f"No active profile found: {response.get('error', 'Unknown error')}")
                logger.warning(f"Full response: {response}")
                return {}
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON response: {e}")
            logger.error(f"Response was: {result.stdout}")
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
        logger.debug(f"Dispensing {amount}ml from {pump_name} at {flow_rate}ml/s")
        # Call the pump API
        data = {
            "pump": pump_name,
            "amount": amount,
            "flowRate": flow_rate
        }
        
        json_data = json.dumps(data)
        logger.debug(f"Request data: {json_data}")
        
        cmd = [
            "curl", "-v", "-s", "-X", "POST", 
            "-H", "Content-Type: application/json", 
            "-d", json_data, 
            "http://localhost:3000/api/pumps/dispense"
        ]
        
        logger.debug(f"Running command: {' '.join(cmd)}")
        
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            check=False  # Don't raise exception on non-zero exit
        )
        
        if result.returncode != 0:
            logger.error(f"Curl command failed with return code {result.returncode}")
            logger.error(f"Stderr: {result.stderr}")
            raise Exception(f"Failed to dispense from pump {pump_name}: Command failed with code {result.returncode}")
        
        # Try to parse response for more detailed logging
        try:
            response = json.loads(result.stdout.strip())
            logger.debug(f"API response: {response}")
            
            if response.get("status") != "success":
                error_msg = response.get("error", "Unknown API error")
                logger.error(f"API error: {error_msg}")
                raise Exception(f"Failed to dispense from pump {pump_name}: {error_msg}")
        except json.JSONDecodeError:
            # If we can't parse the response, just log what we got back
            logger.debug(f"Response (not JSON): {result.stdout}")
        
        logger.info(f"Successfully dispensed {amount}ml from {pump_name} at {flow_rate}ml/s")
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
        
        # Force enable if configured
        config = load_config()
        if config.get('enabled', False):
            logger.info("Auto-dosing enabled in config, force-starting...")
            if not auto_doser:
                logger.error("ERROR: auto_doser not initialized properly!")
            else:
                # Force start regardless of current state
                if not auto_doser.running:
                    logger.info("Auto-doser not running, starting it now...")
                    await auto_doser.start()
                    
                    # Double-check that it started
                    if auto_doser.running:
                        logger.info("Auto-doser successfully started!")
                    else:
                        logger.error("FAILED to start auto-doser!")
                else:
                    logger.info("Auto-doser already running")
        
        # Keep the process running
        while True:
            await asyncio.sleep(10)  # Check status every 10 seconds
            if auto_doser:
                status = auto_doser.get_status()
                logger.debug(f"Auto-doser status check: enabled={status['enabled']}, running={status['running']}")
                
                # If enabled but not running, try to restart
                if status['enabled'] and not status['running']:
                    logger.warning("Auto-doser enabled but not running, attempting restart...")
                    await auto_doser.start()
            else:
                logger.error("auto_doser instance is None! Reinitializing...")
                await start_auto_dosing()
            
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
    
    logger.debug("Enable auto dosing requested")
    
    # Ensure we have an auto_doser instance
    if not auto_doser:
        logger.debug("No auto_doser instance, creating one")
        await start_auto_dosing()
    
    if not auto_doser:
        logger.error("FAILED to create auto_doser instance!")
        raise RuntimeError("Could not create auto_doser instance")
    
    # Start auto dosing if not already running
    if not auto_doser.running:
        logger.info("Starting auto dosing...")
        await auto_doser.start()
        
        # Verify it started
        if not auto_doser.running:
            logger.error("FAILED to start auto_doser!")
            raise RuntimeError("Could not start auto_doser")
        
        logger.info("Auto dosing started successfully")
    else:
        logger.info("Auto dosing already running")
    
    # Update config to persist enabled state
    config = load_config()
    config['enabled'] = True
    save_config(config)
    
    logger.info("Auto dosing enabled and configured to start on boot")
    
    # Return success
    return {"success": True, "message": "Auto dosing enabled"}


async def disable_auto_dosing():
    """Disable auto dosing"""
    global auto_doser
    
    logger.debug("Disable auto dosing requested")
    
    # First update the config to prevent auto-restart
    config = load_config()
    config['enabled'] = False
    save_config(config)
    logger.info("Auto dosing disabled in configuration")
    
    # Then stop the running process if it exists
    if auto_doser:
        if auto_doser.running:
            logger.info("Stopping running auto dosing task")
            await auto_doser.stop()
            logger.info("Auto dosing task stopped")
        else:
            logger.info("Auto dosing task not running")
    else:
        logger.info("No auto_doser instance exists")
    
    # Double check that task is really stopped
    if auto_doser and auto_doser.task:
        if not auto_doser.task.done() and not auto_doser.task.cancelled():
            logger.warning("Auto dosing task still appears to be running, forcing cancellation")
            auto_doser.task.cancel()
    
    # Return success response
    return {"success": True, "message": "Auto dosing disabled"}


def get_auto_dosing_status():
    """Get current auto dosing status"""
    global auto_doser
    
    logger.debug("Getting auto dosing status")
    
    # Check if auto_doser exists
    if not auto_doser:
        # Try to read from config
        config = load_config()
        enabled = config.get('enabled', False)
        
        logger.debug(f"No auto_doser instance, using config: enabled={enabled}")
        
        # Return basic status based on config
        return {
            "enabled": enabled,
            "running": False,
            "initialized": False,
            "last_check_time": 0,
            "last_dosing_time": 0,
            "in_cooldown": False,
            "cooldown_remaining": 0,
            "config": {
                "check_interval": config.get('check_interval', 60),
                "dosing_cooldown": config.get('dosing_cooldown', 300),
                "between_dose_delay": config.get('between_dose_delay', 30),
                "ph_tolerance": config.get('ph_tolerance', 0.2),
                "ec_tolerance": config.get('ec_tolerance', 0.2)
            }
        }
    
    # Read configuration state regardless of auto_doser
    config = load_config()
    config_enabled = config.get('enabled', False)
    
    # Get status from auto_doser instance
    status = auto_doser.get_status()
    
    # The auto_doser.enabled flag might not match the config file
    # Config file takes precedence for the UI display
    status["enabled"] = config_enabled
    status["initialized"] = True
    
    # Force running to match task state
    if auto_doser.task and not auto_doser.task.done() and not auto_doser.task.cancelled():
        status["running"] = True
        logger.debug("Auto-dosing task is active (running=True)")
    else:
        logger.debug(f"Auto-dosing task state: {auto_doser.task}")
    
    # Ensure config is always included
    if "config" not in status:
        status["config"] = {
            "check_interval": auto_doser.check_interval,
            "dosing_cooldown": auto_doser.dosing_cooldown,
            "between_dose_delay": auto_doser.between_dose_delay,
            "ph_tolerance": auto_doser.ph_tolerance,
            "ec_tolerance": auto_doser.ec_tolerance
        }
    
    logger.debug(f"Auto dosing status: {status}")
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