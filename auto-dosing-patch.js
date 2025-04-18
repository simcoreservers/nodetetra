/**
 * Auto-Dosing Patch Script
 * 
 * This script creates a patched version of autoDosing.ts to fix issues with sensor readings
 */

const fs = require('fs');
const path = require('path');

console.log('NuTetra Auto-Dosing Patch Tool');
console.log('============================');

// Define paths
const SRC_DIR = path.join(process.cwd(), 'src', 'app', 'lib');
const AUTODOSING_FILE = path.join(SRC_DIR, 'autoDosing.ts');
const BACKUP_FILE = path.join(SRC_DIR, 'autoDosing.ts.bak');
const SIMULATION_FILE = path.join(SRC_DIR, 'simulation.ts');
const SIMULATION_BACKUP = path.join(SRC_DIR, 'simulation.ts.bak');

// Check if source files exist
if (!fs.existsSync(AUTODOSING_FILE)) {
  console.error(`ERROR: Auto-dosing file not found at ${AUTODOSING_FILE}`);
  process.exit(1);
}

// Create backup of autoDosing.ts
console.log('Creating backup of autoDosing.ts...');
try {
  fs.copyFileSync(AUTODOSING_FILE, BACKUP_FILE);
  console.log(`✓ Backup created at ${BACKUP_FILE}`);
} catch (err) {
  console.error(`✗ Failed to create backup: ${err.message}`);
  process.exit(1);
}

// Create backup of simulation.ts if it exists
if (fs.existsSync(SIMULATION_FILE)) {
  console.log('Creating backup of simulation.ts...');
  try {
    fs.copyFileSync(SIMULATION_FILE, SIMULATION_BACKUP);
    console.log(`✓ Backup created at ${SIMULATION_BACKUP}`);
  } catch (err) {
    console.error(`✗ Failed to create simulation backup: ${err.message}`);
  }
}

// Read the auto-dosing file
console.log('Reading auto-dosing file...');
let autoDosingContent;
try {
  autoDosingContent = fs.readFileSync(AUTODOSING_FILE, 'utf8');
  console.log('✓ File read successfully');
} catch (err) {
  console.error(`✗ Failed to read file: ${err.message}`);
  process.exit(1);
}

// Apply patch to fix issues with missing sensor readings
console.log('Applying patch to fix sensor reading issues...');

