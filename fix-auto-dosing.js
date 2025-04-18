/**
 * Fix for Auto-Dosing System
 * This script fixes common issues with the auto-dosing system
 */

const fs = require('fs');
const path = require('path');

// Define paths
const DATA_DIR = path.join(process.cwd(), 'data');
const AUTO_DOSING_CONFIG = path.join(DATA_DIR, 'autodosing.json');
const SIMULATION_CONFIG = path.join(DATA_DIR, 'simulation.json');

console.log('NuTetra Auto-Dosing Fix Tool');
console.log('===========================');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  console.log(`Creating data directory at ${DATA_DIR}...`);
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log('✓ Data directory created');
  } catch (err) {
    console.error('✗ Failed to create data directory:', err.message);
    process.exit(1);
  }
}

// Fix simulation configuration
console.log('\nFixing simulation configuration...');
try {
  let simConfig;
  
  if (fs.existsSync(SIMULATION_CONFIG)) {
    // Read existing config
    const configData = fs.readFileSync(SIMULATION_CONFIG, 'utf8');
    simConfig = JSON.parse(configData);
    console.log('✓ Loaded existing simulation config');
  } else {
    // Create default config
    console.log('✗ No simulation config found, creating default...');
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
  }
  
  // Force safe values
  console.log('Setting safe simulation values...');
  simConfig.enabled = true;  // Force simulation on
  simConfig.baseline.ph = 6.0;
  simConfig.baseline.ec = 1.4;
  simConfig.baseline.waterTemp = 22.0;
  simConfig.lastUpdated = new Date().toISOString();
  
  // Save config
  fs.writeFileSync(SIMULATION_CONFIG, JSON.stringify(simConfig, null, 2), 'utf8');
  console.log('✓ Simulation config fixed and saved');
} catch (err) {
  console.error('✗ Failed to fix simulation config:', err.message);
}

// Fix auto-dosing configuration
console.log('\nFixing auto-dosing configuration...');
try {
  let dosingConfig;
  
  if (fs.existsSync(AUTO_DOSING_CONFIG)) {
    // Read existing config
    const configData = fs.readFileSync(AUTO_DOSING_CONFIG, 'utf8');
    dosingConfig = JSON.parse(configData);
    console.log('✓ Loaded existing auto-dosing config');
  } else {
    // Create default config
    console.log('✗ No auto-dosing config found, creating default...');
    dosingConfig = {
      enabled: false,
      targets: {
        ph: {
          target: 6.0,
          tolerance: 0.2
        },
        ec: {
          target: 1.4,
          tolerance: 0.1
        }
      },
      dosing: {
        phUp: {
          pumpName: "pH Up",
          doseAmount: 0.5,
          flowRate: 1.0,
          minInterval: 120
        },
        phDown: {
          pumpName: "pH Down",
          doseAmount: 0.5,
          flowRate: 1.0,
          minInterval: 120
        },
        nutrient: {
          pumpName: "Nutrient",
          doseAmount: 0.5,
          flowRate: 1.0,
          minInterval: 120
        },
        nutrientPumps: {}
      },
      lastDose: {
        phUp: null,
        phDown: null,
        nutrient: null,
        nutrientPumps: {}
      },
      pidControllers: {
        ph: {
          kp: 0.6,
          ki: 0.05,
          kd: 0.1,
          integral: 0,
          lastError: 0,
          lastTime: 0
        },
        ec: {
          kp: 0.4,
          ki: 0.15,
          kd: 0.05,
          integral: 0,
          lastError: 0,
          lastTime: 0
        }
      },
      errorHandling: {
        maxRetries: 5,
        backoffFactor: 1.5,
        baseBackoffMs: 1000,
        currentFailCount: 0,
        lastFailure: null,
        circuitBreakerThreshold: 10,
        circuitBreakerResetTime: 300000,
        circuitOpen: false
      },
      telemetry: {
        doseHistory: [],
        maxHistoryLength: 100
      }
    };
  }
  
  // Reset error handling and PID controllers
  console.log('Resetting circuit breaker and error handling...');
  if (dosingConfig.errorHandling) {
    dosingConfig.errorHandling.circuitOpen = false;
    dosingConfig.errorHandling.currentFailCount = 0;
    dosingConfig.errorHandling.lastFailure = null;
  }
  
  console.log('Resetting PID controllers...');
  if (dosingConfig.pidControllers && dosingConfig.pidControllers.ph) {
    dosingConfig.pidControllers.ph.integral = 0;
    dosingConfig.pidControllers.ph.lastError = 0;
    dosingConfig.pidControllers.ph.lastTime = 0;
  }
  
  if (dosingConfig.pidControllers && dosingConfig.pidControllers.ec) {
    dosingConfig.pidControllers.ec.integral = 0;
    dosingConfig.pidControllers.ec.lastError = 0;
    dosingConfig.pidControllers.ec.lastTime = 0;
  }
  
  // Reset dose timestamps
  console.log('Resetting dose timestamps...');
  dosingConfig.lastDose.phUp = null;
  dosingConfig.lastDose.phDown = null;
  dosingConfig.lastDose.nutrient = null;
  dosingConfig.lastDose.nutrientPumps = {};
  
  // Save config
  fs.writeFileSync(AUTO_DOSING_CONFIG, JSON.stringify(dosingConfig, null, 2), 'utf8');
  console.log('✓ Auto-dosing config fixed and saved');
} catch (err) {
  console.error('✗ Failed to fix auto-dosing config:', err.message);
}

// Create a file to check if simulation and auto-dosing are functioning
console.log('\nCreating test file for simulation checks...');
try {
  const TEST_FILE = path.join(DATA_DIR, 'simulation-test.js');
  
  const testContent = `
// Test script for verifying simulation and auto-dosing
const { getSimulatedSensorReadings, isSimulationEnabled } = require('../src/app/lib/simulation');
const { performAutoDosing, getDosingConfig } = require('../src/app/lib/autoDosing');

async function runTests() {
  console.log('Test 1: Checking if simulation is enabled');
  const simEnabled = await isSimulationEnabled();
  console.log(\`Simulation enabled: \${simEnabled}\`);
  
  console.log('\\nTest 2: Getting simulated sensor readings');
  try {
    const readings = await getSimulatedSensorReadings();
    console.log('Simulated readings:', readings);
    
    if (readings.ph === undefined || readings.ec === undefined) {
      console.error('ERROR: Missing pH or EC values in simulated readings!');
    } else {
      console.log('✓ Simulated readings contain valid pH and EC values');
    }
  } catch (err) {
    console.error('Failed to get simulated readings:', err.message);
  }
  
  console.log('\\nTest 3: Checking auto-dosing config');
  const config = getDosingConfig();
  console.log(\`Auto-dosing enabled: \${config.enabled}\`);
  console.log(\`Circuit breaker open: \${config.errorHandling?.circuitOpen || false}\`);
  
  console.log('\\nTest 4: Running auto-dosing cycle');
  try {
    const result = await performAutoDosing();
    console.log('Auto-dosing result:', result);
  } catch (err) {
    console.error('Auto-dosing test failed:', err.message);
  }
}

runTests().catch(err => console.error('Test failed:', err));
`;
  
  fs.writeFileSync(TEST_FILE, testContent, 'utf8');
  console.log(`✓ Created test file at ${TEST_FILE}`);
} catch (err) {
  console.error('✗ Failed to create test file:', err.message);
}

console.log('\nFix complete. To apply the changes:');
console.log('1. Restart your NuTetra application');
console.log('2. Check if auto-dosing now works properly');
console.log('3. If issues persist, run: node diagnose-system.js');
