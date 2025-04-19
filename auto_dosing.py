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
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("auto_dosing.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("auto_dosing")

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
        between_dose_delay: int = 30,
        ph_tolerance: float = 0.2,
        ec_tolerance: float = 0.2
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
            ph_tolerance: Tolerance range for pH (±)
            ec_tolerance: Tolerance range for EC (±)
        """
        self.get_sensor_readings = get_sensor_readings_func
        self.get_active_profile = get_active_profile_func
        self.dispense_pump = dispense_pump_func
        
        # Configuration settings
        self.check_interval = check_interval
        self.dosing_cooldown = dosing_cooldown
        self.between_dose_delay = between_dose_delay
        self.ph_tolerance = ph_tolerance
        self.ec_tolerance = ec_tolerance
        
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
        
        # Create and start the background task
        self.task = asyncio.create_task(self._monitoring_loop())
    
    async def stop(self) -> None:
        """Stop the auto dosing task."""
        if not self.running:
            logger.warning("Auto dosing is not running")
            return
            
        self.enabled = False
        self.running = False
        
        if self.task:
            logger.info("Stopping auto dosing task")
            self.task.cancel()
            try:
                await self.task
            except asyncio.CancelledError:
                pass
            self.task = None
    
    async def _monitoring_loop(self) -> None:
        """Main monitoring loop that checks sensor data and triggers dosing."""
        logger.info("Auto dosing monitoring loop started")
        
        while self.enabled:
            try:
                # Check if enough time has passed since the last check
                current_time = time.time()
                if current_time - self.last_check_time < self.check_interval:
                    await asyncio.sleep(1)
                    continue
                
                self.last_check_time = current_time
                
                # Get current sensor readings
                readings = self.get_sensor_readings()
                current_ph = readings.get('ph')
                current_ec = readings.get('ec')
                water_temp = readings.get('waterTemp')
                
                # Record sensor readings
                self._log_sensor_reading(current_ph, current_ec, water_temp)
                
                # Get active profile
                profile = self.get_active_profile()
                if not profile:
                    logger.warning("No active profile found, skipping auto-dosing check")
                    await asyncio.sleep(self.check_interval)
                    continue
                
                # Extract target values and pump assignments
                target_ph = profile.get('targetPh', {}).get('target')
                ph_buffer = profile.get('targetPh', {}).get('buffer', self.ph_tolerance)
                target_ec = profile.get('targetEc', {}).get('target')
                ec_buffer = profile.get('targetEc', {}).get('buffer', self.ec_tolerance)
                pump_assignments = profile.get('pumpAssignments', [])
                
                if not all([target_ph, target_ec]):
                    logger.warning("Active profile missing target values")
                    await asyncio.sleep(self.check_interval)
                    continue
                
                # If we're in cooldown period after dosing, skip this cycle
                if current_time - self.last_dosing_time < self.dosing_cooldown:
                    logger.info(f"In cooldown period, {int(self.dosing_cooldown - (current_time - self.last_dosing_time))}s remaining")
                    await asyncio.sleep(5)  # Check more frequently during cooldown
                    continue
                
                # Check if dosing is needed
                need_ph_adjustment = self._check_ph_adjustment(current_ph, target_ph, ph_buffer)
                need_ec_adjustment = False
                
                # Only check EC if pH is in acceptable range
                if not need_ph_adjustment:
                    need_ec_adjustment = self._check_ec_adjustment(current_ec, target_ec, ec_buffer)
                
                # Perform dosing if needed
                if need_ph_adjustment:
                    logger.info(f"pH adjustment needed: current={current_ph}, target={target_ph}±{ph_buffer}")
                    await self._adjust_ph(current_ph, target_ph)
                    self.last_dosing_time = time.time()
                    
                elif need_ec_adjustment and pump_assignments:
                    logger.info(f"EC adjustment needed: current={current_ec}, target={target_ec}±{ec_buffer}")
                    await self._adjust_ec(current_ec, target_ec, pump_assignments)
                    self.last_dosing_time = time.time()
                    
                else:
                    logger.info(f"No dosing needed. pH={current_ph} (target={target_ph}±{ph_buffer}), EC={current_ec} (target={target_ec}±{ec_buffer})")
                
                # Wait for next check cycle
                await asyncio.sleep(self.check_interval)
                
            except asyncio.CancelledError:
                logger.info("Auto dosing task cancelled")
                break
                
            except Exception as e:
                logger.error(f"Error in auto dosing monitoring loop: {str(e)}", exc_info=True)
                await asyncio.sleep(10)  # Wait a bit before trying again
    
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
                
                # Wait between doses
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
                "between_dose_delay": self.between_dose_delay,
                "ph_tolerance": self.ph_tolerance,
                "ec_tolerance": self.ec_tolerance
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