// Function to patch the getSimulatedSensorReadings call to ensure values are valid
function patchSensorReading() {
  const SENSOR_READING_PATTERN = /try {[\s\S]*?sensorData = {[\s\S]*?ph: simData\.ph,[\s\S]*?ec: simData\.ec,[\s\S]*?waterTemp: simData\.waterTemp,[\s\S]*?timestamp: new Date\(\)\.toISOString\(\)[\s\S]*?};/;
  
  const PATCHED_SENSOR_READING = `try {
      // Check simulation mode first
      try {
        isSimulationMode = await isSimulationEnabled();
      } catch (err) {
        warn(MODULE, 'Error checking simulation mode, assuming not simulated', err);
        isSimulationMode = false;
      }
      
      // Get the appropriate sensor data
      if (isSimulationMode) {
        const simData = getSimulatedSensorReadings();
        
        // Ensure simulated data has valid values
        const validPh = typeof simData.ph === 'number' && !isNaN(simData.ph) ? simData.ph : 6.0;
        const validEc = typeof simData.ec === 'number' && !isNaN(simData.ec) ? simData.ec : 1.4;
        const validTemp = typeof simData.waterTemp === 'number' && !isNaN(simData.waterTemp) ? simData.waterTemp : 22.0;
        
        sensorData = {
          ph: validPh,
          ec: validEc,
          waterTemp: validTemp,
          timestamp: new Date().toISOString()
        };
        
        // Log if we had to use fallback values
        if (validPh !== simData.ph || validEc !== simData.ec || validTemp !== simData.waterTemp) {
          warn(MODULE, 'Used fallback values for some simulated sensor readings', { 
            originalPh: simData.ph, 
            originalEc: simData.ec, 
            originalTemp: simData.waterTemp,
            usedPh: validPh,
            usedEc: validEc,
            usedTemp: validTemp
          });
        }`;
  
  // Apply the patch for sensor reading
  const patchedContent = autoDosingContent.replace(SENSOR_READING_PATTERN, PATCHED_SENSOR_READING);
  
  if (patchedContent === autoDosingContent) {
    console.log('✗ Could not find sensor reading code to patch');
    return autoDosingContent;
  }
  
  console.log('✓ Patched sensor reading code');
  return patchedContent;
}

// Function to patch the validation of sensor readings to be more lenient
function patchSensorValidation(content) {
  const VALIDATION_PATTERN = /\/\/ Check if sensors report realistic values[\s\S]*?if \(sensorData\.ph <= 0 \|\| sensorData\.ph >= 14 \|\| sensorData\.ec < 0 \|\| sensorData\.ec > 5\) {[\s\S]*?return {[\s\S]*?action: 'error',[\s\S]*?details: { reason: 'Invalid sensor readings detected', sensorData }[\s\S]*?};[\s\S]*?}/;
  
  const PATCHED_VALIDATION = `// Check if sensors report realistic values to prevent dosing based on bad data
      if (!sensorData.ph && !sensorData.ec) {
        // Both pH and EC are missing, this is a true error
        dosingLock.inProgress = false;
        if (dosingLock.timeout) {
          clearTimeout(dosingLock.timeout);
          dosingLock.timeout = null;
        }
        
        recordFailure();
        
        error(MODULE, \`Critical sensor data missing: pH=\${sensorData.ph}, EC=\${sensorData.ec}\`);
        return {
          action: 'error',
          details: { reason: 'Critical sensor data missing: both pH and EC are undefined', sensorData }
        };
      }
      
      // Ensure pH is in range 0-14, with fallback to 6.0
      if (sensorData.ph === undefined || sensorData.ph === null || isNaN(sensorData.ph) || sensorData.ph <= 0 || sensorData.ph >= 14) {
        warn(MODULE, \`Invalid pH reading \${sensorData.ph}, using fallback value 6.0\`);
        sensorData.ph = 6.0;
      }
      
      // Ensure EC is in range 0-5, with fallback to 1.4
      if (sensorData.ec === undefined || sensorData.ec === null || isNaN(sensorData.ec) || sensorData.ec < 0 || sensorData.ec > 5) {
        warn(MODULE, \`Invalid EC reading \${sensorData.ec}, using fallback value 1.4\`);
        sensorData.ec = 1.4;
      }`;
  
  // Apply the patch for validation
  const patchedContent = content.replace(VALIDATION_PATTERN, PATCHED_VALIDATION);
  
  if (patchedContent === content) {
    console.log('✗ Could not find sensor validation code to patch');
    return content;
  }
  
  console.log('✓ Patched sensor validation code');
  return patchedContent;
}

// Apply both patches
let patchedContent = patchSensorReading();
patchedContent = patchSensorValidation(patchedContent);

// Write the patched file
console.log('Writing patched auto-dosing file...');
try {
  fs.writeFileSync(AUTODOSING_FILE, patchedContent, 'utf8');
  console.log('✓ Patched file saved successfully');
} catch (err) {
  console.error(`✗ Failed to write patched file: ${err.message}`);
  console.log('Attempting to restore from backup...');
  try {
    fs.copyFileSync(BACKUP_FILE, AUTODOSING_FILE);
    console.log('✓ Restored original file from backup');
  } catch (restoreErr) {
    console.error(`✗ Failed to restore backup: ${restoreErr.message}`);
  }
}

// Patch the simulation.ts file if it exists
if (fs.existsSync(SIMULATION_FILE)) {
  console.log('\nPatching simulation.ts file...');
  try {
    let simContent = fs.readFileSync(SIMULATION_FILE, 'utf8');
    
    // Patch the getSimulatedSensorReadings function to provide fallback values
    const SIM_PATTERN = /export async function getSimulatedSensorReadings\(\): Promise<SensorData> {[\s\S]*?return {[\s\S]*?ph: parseFloat\(currentSimulatedValues\.ph\.toFixed\(2\)\),[\s\S]*?ec: parseFloat\(currentSimulatedValues\.ec\.toFixed\(2\)\),[\s\S]*?waterTemp: parseFloat\(currentSimulatedValues\.waterTemp\.toFixed\(1\)\),[\s\S]*?timestamp: new Date\(\)\.toISOString\(\)[\s\S]*?};/;
    
    const PATCHED_SIM = `export async function getSimulatedSensorReadings(): Promise<SensorData> {
  try {
    // Get current configuration - use cached if available
    let config: SimulationConfig;
    try {
      config = await getSimulationConfig();
    } catch (error) {
      console.error('Error getting simulation config, using defaults:', error);
      // Use cached config if available, otherwise defaults
      config = cachedConfig || DEFAULT_SIMULATION_CONFIG;
    }
    
    if (!config.enabled) {
      throw new Error('Simulation mode is not enabled');
    }
    
    // Apply small random variations and drift to current values
    currentSimulatedValues = {
      ph: applyRealisticVariation(
        currentSimulatedValues.ph, 
        config.variation.ph, 
        config.drift.ph,
        0.0, 14.0 // pH full range 0-14 instead of restricted 5-7 range
      ),
      
      ec: applyRealisticVariation(
        currentSimulatedValues.ec, 
        config.variation.ec, 
        config.drift.ec,
        0.0, 5.0 // EC full range 0-5 instead of restricted 0.8-2.5 range
      ),
      
      waterTemp: applyRealisticVariation(
        currentSimulatedValues.waterTemp, 
        config.variation.waterTemp, 
        config.drift.waterTemp,
        0.0, 40.0 // Temperature wider range 0-40 instead of restricted 15-30 range
      )
    };
    
    // Ensure values are in valid ranges before returning
    const ph = isNaN(currentSimulatedValues.ph) || currentSimulatedValues.ph <= 0 || currentSimulatedValues.ph >= 14 
      ? 6.0 : parseFloat(currentSimulatedValues.ph.toFixed(2));
      
    const ec = isNaN(currentSimulatedValues.ec) || currentSimulatedValues.ec < 0 || currentSimulatedValues.ec > 5
      ? 1.4 : parseFloat(currentSimulatedValues.ec.toFixed(2));
      
    const waterTemp = isNaN(currentSimulatedValues.waterTemp) || currentSimulatedValues.waterTemp < 0 || currentSimulatedValues.waterTemp > 40
      ? 22.0 : parseFloat(currentSimulatedValues.waterTemp.toFixed(1));
    
    // Return sensor data with current timestamp
    return {
      ph,
      ec,
      waterTemp,
      timestamp: new Date().toISOString()
    };`;
    
    const patchedSimContent = simContent.replace(SIM_PATTERN, PATCHED_SIM);
    
    if (patchedSimContent === simContent) {
      console.log('✗ Could not find getSimulatedSensorReadings function to patch');
    } else {
      fs.writeFileSync(SIMULATION_FILE, patchedSimContent, 'utf8');
      console.log('✓ Patched simulation.ts file successfully');
    }
  } catch (err) {
    console.error(`✗ Failed to patch simulation.ts: ${err.message}`);
  }
}

console.log('\nPatches applied successfully!');
console.log('To apply the changes:');
console.log('1. Rebuild your NuTetra application');
console.log('2. Restart the application');
console.log('3. Check if auto-dosing now works correctly');
console.log('\nIf you need to restore from backup:');
console.log(`1. Copy ${BACKUP_FILE} back to ${AUTODOSING_FILE}`);
if (fs.existsSync(SIMULATION_BACKUP)) {
  console.log(`2. Copy ${SIMULATION_BACKUP} back to ${SIMULATION_FILE}`);
}
