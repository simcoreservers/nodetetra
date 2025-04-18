/**
 * Test script to verify sensor readings and simulation
 */
const path = require('path');
const fs = require('fs');

// Initialize console output
console.log('NuTetra Sensor Test Script');
console.log('=========================');
console.log('Current working directory:', process.cwd());

// Check if we have access to data directory
const DATA_DIR = path.join(process.cwd(), 'data');
console.log(`Checking access to ${DATA_DIR}...`);

if (fs.existsSync(DATA_DIR)) {
  console.log('✓ Data directory exists.');
} else {
  console.log('✗ Data directory does not exist!');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('✓ Created data directory.');
  } catch (err) {
    console.error('✗ Failed to create data directory:', err);
  }
}

// Check simulation configuration
const SIMULATION_CONFIG_FILE = path.join(DATA_DIR, 'simulation.json');
console.log(`\nChecking simulation config at ${SIMULATION_CONFIG_FILE}...`);

let simConfig;
if (fs.existsSync(SIMULATION_CONFIG_FILE)) {
  try {
    const configData = fs.readFileSync(SIMULATION_CONFIG_FILE, 'utf8');
    simConfig = JSON.parse(configData);
    console.log('✓ Simulation config loaded successfully.');
    console.log('Current configuration:');
    console.log(`  Enabled: ${simConfig.enabled}`);
    console.log(`  pH Baseline: ${simConfig.baseline.ph}`);
    console.log(`  EC Baseline: ${simConfig.baseline.ec}`);
    console.log(`  Last Updated: ${simConfig.lastUpdated}`);
    
    // Verify values are reasonable
    if (simConfig.baseline.ph < 0 || simConfig.baseline.ph > 14) {
      console.log(`✗ WARNING: pH baseline value ${simConfig.baseline.ph} is outside valid range (0-14).`);
      simConfig.baseline.ph = 6.0;
      console.log(`  Setting to ${simConfig.baseline.ph}`);
    }
    
    if (simConfig.baseline.ec < 0 || simConfig.baseline.ec > 5) {
      console.log(`✗ WARNING: EC baseline value ${simConfig.baseline.ec} is outside realistic range (0-5).`);
      simConfig.baseline.ec = 1.4;
      console.log(`  Setting to ${simConfig.baseline.ec}`);
    }
    
    // Update simulation to make sure it's enabled
    simConfig.enabled = true;
    simConfig.lastUpdated = new Date().toISOString();
    fs.writeFileSync(SIMULATION_CONFIG_FILE, JSON.stringify(simConfig, null, 2), 'utf8');
    console.log('✓ Updated simulation config: enabled=true, lastUpdated=now');
  } catch (err) {
    console.error('✗ Error reading or parsing simulation config:', err);
    
    // Create default config
    simConfig = {
      enabled: true,
      baseline: {
        ph: 6.0,
        ec: 1.4,
        waterTemp: 22.0
      },
      variation: {
        ph: 0.05,
        ec: 0.05,
        waterTemp: 0.2
      },
      drift: {
        ph: 0.0004,
        ec: 0.0002,
        waterTemp: 0.001
      },
      lastUpdated: new Date().toISOString()
    };
    
    try {
      fs.writeFileSync(SIMULATION_CONFIG_FILE, JSON.stringify(simConfig, null, 2), 'utf8');
      console.log('✓ Created new default simulation config.');
    } catch (writeErr) {
      console.error('✗ Failed to write default simulation config:', writeErr);
    }
  }
} else {
  console.log('✗ Simulation config file not found!');
  
  // Create default config
  simConfig = {
    enabled: true,
    baseline: {
      ph: 6.0,
      ec: 1.4,
      waterTemp: 22.0
    },
    variation: {
      ph: 0.05,
      ec: 0.05,
      waterTemp: 0.2
    },
    drift: {
      ph: 0.0004,
      ec: 0.0002,
      waterTemp: 0.001
    },
    lastUpdated: new Date().toISOString()
  };
  
  try {
    fs.writeFileSync(SIMULATION_CONFIG_FILE, JSON.stringify(simConfig, null, 2), 'utf8');
    console.log('✓ Created new default simulation config.');
  } catch (err) {
    console.error('✗ Failed to create simulation config:', err);
  }
}

// Check auto-dosing configuration
const AUTODOSING_CONFIG_FILE = path.join(DATA_DIR, 'autodosing.json');
console.log(`\nChecking auto-dosing config at ${AUTODOSING_CONFIG_FILE}...`);

if (fs.existsSync(AUTODOSING_CONFIG_FILE)) {
  try {
    const configData = fs.readFileSync(AUTODOSING_CONFIG_FILE, 'utf8');
    const dosingConfig = JSON.parse(configData);
    console.log('✓ Auto-dosing config loaded successfully.');
    console.log('Current configuration:');
    console.log(`  Enabled: ${dosingConfig.enabled}`);
    console.log(`  pH Target: ${dosingConfig.targets.ph.target} ± ${dosingConfig.targets.ph.tolerance}`);
    console.log(`  EC Target: ${dosingConfig.targets.ec.target} ± ${dosingConfig.targets.ec.tolerance}`);
    
    // Check critical error handling flags
    if (dosingConfig.errorHandling && dosingConfig.errorHandling.circuitOpen) {
      console.log('✗ WARNING: Circuit breaker is OPEN, auto-dosing is blocked');
      console.log(`  Current failure count: ${dosingConfig.errorHandling.currentFailCount}`);
      console.log(`  Last failure time: ${dosingConfig.errorHandling.lastFailure ? new Date(dosingConfig.errorHandling.lastFailure).toISOString() : 'none'}`);
      
      // Reset circuit breaker
      dosingConfig.errorHandling.circuitOpen = false;
      dosingConfig.errorHandling.currentFailCount = 0;
      dosingConfig.errorHandling.lastFailure = null;
      
      try {
        fs.writeFileSync(AUTODOSING_CONFIG_FILE, JSON.stringify(dosingConfig, null, 2), 'utf8');
        console.log('✓ Reset circuit breaker and saved changes.');
      } catch (writeErr) {
        console.error('✗ Failed to reset circuit breaker:', writeErr);
      }
    } else {
      console.log('✓ Circuit breaker is closed (normal).');
    }
  } catch (err) {
    console.error('✗ Error reading or parsing auto-dosing config:', err);
  }
} else {
  console.log('✗ Auto-dosing config file not found!');
}

console.log('\nSensor test completed.');
console.log('Please restart your NuTetra application to apply changes.');
