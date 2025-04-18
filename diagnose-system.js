/**
 * NuTetra System Diagnostic Tool
 * Checks system configuration and identifies potential issues
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// Get basic system information
console.log('NuTetra System Diagnostic Tool');
console.log('=============================');
console.log('System Information:');
console.log(`- Platform: ${os.platform()}`);
console.log(`- Architecture: ${os.arch()}`);
console.log(`- Node.js Version: ${process.version}`);
console.log(`- Current Working Directory: ${process.cwd()}`);

// Check if running on Raspberry Pi
const isRaspberryPi = os.platform() === 'linux' && 
                    fs.existsSync('/proc/device-tree/model') &&
                    fs.readFileSync('/proc/device-tree/model').toString().includes('Raspberry Pi');
console.log(`- Running on Raspberry Pi: ${isRaspberryPi || 'Unknown'}`);

// Check if auto-dosing is explicitly disabled
console.log('\nChecking auto-dosing status...');

const DATA_DIR = path.join(process.cwd(), 'data');
const AUTO_DOSING_CONFIG_PATH = path.join(DATA_DIR, 'autodosing.json');

if (fs.existsSync(AUTO_DOSING_CONFIG_PATH)) {
  try {
    const dosingConfig = JSON.parse(fs.readFileSync(AUTO_DOSING_CONFIG_PATH, 'utf8'));
    console.log(`- Auto-dosing enabled: ${dosingConfig.enabled}`);
    
    if (dosingConfig.errorHandling && dosingConfig.errorHandling.circuitOpen) {
      console.log('- ERROR: Circuit breaker is open - auto-dosing is blocked');
      console.log(`  Failure count: ${dosingConfig.errorHandling.currentFailCount}`);
      console.log(`  Last failure time: ${new Date(dosingConfig.errorHandling.lastFailure).toISOString()}`);
    } else {
      console.log('- Circuit breaker status: Closed (normal)');
    }
  } catch (err) {
    console.log(`- ERROR: Failed to parse auto-dosing config: ${err.message}`);
  }
} else {
  console.log('- Auto-dosing config not found');
}

// Check simulation status
console.log('\nChecking simulation status...');
const SIMULATION_CONFIG_PATH = path.join(DATA_DIR, 'simulation.json');

if (fs.existsSync(SIMULATION_CONFIG_PATH)) {
  try {
    const simConfig = JSON.parse(fs.readFileSync(SIMULATION_CONFIG_PATH, 'utf8'));
    console.log(`- Simulation enabled: ${simConfig.enabled}`);
    console.log(`- Baseline pH: ${simConfig.baseline.ph}`);
    console.log(`- Baseline EC: ${simConfig.baseline.ec}`);
    console.log(`- Last updated: ${simConfig.lastUpdated}`);
    
    // Verify the simulated values are reasonable
    if (simConfig.baseline.ph < 0 || simConfig.baseline.ph > 14) {
      console.log(`- WARNING: pH baseline ${simConfig.baseline.ph} is outside valid range (0-14)`);
    }
    
    if (simConfig.baseline.ec < 0 || simConfig.baseline.ec > 5) {
      console.log(`- WARNING: EC baseline ${simConfig.baseline.ec} is outside realistic range (0-5)`);
    }
  } catch (err) {
    console.log(`- ERROR: Failed to parse simulation config: ${err.message}`);
  }
} else {
  console.log('- Simulation config not found');
}

// Check for I2C capabilities if not in simulation mode
if (isRaspberryPi) {
  console.log('\nChecking I2C configuration...');
  
  exec('ls -l /dev/i2c*', (err, stdout, stderr) => {
    if (err) {
      console.log('- ERROR: No I2C devices found');
      console.log('  I2C may not be enabled in raspi-config');
    } else {
      console.log('- I2C devices:');
      console.log(stdout);
      
      // Check if i2c-tools is installed
      exec('which i2cdetect', (err, stdout, stderr) => {
        if (err) {
          console.log('- WARNING: i2c-tools not found, cannot detect sensors');
          console.log('  Run "sudo apt-get install i2c-tools" to install');
        } else {
          console.log('- i2c-tools is installed');
          
          // Scan I2C bus for devices
          exec('i2cdetect -y 1', (err, stdout, stderr) => {
            if (err) {
              console.log(`- ERROR scanning I2C bus: ${err.message}`);
            } else {
              console.log('- I2C device scan:');
              console.log(stdout);
              
              // Look for Atlas Scientific addresses
              const atlasAddresses = [
                '0x63', // pH
                '0x64', // EC
                '0x66'  // RTD (temperature)
              ];
              
              console.log('- Checking for Atlas Scientific sensors:');
              let foundSensors = false;
              
              atlasAddresses.forEach(addr => {
                if (stdout.includes(addr.substring(2))) {
                  console.log(`  ✓ Found sensor at address ${addr}`);
                  foundSensors = true;
                } else {
                  console.log(`  ✗ No sensor found at address ${addr}`);
                }
              });
              
              if (!foundSensors) {
                console.log('- WARNING: No Atlas Scientific sensors detected on I2C bus');
                console.log('  Please verify sensor connections and addresses');
              }
            }
          });
        }
      });
    }
  });
} else {
  console.log('\nNot running on Raspberry Pi - skipping I2C checks');
  console.log('Simulation mode should be enabled when not running on Raspberry Pi.');
}

// Check for forced flag files
console.log('\nChecking for emergency flag files...');

// Create directory for flags if it doesn't exist
const FLAGS_DIR = path.join(DATA_DIR, 'flags');
if (!fs.existsSync(FLAGS_DIR)) {
  try {
    fs.mkdirSync(FLAGS_DIR, { recursive: true });
    console.log(`- Created flags directory at ${FLAGS_DIR}`);
  } catch (err) {
    console.log(`- ERROR: Could not create flags directory: ${err.message}`);
  }
}

// Create a force-simulation flag file to force simulation mode
const FORCE_SIMULATION_FLAG = path.join(FLAGS_DIR, 'FORCE_SIMULATION');
try {
  fs.writeFileSync(FORCE_SIMULATION_FLAG, 'Created by diagnostic tool on ' + new Date().toISOString());
  console.log(`- Created ${FORCE_SIMULATION_FLAG} file to force simulation mode`);
} catch (err) {
  console.log(`- ERROR: Could not create force simulation flag: ${err.message}`);
}

// Create a reset all systems flag
const RESET_SYSTEMS_FLAG = path.join(FLAGS_DIR, 'RESET_ALL_SYSTEMS');
try {
  fs.writeFileSync(RESET_SYSTEMS_FLAG, 'Created by diagnostic tool on ' + new Date().toISOString());
  console.log(`- Created ${RESET_SYSTEMS_FLAG} file to request system reset on next startup`);
} catch (err) {
  console.log(`- ERROR: Could not create reset systems flag: ${err.message}`);
}

console.log('\nDiagnostic Recommendations:');
console.log('1. Verify sensor connections if using real sensors');
console.log('2. Make sure simulation mode is enabled if not using real sensors');
console.log('3. Try running the reset-auto-dosing.js script:');
console.log('   node reset-auto-dosing.js');
console.log('4. Restart the NuTetra application after making changes');
console.log('\nDiagnostic complete. Check for errors or warnings above.');
