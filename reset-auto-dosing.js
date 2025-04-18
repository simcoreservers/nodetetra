/**
 * Reset Auto-Dosing Script
 * This script resets the auto-dosing system and simulation
 */

const fs = require('fs');
const path = require('path');

// Path to configuration files
const DATA_DIR = path.join(process.cwd(), 'data');
const SIMULATION_CONFIG_FILE = path.join(DATA_DIR, 'simulation.json');
const AUTODOSING_CONFIG_FILE = path.join(DATA_DIR, 'autodosing.json');

// Reset Simulation
console.log('Resetting simulation configuration...');
try {
  // Read current simulation config
  const simConfigRaw = fs.readFileSync(SIMULATION_CONFIG_FILE, 'utf8');
  const simConfig = JSON.parse(simConfigRaw);
  
  // Make sure pH and EC are valid, reasonable values
  simConfig.baseline.ph = 6.0;
  simConfig.baseline.ec = 1.4;
  simConfig.baseline.waterTemp = 22.0;
  
  // Reduce variation to make values more stable
  simConfig.variation.ph = 0.05;
  simConfig.variation.ec = 0.05;
  
  // Update timestamp
  simConfig.lastUpdated = new Date().toISOString();
  
  // Save the updated config
  fs.writeFileSync(SIMULATION_CONFIG_FILE, JSON.stringify(simConfig, null, 2), 'utf8');
  console.log('Simulation config reset successfully!');
} catch (err) {
  console.error('Error resetting simulation config:', err);
}

// Reset Auto-Dosing
console.log('Resetting auto-dosing configuration...');
try {
  // Read current auto-dosing config
  const dosingConfigRaw = fs.readFileSync(AUTODOSING_CONFIG_FILE, 'utf8');
  const dosingConfig = JSON.parse(dosingConfigRaw);
  
  // Reset circuit breaker and error tracking
  if (dosingConfig.errorHandling) {
    dosingConfig.errorHandling.circuitOpen = false;
    dosingConfig.errorHandling.currentFailCount = 0;
    dosingConfig.errorHandling.lastFailure = null;
  }
  
  // Reset PID controllers
  if (dosingConfig.pidControllers) {
    // pH controller
    dosingConfig.pidControllers.ph.integral = 0;
    dosingConfig.pidControllers.ph.lastError = 0;
    dosingConfig.pidControllers.ph.lastTime = 0;
    
    // EC controller
    dosingConfig.pidControllers.ec.integral = 0;
    dosingConfig.pidControllers.ec.lastError = 0;
    dosingConfig.pidControllers.ec.lastTime = 0;
  }
  
  // Reset last dose timestamps
  dosingConfig.lastDose.phUp = null;
  dosingConfig.lastDose.phDown = null;
  dosingConfig.lastDose.nutrient = null;
  dosingConfig.lastDose.nutrientPumps = {};
  
  // Save the updated config
  fs.writeFileSync(AUTODOSING_CONFIG_FILE, JSON.stringify(dosingConfig, null, 2), 'utf8');
  console.log('Auto-dosing config reset successfully!');
} catch (err) {
  console.error('Error resetting auto-dosing config:', err);
}

console.log('Reset complete. Please restart your NuTetra application.');
