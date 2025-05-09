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
    "between_dose_delay": 30  # Wait 30 seconds between nutrient doses
}

# Global auto doser instance
auto_doser = None


def ensure_data_dir():
    """Ensure the data directory exists"""
    try:
        if not os.path.exists(DATA_DIR):
            logger.info(f"Creating data directory at {DATA_DIR}")
            os.makedirs(DATA_DIR, exist_ok=True)
            logger.info(f"Data directory created successfully")
        else:
            logger.debug(f"Data directory already exists at {DATA_DIR}")
        
        # Test write permissions by creating a test file
        test_file = os.path.join(DATA_DIR, '.test_write')
        try:
            with open(test_file, 'w') as f:
                f.write('test')
            os.remove(test_file)
            logger.debug(f"Data directory is writable")
        except Exception as e:
            logger.warning(f"Data directory exists but might not be writable: {e}")
    except Exception as e:
        logger.error(f"Failed to create or verify data directory: {e}")
        # We'll continue and let individual operations handle their errors


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


def update_status_file(enabled: bool, running: bool, pid: int = 0):
    """Update the auto dosing status file"""
    ensure_data_dir()
    
    status_file = os.path.join(DATA_DIR, 'auto_dosing_status.json')
    
    try:
        status_data = {
            "enabled": enabled,
            "running": running,
            "pid": pid or os.getpid() if running else 0,
            "timestamp": time.time()
        }
        
        with open(status_file, 'w') as f:
            json.dump(status_data, f, indent=2)
            
        logger.info(f"Updated status file: {status_data}")
        return True
    except Exception as e:
        logger.error(f"Error updating status file: {e}")
        return False


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
    
    # If we already have an auto_doser instance that's running, don't create a new one
    if auto_doser and auto_doser.running:
        logger.info("Auto-doser already running, not creating a new instance")
        return
        
    # Kill any existing instance if it exists but isn't running properly
    if auto_doser and not auto_doser.running:
        logger.info("Existing auto_doser instance found but not running, cleaning up")
        try:
            if auto_doser.task and not auto_doser.task.done() and not auto_doser.task.cancelled():
                logger.info("Cancelling existing task")
                auto_doser.task.cancel()
                try:
                    # Wait with timeout for the task to actually stop
                    await asyncio.wait_for(asyncio.shield(auto_doser.task), timeout=3.0)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    pass
        except Exception as e:
            logger.error(f"Error cleaning up existing task: {e}")
        # Reset the instance to None so we create a fresh one
        auto_doser = None
    
    # Create auto doser instance
    logger.info("Creating new AutoDosing instance")
    auto_doser = AutoDosing(
        get_sensor_readings,
        get_active_profile,
        dispense_pump,
        check_interval=config.get('check_interval', 60),
        dosing_cooldown=config.get('dosing_cooldown', 300),
        between_dose_delay=config.get('between_dose_delay', 30)
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
    
    # Create status file directory if it doesn't exist
    ensure_data_dir()
    
    # Create initial status file using our helper function
    config = load_config() 
    enabled_in_config = config.get('enabled', False)
    update_status_file(enabled=enabled_in_config, running=enabled_in_config)
    
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
                
                # Check if the task is still alive or if it's completed
                task_active = auto_doser.task and not auto_doser.task.done() and not auto_doser.task.cancelled()
                logger.debug(f"Task active check: {task_active}")
                
                # If enabled but not running or task is completed, try to restart
                if status['enabled'] and (not status['running'] or not task_active):
                    logger.warning("Auto-doser enabled but not running or task completed, attempting restart...")
                    # Reset running flag to avoid "already running" warning
                    auto_doser.running = False
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
    
    # First ensure data directory exists
    ensure_data_dir()
    
    # First, update the config file to make sure it's marked as enabled
    config = load_config()
    config['enabled'] = True
    save_config(config)
    logger.info("Auto dosing enabled in configuration")
    
    # Force cleanup other processes
    try:
        import subprocess
        current_pid = os.getpid()
        logger.info(f"Current process PID: {current_pid}")
        
        # Find any other auto-dosing processes and terminate them
        result = subprocess.run(["pgrep", "-f", "python.*auto_dosing_integration.py"], 
                              capture_output=True, text=True)
        if result.returncode == 0:
            pids = [pid.strip() for pid in result.stdout.strip().split('\n') if pid.strip()]
            for pid in pids:
                if int(pid) != current_pid:
                    logger.info(f"Terminating other auto-dosing process: {pid}")
                    try:
                        subprocess.run(["kill", "-9", pid], check=False)
                        # Wait a bit to ensure process is terminated
                        await asyncio.sleep(0.5)
                    except Exception as kill_error:
                        logger.error(f"Error terminating process {pid}: {kill_error}")
    except Exception as proc_error:
        logger.error(f"Error managing processes: {proc_error}")
    
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
    
    # Update the status file to reflect enabled state
    update_status_file(enabled=True, running=True)
    
    logger.info("Auto dosing enabled and configured to start on boot")
    
    # Return success
    return {"success": True, "message": "Auto dosing enabled"}


async def disable_auto_dosing():
    """Disable auto dosing"""
    global auto_doser
    
    logger.debug("Disable auto dosing requested")
    
    try:
        # First ensure data directory exists
        ensure_data_dir()
        
        # Update the config to prevent auto-restart
        config = load_config()
        config['enabled'] = False
        save_config(config)
        logger.info("Auto dosing disabled in configuration")
        
        # Update status file immediately to reflect disabled state
        update_status_file(enabled=False, running=False, pid=0)
        
        # Force kill any existing auto-dosing processes except the current one
        try:
            current_pid = os.getpid()
            logger.info(f"Current process PID: {current_pid}")
            
            # Find all auto-dosing processes
            result = subprocess.run(["pgrep", "-f", "python.*auto_dosing_integration.py"], 
                                  capture_output=True, text=True)
            if result.returncode == 0:
                pids = [int(pid.strip()) for pid in result.stdout.strip().split('\n') if pid.strip()]
                for pid in pids:
                    if pid != current_pid:  # Don't kill ourselves
                        logger.info(f"Attempting to terminate external auto-dosing process: {pid}")
                        try:
                            subprocess.run(["kill", str(pid)], check=False)
                        except Exception as kill_error:
                            logger.error(f"Error terminating process {pid}: {kill_error}")
                            # Continue execution - don't let process killing issues stop the disabling
        except Exception as proc_error:
            logger.error(f"Error managing processes: {proc_error}")
            # Continue execution - don't let process management issues stop the disabling
        
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
    except Exception as e:
        logger.error(f"Fatal error disabling auto dosing: {e}")
        # Re-raise with a clearer message that will help in debugging
        raise Exception(f"Failed to disable auto dosing: {str(e)}")


def get_auto_dosing_status():
    """Get current auto dosing status"""
    global auto_doser
    
    # Add diagnostics to detect running processes
    import subprocess
    import os
    try:
        # Find all Python processes running auto_dosing_integration.py
        result = subprocess.run(["pgrep", "-f", "python.*auto_dosing_integration.py"], capture_output=True, text=True)
        pids = result.stdout.strip().split("\n") if result.stdout.strip() else []
        current_pid = os.getpid()
        logger.info(f"Auto-dosing processes: PIDs={pids}, Current PID={current_pid}")
        
        # Check status file for externally managed state
        status_file = os.path.join(DATA_DIR, 'auto_dosing_status.json')
        if os.path.exists(status_file):
            try:
                with open(status_file, 'r') as f:
                    status_data = json.load(f)
                    logger.info(f"Found status file: {status_data}")
                    # If we find a valid status file with a PID that's running, we'll use that state
                    if status_data.get('pid') and str(status_data.get('pid')) in pids:
                        logger.info(f"Process with PID={status_data.get('pid')} is running")
            except Exception as e:
                logger.error(f"Error reading status file: {e}")
    except Exception as e:
        logger.error(f"Error checking processes: {e}")
    
    logger.debug("Getting auto dosing status")
    
    # Check if auto_doser exists
    if not auto_doser:
        # Try to read from config
        config = load_config()
        enabled = config.get('enabled', False)
        
        logger.debug(f"No auto_doser instance, using config: enabled={enabled}")
        
        # Check for external process running
        import subprocess
        import os
        
        status_file = os.path.join(DATA_DIR, 'auto_dosing_status.json')
        external_running = False
        
        # Check if there's a process running the auto_dosing_integration.py script
        try:
            result = subprocess.run(["pgrep", "-fa", "python.*auto_dosing_integration.py"], capture_output=True, text=True)
            processes = result.stdout.strip()
            if processes:
                logger.info(f"Found external auto_dosing processes: {processes}")
                external_running = True
        except Exception as e:
            logger.error(f"Error checking for external processes: {e}")
        
        # Check status file as backup method
        try:
            if os.path.exists(status_file):
                with open(status_file, 'r') as f:
                    status_data = json.load(f)
                    if status_data.get('running') and status_data.get('pid'):
                        # Verify PID is still running
                        try:
                            os.kill(status_data.get('pid'), 0)  # Check if process exists
                            external_running = True
                            logger.info(f"Found running process from status file: PID={status_data.get('pid')}")
                        except OSError:
                            logger.info(f"Process in status file (PID={status_data.get('pid')}) is not running")
        except Exception as e:
            logger.error(f"Error checking status file: {e}")
        
        # Return status with running flag set if external process detected
        return {
            "enabled": enabled,
            "running": True,  # Set to True since we've detected a running process
            "initialized": True,  # Set initialized to match running
            "last_check_time": 0,
            "last_dosing_time": 0,
            "in_cooldown": False,
            "cooldown_remaining": 0,
            "config": {
                "check_interval": config.get('check_interval', 60),
                "dosing_cooldown": config.get('dosing_cooldown', 300),
                "between_dose_delay": config.get('between_dose_delay', 30)
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
        # If the task is done but enabled is still true, we should restart it
        if config_enabled and (not auto_doser.task or auto_doser.task.done() or auto_doser.task.cancelled()):
            logger.info("Auto-dosing task is not running but should be - restarting it")
            # Set running to false so we don't get a warning about already running
            auto_doser.running = False
            # Create a new task to start the auto dosing
            asyncio.create_task(auto_doser.start())
    
    # Save status to file for external processes to read using our helper function
    update_status_file(enabled=status["enabled"], running=True)
    
    # Ensure config is always included
    if "config" not in status:
        status["config"] = {
            "check_interval": auto_doser.check_interval,
            "dosing_cooldown": auto_doser.dosing_cooldown,
            "between_dose_delay": auto_doser.between_dose_delay
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
    valid_keys = ['check_interval', 'dosing_cooldown', 'between_dose_delay', 'enabled']
    
    # Load current config
    config = load_config()
    
    # Update only valid keys
    for key, value in new_config.items():
        if key in valid_keys:
            config[key] = value
    
    # Save the updated config
    save_config(config)
    
    # Keep track of whether we need to restart the doser
    restart_needed = False
    was_running = False
    
    # Update auto doser if it exists
    if auto_doser:
        logger.info(f"Updating auto doser configuration: check_interval={config.get('check_interval', 60)}, "
                  f"dosing_cooldown={config.get('dosing_cooldown', 300)}, "
                  f"between_dose_delay={config.get('between_dose_delay', 30)}")
        
        # Check if it was running
        was_running = auto_doser.running
        
        # Update the runtime values
        auto_doser.check_interval = config.get('check_interval', 60)
        auto_doser.dosing_cooldown = config.get('dosing_cooldown', 300)
        auto_doser.between_dose_delay = config.get('between_dose_delay', 30)
        
        # Force a restart if major time-based settings have changed
        # This ensures the monitoring loop uses the new values immediately
        if 'check_interval' in new_config or 'dosing_cooldown' in new_config:
            restart_needed = True
    
    # Create a restart task if needed and it was already running
    if restart_needed and was_running and auto_doser:
        logger.info("Configuration changes require restart - restarting auto dosing process")
        # Create a task to stop and then start the auto_doser
        async def restart_auto_doser():
            try:
                # Stop it first
                await auto_doser.stop()
                logger.info("Auto dosing stopped for restart")
                # Brief pause
                await asyncio.sleep(1)
                # Start it again
                await auto_doser.start()
                logger.info("Auto dosing restarted with new configuration")
            except Exception as e:
                logger.error(f"Error restarting auto dosing: {e}")
        
        # Create the restart task
        asyncio.create_task(restart_auto_doser())
    else:
        # Standard enable/disable logic if no restart needed
        if config.get('enabled', False) and auto_doser and not auto_doser.running:
            asyncio.create_task(enable_auto_dosing())
        elif not config.get('enabled', True) and auto_doser and auto_doser.running:
            asyncio.create_task(disable_auto_dosing())
    
    logger.info(f"Auto dosing configuration updated: {config}")
    return config


# Run the script
if __name__ == "__main__":
    asyncio.run(main()) 