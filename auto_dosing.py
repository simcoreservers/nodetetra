#!/usr/bin/env python3
"""
NuTetra Auto Dosing Module
Implements automated pH and EC monitoring and control for hydroponic systems.
"""
import asyncio
import logging
import time
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any, Callable

# Set up logging
logging.basicConfig(
    level=logging.DEBUG,  # Change to DEBUG to get more detailed logging
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("auto_dosing.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("auto_dosing")

# Default constants for pH and EC tolerance
DEFAULT_PH_BUFFER = 0.2
DEFAULT_EC_BUFFER = 0.2

class AutoDosing:
    """
    Auto Dosing controller that monitors pH and EC levels and automatically 
    adjusts them according to the plant profile targets.
    """
    
    def __init__(
        self,
        get_sensor_readings_func: Callable[[], Dict[str, float]],
        get_active_profile_func: Callable[[], Dict[str, Any]],
        dispense_pump_func: Callable[[str, float, float], None],
        check_interval: int = 60,
        dosing_cooldown: int = 60,
        between_dose_delay: int = 30
    ):
        """
        Initialize the auto dosing controller.
        
        Args:
            get_sensor_readings_func: Function to get current sensor readings
                Should return dict with 'ph', 'ec', and 'waterTemp' keys
            get_active_profile_func: Function to get the active plant profile
                Should return a profile with targetPh, targetEc, and pumpAssignments
            dispense_pump_func: Function to dispense from a pump
                Should accept pump name, amount (ml), and flow rate (ml/s)
            check_interval: Time in seconds between sensor checks
            dosing_cooldown: Time in seconds to wait after a dosing cycle
            between_dose_delay: Time in seconds to wait between individual doses
        """
        self.get_sensor_readings = get_sensor_readings_func
        self.get_active_profile = get_active_profile_func
        self.dispense_pump = dispense_pump_func
        
        # Configuration settings
        self.check_interval = check_interval
        self.dosing_cooldown = dosing_cooldown
        self.between_dose_delay = between_dose_delay
        
        # State management
        self.enabled = False
        self.running = False
        self.task: Optional[asyncio.Task] = None
        self.last_dosing_time = 0
        self.last_check_time = 0
        
        # Logging and history
        self.dosing_history: List[Dict[str, Any]] = []
        self.sensor_history: List[Dict[str, Any]] = []
        
        logger.info("Auto Dosing controller initialized")
    
    async def start(self) -> None:
        """Start the auto dosing task."""
        if self.running:
            logger.warning("Auto dosing is already running")
            return
            
        self.enabled = True
        self.running = True
        logger.info("Starting auto dosing task")
        
        # Create and start the background task with extra protection
        try:
            # Cancel any existing task first
            if self.task and not self.task.done() and not self.task.cancelled():
                logger.warning("Found existing task that's still active - cancelling it first")
                self.task.cancel()
                try:
                    await asyncio.wait_for(self.task, timeout=3.0)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass
            
            # Reset fields
            self.task = asyncio.create_task(self._monitoring_loop())
            # Ensure we don't lose the task reference
            self.task.add_done_callback(
                lambda t: logger.warning(f"Auto dosing task completed: {t.exception() if t.exception() else 'No exception'}")
            )
            # Wait a moment to ensure the task has actually started
            await asyncio.sleep(1)
            logger.info("Auto dosing task created successfully")
        except Exception as e:
            logger.error(f"Error creating auto dosing task: {e}")
            self.enabled = False
            self.running = False
    
    async def stop(self) -> None:
        """Stop the auto dosing task."""
        logger.info("Stopping auto dosing task: setting flags...")
        
        # Make sure we set these flags first before anything else
        self.enabled = False
        self.running = False
        
        if not self.task:
            logger.warning("No task to stop - already stopped")
            return
            
        try:
            logger.info("Cancelling auto dosing task")
            self.task.cancel()
            
            try:
                # Wait with timeout for task to actually stop
                await asyncio.wait_for(self.task, timeout=5.0)
                logger.info("Auto dosing task cancelled successfully")
            except asyncio.TimeoutError:
                logger.warning("Timeout waiting for task to cancel - forcing completion")
            except asyncio.CancelledError:
                logger.info("Task cancelled normally")
            except Exception as e:
                logger.error(f"Error waiting for task cancellation: {e}")
                
            # Ensure the task is done regardless
            if not self.task.done():
                logger.warning("Task not marked as done after cancellation - this indicates a potential issue")
                
        except Exception as e:
            logger.error(f"Error stopping auto dosing task: {e}")
        finally:
            self.task = None
            logger.info("Auto dosing task reference cleared")
    
    async def _monitoring_loop(self) -> None:
        """Main monitoring loop that checks sensor data and triggers dosing."""
        logger.info("Auto dosing monitoring loop started")
        
        restart_count = 0
        max_restarts = 5
        
        while True:
            try:
                # Double-check these flags at the start of each iteration
                if not self.enabled or not self.running:
                    logger.info("Auto dosing has been disabled - exiting monitoring loop")
                    break
                    
                # Check if enough time has passed since the last check
                current_time = time.time()
                if current_time - self.last_check_time < self.check_interval:
                    await asyncio.sleep(1)
                    continue
                
                self.last_check_time = current_time
                
                # Get current sensor readings
                try:
                    readings = self.get_sensor_readings()
                    current_ph = readings.get('ph')
                    current_ec = readings.get('ec')
                    water_temp = readings.get('waterTemp')
                    
                    # Record sensor readings
                    self._log_sensor_reading(current_ph, current_ec, water_temp)
                except Exception as e:
                    logger.error(f"Error getting sensor readings: {e}")
                    await asyncio.sleep(30)  # Wait before trying again
                    continue
                
                # Get active profile and determine targets
                try:
                    # Get active profile
                    profile = self.get_active_profile()
                    if not profile:
                        logger.warning("No active profile found, skipping auto-dosing check but continuing to monitor")
                        await asyncio.sleep(self.check_interval)
                        continue
                    
                    # Extract target values and pump assignments
                    try:
                        # Try to get target from profile
                        target_ph = None
                        if profile.get('targetPh', {}).get('target') is not None:
                            target_ph = profile.get('targetPh', {}).get('target')
                        # If not found, calculate from min/max if available
                        elif profile.get('targetPh', {}).get('min') is not None and profile.get('targetPh', {}).get('max') is not None:
                            min_ph = float(profile.get('targetPh', {}).get('min', 0))
                            max_ph = float(profile.get('targetPh', {}).get('max', 0))
                            target_ph = min_ph + (max_ph - min_ph) / 2
                        # Default value if all else fails
                        else:
                            target_ph = 6.0
                            
                        # Get pH buffer (tolerance)
                        ph_buffer = profile.get('targetPh', {}).get('buffer', DEFAULT_PH_BUFFER)
                        
                        # Same logic for EC
                        target_ec = None
                        if profile.get('targetEc', {}).get('target') is not None:
                            target_ec = profile.get('targetEc', {}).get('target')
                        elif profile.get('targetEc', {}).get('min') is not None and profile.get('targetEc', {}).get('max') is not None:
                            min_ec = float(profile.get('targetEc', {}).get('min', 0))
                            max_ec = float(profile.get('targetEc', {}).get('max', 0))
                            target_ec = min_ec + (max_ec - min_ec) / 2
                        else:
                            target_ec = 1.0
                            
                        ec_buffer = profile.get('targetEc', {}).get('buffer', DEFAULT_EC_BUFFER)
                        
                        # Get pump assignments
                        pump_assignments = profile.get('pumpAssignments', [])
                        
                        logger.debug(f"Extracted from profile: target_ph={target_ph}, ph_buffer={ph_buffer}, "
                                   f"target_ec={target_ec}, ec_buffer={ec_buffer}, pumps={len(pump_assignments)}")
                    except Exception as e:
                        logger.error(f"Error parsing profile values: {e}")
                        target_ph = 6.0
                        ph_buffer = DEFAULT_PH_BUFFER
                        target_ec = 1.0
                        ec_buffer = DEFAULT_EC_BUFFER
                        pump_assignments = []
                
                    # If we're in cooldown period after dosing, skip this cycle
                    # Always use the current instance value of dosing_cooldown
                    if current_time - self.last_dosing_time < self.dosing_cooldown:
                        logger.debug(f"Using current dosing_cooldown value: {self.dosing_cooldown}s")
                        logger.info(f"In cooldown period, {int(self.dosing_cooldown - (current_time - self.last_dosing_time))}s remaining")
                        await asyncio.sleep(5)  # Check more frequently during cooldown
                        continue
                    
                    # Check if dosing is needed
                    need_ph_adjustment = False
                    need_ec_adjustment = False
                    
                    try:
                        # Use the profile's buffer values for pH and EC tolerance
                        need_ph_adjustment = self._check_ph_adjustment(current_ph, target_ph, ph_buffer)
                        logger.debug(f"Using profile's pH buffer: {ph_buffer}")
                        
                        # Only check EC if pH is in acceptable range
                        if not need_ph_adjustment:
                            need_ec_adjustment = self._check_ec_adjustment(current_ec, target_ec, ec_buffer)
                            logger.debug(f"Using profile's EC buffer: {ec_buffer}")
                    except Exception as e:
                        logger.error(f"Error checking if adjustment needed: {e}")
                     
                    # Perform dosing if needed
                    if need_ph_adjustment:
                        logger.info(f"pH adjustment needed: current={current_ph}, target={target_ph}±{ph_buffer}")
                        try:
                            await self._adjust_ph(current_ph, target_ph)
                            self.last_dosing_time = time.time()
                        except Exception as e:
                            logger.error(f"Error adjusting pH: {e}")
                        
                    elif need_ec_adjustment and pump_assignments:
                        logger.info(f"EC adjustment needed: current={current_ec}, target={target_ec}±{ec_buffer}")
                        try:
                            await self._adjust_ec(current_ec, target_ec, pump_assignments)
                            self.last_dosing_time = time.time()
                        except Exception as e:
                            logger.error(f"Error adjusting EC: {e}")
                        
                    else:
                        logger.info(f"No dosing needed. pH={current_ph} (target={target_ph}±{ph_buffer}), EC={current_ec} (target={target_ec}±{ec_buffer})")
                        # Even when no dosing is needed, we should NOT cancel the task
                except Exception as e:
                    logger.error(f"Error in profile processing: {e}")
                
                # Wait for next check cycle - make sure it doesn't exit
                logger.debug(f"Waiting for {self.check_interval} seconds until next check")
                await asyncio.sleep(self.check_interval)
                logger.debug("Completed sleep, continuing monitoring loop")
                
                # Reset restart counter on successful cycle
                restart_count = 0
                
            except asyncio.CancelledError:
                logger.info("Auto dosing task cancelled by external request")
                # Break the loop immediately - don't try to continue or restart
                logger.info("Breaking monitoring loop due to cancellation")
                break
                
            except Exception as e:
                restart_count += 1
                logger.error(f"Error in auto dosing monitoring loop: {str(e)} (restart {restart_count}/{max_restarts})", exc_info=True)
                
                if restart_count >= max_restarts:
                    logger.error(f"Too many errors ({restart_count}), stopping auto dosing")
                    self.enabled = False
                    self.running = False
                    break
                    
                # Wait a bit before retrying, with increasing delay
                await asyncio.sleep(10 * restart_count)
    
    def _check_ph_adjustment(self, current_ph: float, target_ph: float, buffer: float) -> bool:
        """
        Check if pH adjustment is needed based on current readings and target.
        
        Args:
            current_ph: Current pH reading
            target_ph: Target pH value
            buffer: Acceptable deviation from target
        
        Returns:
            True if adjustment needed, False otherwise
        """
        return abs(current_ph - target_ph) > buffer
    
    def _check_ec_adjustment(self, current_ec: float, target_ec: float, buffer: float) -> bool:
        """
        Check if EC adjustment is needed based on current readings and target.
        Only increases EC, never decreases (as that would require water changes).
        
        Args:
            current_ec: Current EC reading
            target_ec: Target EC value
            buffer: Acceptable deviation from target
        
        Returns:
            True if adjustment needed, False otherwise
        """
        # Only trigger EC adjustment if current EC is too low
        # (EC that's too high requires water changes, which we don't handle)
        return current_ec < (target_ec - buffer)
    
    async def _adjust_ph(self, current_ph: float, target_ph: float) -> None:
        """
        Adjust pH by dispensing pH Up or pH Down as needed.
        
        Args:
            current_ph: Current pH reading
            target_ph: Target pH value
        """
        # Determine which pH adjustment to make
        if current_ph > target_ph:
            # Current pH is too high, need to lower it with pH Down
            pump_name = "pH Down"
            amount = 0.5  # Conservative initial dose (ml)
            logger.info(f"Dosing {amount}ml of {pump_name} to lower pH from {current_ph} towards {target_ph}")
        else:
            # Current pH is too low, need to raise it with pH Up
            pump_name = "pH Up"
            amount = 0.5  # Conservative initial dose (ml)
            logger.info(f"Dosing {amount}ml of {pump_name} to raise pH from {current_ph} towards {target_ph}")
        
        # Dispense the appropriate solution
        try:
            self.dispense_pump(pump_name, amount, 1.0)  # 1.0 ml/s flow rate
            
            # Log the dosing action
            self._log_dosing_action(pump_name, amount, "pH adjustment", 
                                  current_value=current_ph, target_value=target_ph)
            
        except Exception as e:
            logger.error(f"Error dispensing {pump_name}: {str(e)}")
    
    async def _adjust_ec(self, current_ec: float, target_ec: float, 
                       pump_assignments: List[Dict[str, Any]]) -> None:
        """
        Adjust EC by dispensing nutrients according to pump assignments.
        
        Args:
            current_ec: Current EC reading
            target_ec: Target EC value
            pump_assignments: List of pump assignments with dosage information
        """
        logger.info(f"Starting nutrient dosing cycle to raise EC from {current_ec} towards {target_ec}")
        
        # Filter to only pumps with active dosage
        nutrient_pumps = [p for p in pump_assignments 
                        if p.get('dosage', 0) > 0 and p.get('pumpName', '').startswith('Pump')]
        
        if not nutrient_pumps:
            logger.warning("No nutrient pumps with dosage assignments found")
            return
        
        # Dose each nutrient in sequence
        for pump_info in nutrient_pumps:
            pump_name = pump_info.get('pumpName')
            dosage = pump_info.get('dosage', 0)
            
            if not pump_name or not dosage:
                continue
                
            product_name = pump_info.get('productName', 'Unknown nutrient')
            
            logger.info(f"Dosing {dosage}ml of {product_name} from {pump_name}")
            
            try:
                # Dispense the nutrient
                self.dispense_pump(pump_name, dosage, 1.0)  # 1.0 ml/s flow rate
                
                # Log the dosing action
                self._log_dosing_action(pump_name, dosage, "EC adjustment",
                                      current_value=current_ec, target_value=target_ec,
                                      product_name=product_name)
                
                # Wait between doses - always use the current instance value
                logger.debug(f"Using current between_dose_delay value: {self.between_dose_delay}s")
                await asyncio.sleep(self.between_dose_delay)
                
            except Exception as e:
                logger.error(f"Error dispensing {product_name} from {pump_name}: {str(e)}")
    
    def _log_dosing_action(self, pump_name: str, amount: float, reason: str, 
                         current_value: float, target_value: float,
                         product_name: str = None) -> None:
        """
        Log a dosing action to history.
        
        Args:
            pump_name: Name of the pump used
            amount: Amount dispensed in ml
            reason: Reason for dosing (e.g., "pH adjustment", "EC adjustment")
            current_value: Current reading before dosing
            target_value: Target value we're aiming for
            product_name: Optional product name for nutrients
        """
        timestamp = datetime.now().isoformat()
        
        dosing_record = {
            "timestamp": timestamp,
            "pump": pump_name,
            "amount": amount,
            "reason": reason,
            "current_value": current_value,
            "target_value": target_value
        }
        
        if product_name:
            dosing_record["product"] = product_name
            
        self.dosing_history.append(dosing_record)
        
        # Keep history to a reasonable size
        if len(self.dosing_history) > 1000:
            self.dosing_history = self.dosing_history[-1000:]
            
        # Also log to the logger
        logger.info(f"Dosed {amount}ml from {pump_name} for {reason}. " +
                  f"Current: {current_value}, Target: {target_value}" +
                  (f", Product: {product_name}" if product_name else ""))
    
    def _log_sensor_reading(self, ph: float, ec: float, temp: float) -> None:
        """
        Log sensor readings to history.
        
        Args:
            ph: Current pH reading
            ec: Current EC reading
            temp: Current water temperature
        """
        timestamp = datetime.now().isoformat()
        
        reading = {
            "timestamp": timestamp,
            "ph": ph,
            "ec": ec,
            "waterTemp": temp
        }
        
        self.sensor_history.append(reading)
        
        # Keep history to a reasonable size
        if len(self.sensor_history) > 1000:
            self.sensor_history = self.sensor_history[-1000:]
    
    def get_status(self) -> Dict[str, Any]:
        """Get the current status of the auto dosing system."""
        return {
            "enabled": self.enabled,
            "running": self.running,
            "last_check_time": self.last_check_time,
            "last_dosing_time": self.last_dosing_time,
            "in_cooldown": (time.time() - self.last_dosing_time) < self.dosing_cooldown,
            "cooldown_remaining": max(0, self.dosing_cooldown - (time.time() - self.last_dosing_time)),
            "config": {
                "check_interval": self.check_interval,
                "dosing_cooldown": self.dosing_cooldown,
                "between_dose_delay": self.between_dose_delay
            }
        }
    
    def get_history(self, limit: int = 50) -> Dict[str, List[Dict[str, Any]]]:
        """
        Get the dosing and sensor history.
        
        Args:
            limit: Maximum number of history entries to return
            
        Returns:
            Dictionary with dosing_history and sensor_history lists
        """
        return {
            "dosing_history": self.dosing_history[-limit:] if self.dosing_history else [],
            "sensor_history": self.sensor_history[-limit:] if self.sensor_history else []
        }
    
    def export_history_to_file(self, filename: str = "auto_dosing_history.json") -> None:
        """
        Export dosing and sensor history to a JSON file.
        
        Args:
            filename: Name of the file to save history to
        """
        history = {
            "dosing_history": self.dosing_history,
            "sensor_history": self.sensor_history,
            "exported_at": datetime.now().isoformat()
        }
        
        with open(filename, 'w') as f:
            json.dump(history, f, indent=2)
            
        logger.info(f"Exported dosing history to {filename}")

# Example of how to use this class in a main program:
if __name__ == "__main__":
    # These would be replaced with actual functions from your system
    def mock_get_sensor_readings():
        """Mock function to get sensor readings"""
        return {
            "ph": 6.2,
            "ec": 1.2,
            "waterTemp": 23.5
        }
    
    def mock_get_active_profile():
        """Mock function to get active profile"""
        return {
            "name": "Lettuce",
            "targetPh": {"target": 6.0, "buffer": 0.2},
            "targetEc": {"target": 1.4, "buffer": 0.2},
            "pumpAssignments": [
                {"pumpName": "pH Up", "dosage": 0.5},
                {"pumpName": "pH Down", "dosage": 0.5},
                {"pumpName": "Pump 1", "dosage": 1.0, "productName": "Grow A"},
                {"pumpName": "Pump 2", "dosage": 1.0, "productName": "Grow B"}
            ]
        }
    
    def mock_dispense_pump(pump_name, amount, flow_rate):
        """Mock function to dispense from a pump"""
        print(f"MOCK: Dispensing {amount}ml from {pump_name} at {flow_rate}ml/s")
        # In a real system, this would control the actual pump
    
    async def main():
        # Create auto dosing controller with mock functions
        auto_doser = AutoDosing(
            mock_get_sensor_readings,
            mock_get_active_profile,
            mock_dispense_pump,
            check_interval=10,  # Short interval for testing
            dosing_cooldown=30,
            between_dose_delay=5
        )
        
        # Start auto dosing
        await auto_doser.start()
        
        # Run for a while as a test
        try:
            await asyncio.sleep(120)  # Run for 2 minutes
        except asyncio.CancelledError:
            pass
        
        # Stop auto dosing
        await auto_doser.stop()
        
        # Export history
        auto_doser.export_history_to_file()
    
    # Run the example
    asyncio.run(main())