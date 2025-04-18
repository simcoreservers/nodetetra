/**
 * Fix for Auto-Dosing Syntax Errors
 * This script corrects syntax issues in the patched autoDosing.ts file
 */

const fs = require('fs');
const path = require('path');

// Define paths
const SRC_DIR = path.join(process.cwd(), 'src', 'app', 'lib');
const AUTODOSING_FILE = path.join(SRC_DIR, 'autoDosing.ts');
const BACKUP_FILE = path.join(SRC_DIR, 'autoDosing.ts.bak2');

console.log('NuTetra Auto-Dosing Syntax Fix Tool');
console.log('================================');

// Check if source file exists
if (!fs.existsSync(AUTODOSING_FILE)) {
  console.error(`Error: Auto-dosing file not found at ${AUTODOSING_FILE}`);
  process.exit(1);
}

// Create another backup of autoDosing.ts
console.log('Creating backup of current autoDosing.ts...');
try {
  fs.copyFileSync(AUTODOSING_FILE, BACKUP_FILE);
  console.log(`✓ Backup created at ${BACKUP_FILE}`);
} catch (err) {
  console.error(`✗ Failed to create backup: ${err.message}`);
  process.exit(1);
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

// Find the performAutoDosing function
console.log('Finding performAutoDosing function...');
const functionStart = autoDosingContent.indexOf('export async function performAutoDosing()');
if (functionStart === -1) {
  console.error('✗ Could not find performAutoDosing function');
  process.exit(1);
}

// Find the beginning and end of the function body
const openBraceIndex = autoDosingContent.indexOf('{', functionStart);
let closeBraceIndex = -1;
let braceCount = 1;
for (let i = openBraceIndex + 1; i < autoDosingContent.length; i++) {
  if (autoDosingContent[i] === '{') braceCount++;
  if (autoDosingContent[i] === '}') braceCount--;
  if (braceCount === 0) {
    closeBraceIndex = i;
    break;
  }
}

if (closeBraceIndex === -1) {
  console.error('✗ Could not find end of performAutoDosing function');
  process.exit(1);
}

console.log('✓ Found performAutoDosing function');

// Extract the current function implementation
const currentFunction = autoDosingContent.substring(functionStart, closeBraceIndex + 1);

// Create the fixed function that properly handles sensor reading validation
const fixedFunction = `export async function performAutoDosing(): Promise<{
  action: string;
  details: any;
}> {
  // Add rate limiting to prevent rapid successive calls
  const now = Date.now();
  if (now - dosingLock.lastAttempt < MIN_DOSING_ATTEMPT_INTERVAL) {
    warn(MODULE, \`Dosing attempted too frequently (\${now - dosingLock.lastAttempt}ms since last attempt)\`);
    return {
      action: 'waiting',
      details: { reason: 'Dosing attempted too frequently, please wait' }
    };
  }
  dosingLock.lastAttempt = now;
  
  // Check startup safety delay to prevent dosing immediately after server start
  if (now - serverStartTime < STARTUP_SAFETY_DELAY) {
    const remainingTime = Math.ceil((STARTUP_SAFETY_DELAY - (now - serverStartTime)) / 1000);
    warn(MODULE, \`Server recently started, waiting \${remainingTime}s before allowing dosing operations\`);
    return {
      action: 'waiting',
      details: { reason: \`Server recently started, safety delay active (\${remainingTime}s remaining)\` }
    };
  }
  
  // First, check if auto-dosing has been explicitly disabled
  if (autoDosingExplicitlyDisabled) {
    warn(MODULE, 'Auto-dosing has been explicitly disabled, aborting dosing operation');
    disableMonitoring(); // Force monitoring off
    return { 
      action: 'aborted', 
      details: { reason: 'Auto-dosing has been explicitly disabled' } 
    };
  }
  
  // Check if auto-dosing is enabled using strict comparison
  if (dosingConfig.enabled !== true) {
    disableMonitoring(); // Force monitoring off
    debug(MODULE, 'Auto-dosing is disabled, skipping cycle');
    return { 
      action: 'none', 
      details: { reason: 'Auto-dosing is disabled' } 
    };
  }
  
  // Check if circuit breaker is open
  if (isCircuitOpen()) {
    warn(MODULE, 'Circuit breaker is open, skipping dosing cycle');
    return {
      action: 'circuitOpen',
      details: { 
        reason: 'Too many failures detected, system paused for safety', 
        resetTime: dosingConfig.errorHandling?.lastFailure ? 
          new Date(dosingConfig.errorHandling.lastFailure + 
                  (dosingConfig.errorHandling.circuitBreakerResetTime || 300000)).toISOString() : 
          'unknown',
        currentFailCount: dosingConfig.errorHandling?.currentFailCount || 0,
        threshold: dosingConfig.errorHandling?.circuitBreakerThreshold || 10
      }
    };
  }
  
  // Synchronous check to prevent concurrent operations
  if (dosingLock.inProgress) {
    warn(MODULE, 'Dosing already in progress, cannot start another operation');
    return {
      action: 'waiting',
      details: { reason: 'A dosing operation is already in progress' }
    };
  }
  
  // Acquire lock for this dosing operation
  dosingLock.inProgress = true;
  
  // Set a safety timeout to release the lock if something goes wrong
  if (dosingLock.timeout) {
    clearTimeout(dosingLock.timeout);
  }
  
  dosingLock.timeout = setTimeout(() => {
    warn(MODULE, 'Safety timeout reached, releasing dosing lock');
    dosingLock.inProgress = false;
    dosingLock.timeout = null;
  }, MAX_DOSING_LOCK_TIME);
  
  try {
    info(MODULE, 'Starting auto-dosing cycle');
    
    // Get current sensor readings
    let sensorData: SensorData;
    let isSimulationMode = false;
    
    try {
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
        }
      } else {
        const realData = await getAllSensorReadings();
        // Make sure we have a timestamp
        if (!realData.timestamp) {
          sensorData = {
            ...realData,
            timestamp: new Date().toISOString()
          };
        } else {
          sensorData = realData;
        }
      }
      
      // Special handling for missing sensor values
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
      }
    } catch (error) {
      // Release the lock before returning
      dosingLock.inProgress = false;
      if (dosingLock.timeout) {
        clearTimeout(dosingLock.timeout);
        dosingLock.timeout = null;
      }
      
      recordFailure();
      
      warn(MODULE, 'Failed to get sensor readings', error);
      return {
        action: 'error',
        details: { reason: 'Failed to get sensor readings', error: error instanceof Error ? error.message : String(error) }
      };
    }
    
    info(MODULE, \`Current readings: pH=\${sensorData.ph.toFixed(2)}, EC=\${sensorData.ec.toFixed(2)}\`);
    
    // Keep track of what was dosed
    const dosed: any[] = [];
    
    // Check if pH is too low (need to add pH Up)
    if (sensorData.ph < (dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance)) {
      info(MODULE, \`pH too low: \${sensorData.ph.toFixed(2)}, target: \${dosingConfig.targets.ph.target.toFixed(2)}\`);
      
      // Check if we can dose pH Up
      if (canDose('phUp')) {
        try {
          // Use PID controller to calculate optimal dose amount
          const controller = dosingConfig.pidControllers?.ph || PID_DEFAULTS.ph;
          const baseDoseAmount = dosingConfig.dosing.phUp.doseAmount;
          
          // Calculate dose amount using PID controller for better accuracy
          const amount = calculatePIDDose(
            sensorData.ph,
            dosingConfig.targets.ph.target,
            controller,
            baseDoseAmount
          );
          
          const pumpName = dosingConfig.dosing.phUp.pumpName;
          const flowRate = dosingConfig.dosing.phUp.flowRate;
          
          info(MODULE, \`PID controller calculated \${amount}ml dose of pH Up from \${pumpName} at \${flowRate}ml/s\`);
          
          // Force direct import of dispensePump to ensure it's using the correct implementation
          const { dispensePump } = await import('./pumps');
          
          // Always dispense regardless of sensor simulation mode
          await dispensePump(pumpName, amount, flowRate);
          info(MODULE, \`Successfully dispensed \${amount}ml of pH Up\`);
          
          // Record success for circuit breaker
          recordSuccess();
          
          // Record the dose
          recordDose('phUp');
          
          // Record effectiveness for adaptive learning - create a timeout to check after 5 minutes
          const beforeValue = sensorData.ph;
          scheduleEffectivenessCheck(pumpName, amount, beforeValue, 'ph');
          
          return {
            action: 'dosed',
            details: {
              type: 'pH Up',
              amount,
              pumpName,
              sensorSimulation: isSimulationMode,
              reason: \`pH \${sensorData.ph} below target range (\${dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance})\`
            }
          };
        } catch (err) {
          error(MODULE, 'Error dispensing pH Up', err);
          recordFailure(); // Record failure for circuit breaker
          
          return {
            action: 'error',
            details: {
              type: 'pH Up',
              error: \`Failed to dispense pH Up: \${err}\`
            }
          };
        }
      } else {
        debug(MODULE, 'Cannot dose pH Up yet due to minimum interval');
        return {
          action: 'waiting',
          details: {
            type: 'pH Up',
            reason: 'Minimum interval between doses not reached'
          }
        };
      }
    }
  
    // Check if pH is too high (need to add pH Down)
    if (sensorData.ph > (dosingConfig.targets.ph.target + dosingConfig.targets.ph.tolerance)) {
      info(MODULE, \`pH too high: \${sensorData.ph.toFixed(2)}, target: \${dosingConfig.targets.ph.target.toFixed(2)}\`);
      
      // Check if we can dose pH Down
      if (canDose('phDown')) {
        try {
          // Use PID controller to calculate optimal dose amount
          const controller = dosingConfig.pidControllers?.ph || PID_DEFAULTS.ph;
          const baseDoseAmount = dosingConfig.dosing.phDown.doseAmount;
          
          // For pH Down, we need to invert the target/current values since we're trying to decrease
          const amount = calculatePIDDose(
            dosingConfig.targets.ph.target, // Invert target and current for pH Down
            sensorData.ph,
            controller,
            baseDoseAmount
          );
          
          const pumpName = dosingConfig.dosing.phDown.pumpName;
          const flowRate = dosingConfig.dosing.phDown.flowRate;
          
          info(MODULE, \`PID controller calculated \${amount}ml dose of pH Down from \${pumpName} at \${flowRate}ml/s\`);
          
          // Always dispense regardless of sensor simulation mode
          await dispensePump(pumpName, amount, flowRate);
          info(MODULE, \`Successfully dispensed \${amount}ml of pH Down\`);
          
          // Record success for circuit breaker
          recordSuccess();
          
          // Record the dose
          recordDose('phDown');
          
          // Record effectiveness for adaptive learning - create a timeout to check after 5 minutes
          const beforeValue = sensorData.ph;
          scheduleEffectivenessCheck(pumpName, amount, beforeValue, 'ph');
          
          return {
            action: 'dosed',
            details: {
              type: 'pH Down',
              amount,
              pumpName,
              sensorSimulation: isSimulationMode,
              reason: \`pH \${sensorData.ph} above target range (\${dosingConfig.targets.ph.target + dosingConfig.targets.ph.tolerance})\`
            }
          };
        } catch (err) {
          error(MODULE, 'Error dispensing pH Down', err);
          recordFailure(); // Record failure for circuit breaker
          
          return {
            action: 'error',
            details: {
              type: 'pH Down',
              error: \`Failed to dispense pH Down: \${err}\`
            }
          };
        }
      } else {
        debug(MODULE, 'Cannot dose pH Down yet due to minimum interval');
        return {
          action: 'waiting',
          details: {
            type: 'pH Down',
            reason: 'Minimum interval between doses not reached'
          }
        };
      }
    }
  
    // Check if EC is too low (need to add nutrients)
    if (sensorData.ec < (dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance)) {
      info(MODULE, \`EC too low: \${sensorData.ec.toFixed(2)}, target: \${dosingConfig.targets.ec.target.toFixed(2)}\`);
      
      // Check if we can dose Nutrient
      if (canDose('nutrient')) {
        try {
          // Use PID controller to calculate optimal dose amount
          const controller = dosingConfig.pidControllers?.ec || PID_DEFAULTS.ec;
          const baseDoseAmount = dosingConfig.dosing.nutrient.doseAmount;
          
          // Calculate dose amount using PID controller for better accuracy
          const amount = calculatePIDDose(
            sensorData.ec,
            dosingConfig.targets.ec.target,
            controller,
            baseDoseAmount
          );
          
          const pumpName = dosingConfig.dosing.nutrient.pumpName;
          const flowRate = dosingConfig.dosing.nutrient.flowRate;
          
          info(MODULE, \`PID controller calculated \${amount}ml dose of Nutrient from \${pumpName} at \${flowRate}ml/s\`);
          
          // Force direct import of dispensePump to ensure it's using the correct implementation
          const { dispensePump } = await import('./pumps');
          
          // Always dispense regardless of sensor simulation mode
          await dispensePump(pumpName, amount, flowRate);
          info(MODULE, \`Successfully dispensed \${amount}ml of Nutrient\`);
          
          // Record success for circuit breaker
          recordSuccess();
          
          // Record the dose
          recordDose('nutrient');
          
          // Record effectiveness for adaptive learning - create a timeout to check after 5 minutes
          const beforeValue = sensorData.ec;
          scheduleEffectivenessCheck(pumpName, amount, beforeValue, 'ec');
          
          return {
            action: 'dosed',
            details: {
              type: 'Nutrient',
              amount,
              pumpName,
              sensorSimulation: isSimulationMode,
              reason: \`EC \${sensorData.ec} below target range (\${dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance})\`
            }
          };
        } catch (err) {
          error(MODULE, 'Error dispensing Nutrient', err);
          recordFailure(); // Record failure for circuit breaker
          
          return {
            action: 'error',
            details: {
              type: 'Nutrient',
              error: \`Failed to dispense Nutrient: \${err}\`
            }
          };
        }
      } else {
        debug(MODULE, 'Cannot dose Nutrient yet due to minimum interval');
        return {
          action: 'waiting',
          details: {
            type: 'Nutrient',
            reason: 'Minimum interval between doses not reached'
          }
        };
      }
    }
    
    // If EC is too high, we can't automatically reduce it (requires water change)
    if (sensorData.ec > (dosingConfig.targets.ec.target + dosingConfig.targets.ec.tolerance)) {
      info(MODULE, \`EC too high: \${sensorData.ec.toFixed(2)}, target: \${dosingConfig.targets.ec.target.toFixed(2)}\`);
      return {
        action: 'warning',
        details: {
          type: 'EC High',
          reason: \`EC \${sensorData.ec} above target range (\${dosingConfig.targets.ec.target + dosingConfig.targets.ec.tolerance}). Consider adding fresh water to dilute solution.\`
        }
      };
    }
  
    // If we get here, everything is within target ranges
    info(MODULE, 'All parameters within target ranges');
    
    // Record a success for the circuit breaker
    recordSuccess();
    
    return {
      action: 'none',
      details: {
        reason: 'All parameters within target ranges',
        currentValues: {
          ph: sensorData.ph,
          ec: sensorData.ec,
          waterTemp: sensorData.waterTemp
        },
        targets: dosingConfig.targets
      }
    };
  } catch (err: unknown) {
    // Ensure the lock is released even if there's an error
    dosingLock.inProgress = false;
    if (dosingLock.timeout) {
      clearTimeout(dosingLock.timeout);
      dosingLock.timeout = null;
    }
    
    // Record the failure for circuit breaker
    recordFailure();
    
    error(MODULE, 'Error during auto-dosing:', err);
    return {
      action: 'error',
      details: { 
        reason: 'Error during auto-dosing operation', 
        error: err instanceof Error ? err.message : String(err)
      }
    };
  }
}`;

// Replace the old function with the fixed function
const fixedContent = autoDosingContent.substring(0, functionStart) + 
                      fixedFunction + 
                      autoDosingContent.substring(closeBraceIndex + 1);

// Write the fixed file
console.log('Writing fixed auto-dosing file...');
try {
  fs.writeFileSync(AUTODOSING_FILE, fixedContent, 'utf8');
  console.log('✓ Fixed file saved successfully');
} catch (err) {
  console.error(`✗ Failed to write fixed file: ${err.message}`);
  console.log('Attempting to restore from backup...');
  try {
    fs.copyFileSync(BACKUP_FILE, AUTODOSING_FILE);
    console.log('✓ Restored original file from backup');
  } catch (restoreErr) {
    console.error(`✗ Failed to restore backup: ${restoreErr.message}`);
  }
}

console.log('\nFix applied successfully!');
console.log('To apply the changes:');
console.log('1. Rebuild your NuTetra application');
console.log('2. Restart the application');
console.log('3. Check if auto-dosing now works correctly');
console.log('\nIf you need to restore from backup:');
console.log(`Copy ${BACKUP_FILE} back to ${AUTODOSING_FILE}`);
