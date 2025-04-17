import { NextRequest, NextResponse } from 'next/server';
import { 
  getUnifiedDosingConfig, 
  saveUnifiedDosingConfig 
} from '@/app/lib/dosingMigration';
import { getAllSensorReadings } from '@/app/lib/sensors';
import { getSimulatedSensorReadings, isSimulationEnabled } from '@/app/lib/simulation';
import { dispensePump, getAllPumpStatus, PumpName } from '@/app/lib/pumps';
import { error, info, debug, warn } from '@/app/lib/logger';

const MODULE = 'api:dosing:auto';

// Unified dosing lock to prevent concurrent operations
const dosingLock = {
  inProgress: false,
  lastAttempt: 0,
  timeout: null as NodeJS.Timeout | null
};
const MAX_DOSING_LOCK_TIME = 30000; // 30 seconds max lock time
const MIN_DOSING_ATTEMPT_INTERVAL = 2000; // 2s minimum between attempts

/**
 * GET handler - get auto-dosing status
 */
export async function GET() {
  try {
    const config = await getUnifiedDosingConfig();
    const isDosingInProgress = dosingLock.inProgress;
    
    return NextResponse.json({
      status: 'success',
      autodosing: {
        enabled: config?.enabled || false,
        inProgress: isDosingInProgress
      },
      config
    });
  } catch (err) {
    error(MODULE, 'Error getting auto-dosing status:', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to get auto-dosing status',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler - trigger dosing actions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    
    if (!action) {
      return NextResponse.json(
        { status: 'error', error: 'Missing action parameter' },
        { status: 400 }
      );
    }
    
    // Get current config 
    const config = await getUnifiedDosingConfig();
    if (!config) {
      return NextResponse.json(
        { status: 'error', error: 'Failed to load dosing configuration' },
        { status: 500 }
      );
    }
    
    switch (action) {
      case 'dose':
        // Check if auto-dosing is enabled
        if (!config.enabled) {
          return NextResponse.json({
            status: 'success',
            result: {
              action: 'none',
              details: { reason: 'Auto-dosing is disabled' }
            }
          });
        }
        
        // Check rate limiting
        const now = Date.now();
        if (now - dosingLock.lastAttempt < MIN_DOSING_ATTEMPT_INTERVAL) {
          warn(MODULE, `Dosing attempted too frequently (${now - dosingLock.lastAttempt}ms since last attempt)`);
          return NextResponse.json({
            status: 'success',
            result: {
              action: 'waiting',
              details: { reason: 'Dosing attempted too frequently, please wait' }
            }
          });
        }
        dosingLock.lastAttempt = now;
        
        // Check if already in progress
        if (dosingLock.inProgress) {
          warn(MODULE, 'Dosing already in progress');
          return NextResponse.json({
            status: 'success',
            result: {
              action: 'waiting',
              details: { reason: 'A dosing operation is already in progress' }
            }
          });
        }
        
        // Perform dosing
        const result = await performAutoDosing(config);
        return NextResponse.json({
          status: 'success',
          result
        });
        
      case 'forceNext':
        // Reset all dose timestamps
        config.lastDose.phUp = null;
        config.lastDose.phDown = null;
        config.lastDose.nutrientPumps = {};
        
        // Save config
        await saveUnifiedDosingConfig(config);
        
        return NextResponse.json({
          status: 'success',
          message: 'Force next dosing triggered successfully'
        });
        
      default:
        return NextResponse.json(
          { status: 'error', error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    error(MODULE, 'Error in auto-dosing API:', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to process auto-dosing request',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

/**
 * Perform auto-dosing based on sensor readings and configuration
 */
async function performAutoDosing(config: any): Promise<{
  action: string;
  details: any;
}> {
  // Add rate limiting to prevent rapid successive calls
  const now = Date.now();
  if (now - dosingLock.lastAttempt < MIN_DOSING_ATTEMPT_INTERVAL) {
    warn(MODULE, `Dosing attempted too frequently (${now - dosingLock.lastAttempt}ms since last attempt)`);
    return {
      action: 'waiting',
      details: { reason: 'Dosing attempted too frequently, please wait' }
    };
  }
  dosingLock.lastAttempt = now;
  
  // Check if auto-dosing is enabled
  if (!config.enabled) {
    debug(MODULE, 'Auto-dosing is disabled, skipping cycle');
    return { 
      action: 'none', 
      details: { reason: 'Auto-dosing is disabled' } 
    };
  }
  
  // Check circuit breaker if available
  if (config.errorHandling?.circuitOpen) {
    const lastFailure = config.errorHandling.lastFailure;
    const resetTime = lastFailure + (config.errorHandling.circuitBreakerResetTime || 300000);
    
    if (now < resetTime) {
      warn(MODULE, 'Circuit breaker is open, skipping dosing cycle');
      return {
        action: 'circuitOpen',
        details: { 
          reason: 'Too many failures detected, system paused for safety', 
          resetTime: new Date(resetTime).toISOString()
        }
      };
    }
    
    // Reset circuit breaker if time has elapsed
    config.errorHandling.circuitOpen = false;
    config.errorHandling.currentFailCount = 0;
    await saveUnifiedDosingConfig(config);
  }
  
  // Synchronous check to prevent concurrent operations
  if (dosingLock.inProgress) {
    warn(MODULE, 'Dosing already in progress, cannot start another operation');
    return {
      action: 'waiting',
      details: { reason: 'A dosing operation is already in progress' }
    };
  }
  
  try {
    // Acquire dosing lock
    dosingLock.inProgress = true;
    
    // Set safety timeout to release lock in case of unhandled errors
    if (dosingLock.timeout) {
      clearTimeout(dosingLock.timeout);
    }
    dosingLock.timeout = setTimeout(() => {
      warn(MODULE, 'Safety timeout reached, releasing dosing lock');
      dosingLock.inProgress = false;
      dosingLock.timeout = null;
    }, MAX_DOSING_LOCK_TIME);
    
    info(MODULE, 'Starting auto-dosing cycle');
  
    // Get the latest sensor readings - may be real or simulated
    let sensorData;
    let isSensorSimulation = false;
  
    try {
      // Check if we should use simulated readings
      isSensorSimulation = await isSimulationEnabled();
      debug(MODULE, `Sensor simulation mode: ${isSensorSimulation ? 'ENABLED' : 'DISABLED'}`);
      
      if (isSensorSimulation) {
        sensorData = await getSimulatedSensorReadings();
        debug(MODULE, `Using SIMULATED readings: pH=${sensorData.ph}, EC=${sensorData.ec}`);
      } else {
        const readings = await getAllSensorReadings();
        sensorData = {
          ...readings,
          timestamp: new Date().toISOString()
        };
        debug(MODULE, `Using REAL readings: pH=${sensorData.ph}, EC=${sensorData.ec}`);
      }
    } catch (err) {
      error(MODULE, 'Error getting sensor readings', err);
      
      // Record failure if circuit breaker enabled
      if (config.errorHandling) {
        config.errorHandling.currentFailCount = (config.errorHandling.currentFailCount || 0) + 1;
        config.errorHandling.lastFailure = Date.now();
        
        if (config.errorHandling.currentFailCount >= config.errorHandling.circuitBreakerThreshold) {
          config.errorHandling.circuitOpen = true;
          warn(MODULE, `Circuit breaker opened after ${config.errorHandling.currentFailCount} failures`);
        }
        
        await saveUnifiedDosingConfig(config);
      }
      
      // Always release lock on error
      dosingLock.inProgress = false;
      if (dosingLock.timeout) {
        clearTimeout(dosingLock.timeout);
        dosingLock.timeout = null;
      }
      return { 
        action: 'error', 
        details: { error: `Failed to get sensor readings: ${err}` } 
      };
    }
  
    // Validate sensor readings
    if (typeof sensorData.ph !== 'number' || typeof sensorData.ec !== 'number' ||
        sensorData.ph < 0 || sensorData.ph > 14 || sensorData.ec < 0 || sensorData.ec > 10) {
      warn(MODULE, `Invalid sensor readings detected: pH=${sensorData.ph}, EC=${sensorData.ec}`);
      
      // Release lock
      dosingLock.inProgress = false;
      if (dosingLock.timeout) {
        clearTimeout(dosingLock.timeout);
        dosingLock.timeout = null;
      }
      
      return {
        action: 'error',
        details: { reason: 'Invalid sensor readings detected' }
      };
    }
  
    // Check for already active pumps
    try {
      const pumpStatus = getAllPumpStatus();
      const activePumps = pumpStatus.filter(pump => pump.active).map(pump => pump.name);
      
      if (activePumps.length > 0) {
        warn(MODULE, `Active pumps detected, skipping dosing: ${activePumps.join(', ')}`);
        return { 
          action: 'waiting', 
          details: { reason: `Active pumps detected: ${activePumps.join(', ')}` } 
        };
      }
    } catch (err) {
      error(MODULE, 'Error checking pump status', err);
    }
    
    // Handle pH adjustment first - pH is always prioritized over EC adjustment
    // Check if pH is too low (need to add pH Up)
    if (sensorData.ph < config.targets.ph.min) {
      info(MODULE, `pH too low: ${sensorData.ph.toFixed(2)}, target: ${config.targets.ph.target.toFixed(2)}`);
      
      // Find pH Up pump
      const phUpPumpName = Object.keys(config.pumps).find(name => 
        name.toLowerCase().includes('ph') && name.toLowerCase().includes('up')
      );
      
      if (!phUpPumpName) {
        warn(MODULE, 'No pH Up pump configured');
        return {
          action: 'error',
          details: { reason: 'No pH Up pump configured' }
        };
      }
      
      // Check if we can dose pH Up (not dosed recently)
      const lastDoseTime = config.lastDose.phUp ? new Date(config.lastDose.phUp).getTime() : 0;
      const timeSinceLastDose = (now - lastDoseTime) / 1000;
      const minInterval = config.pumps[phUpPumpName].minInterval || 120;
      
      if (timeSinceLastDose >= minInterval) {
        try {
          // Calculate dose amount
          let doseAmount = config.pumps[phUpPumpName].doseAmount || 0.5;
          
          // Use PID controller if available
          if (config.pidControllers?.ph) {
            const controller = config.pidControllers.ph;
            const dt = controller.lastTime === 0 ? 1 : 
              Math.min((now - controller.lastTime) / 1000, 10);
            
            // Calculate error
            const error = config.targets.ph.target - sensorData.ph;
            
            // Anti-windup: Limit integral term
            const maxIntegral = 5.0;
            controller.integral = Math.max(
              Math.min(controller.integral + error * dt, maxIntegral),
              -maxIntegral
            );
            
            const derivative = dt > 0 ? (error - controller.lastError) / dt : 0;
            
            // Calculate PID output
            const output = (
              controller.kp * error + 
              controller.ki * controller.integral + 
              controller.kd * derivative
            );
            
            // Update controller state
            controller.lastError = error;
            controller.lastTime = now;
            
            // Scale base dose by PID output (minimum 0.1mL, maximum 3x base)
            doseAmount = doseAmount * Math.min(Math.max(Math.abs(output), 0.2), 3.0);
            
            // Round to one decimal place
            doseAmount = Math.round(doseAmount * 10) / 10;
            
            // Save updated controller state
            await saveUnifiedDosingConfig(config);
          } else {
            // Simple scaling based on how far from target
            const phDelta = config.targets.ph.target - sensorData.ph;
            const scaleFactor = Math.min(1 + (phDelta / config.targets.ph.tolerance), 2);
            doseAmount = Math.round((doseAmount * scaleFactor) * 10) / 10;
          }
          
          const flowRate = config.pumps[phUpPumpName].flowRate || 1.0;
          
          info(MODULE, `Dispensing ${doseAmount}ml of pH Up from ${phUpPumpName} at ${flowRate}ml/s`);
          
          // Dispense pH Up
          await dispensePump(phUpPumpName as PumpName, doseAmount, flowRate);
          info(MODULE, `Successfully dispensed ${doseAmount}ml of pH Up`);
          
          // Record dose
          config.lastDose.phUp = new Date().toISOString();
          await saveUnifiedDosingConfig(config);
          
          // Record success for circuit breaker if enabled
          if (config.errorHandling) {
            config.errorHandling.currentFailCount = 0;
            await saveUnifiedDosingConfig(config);
          }
          
          // Schedule effectiveness check if telemetry enabled
          if (config.telemetry) {
            setTimeout(async () => {
              try {
                // Get current reading after stabilization
                let currentReadings;
                
                if (await isSimulationEnabled()) {
                  currentReadings = await getSimulatedSensorReadings();
                } else {
                  currentReadings = await getAllSensorReadings();
                }
                
                // Record effectiveness
                if (!config.telemetry.doseHistory) {
                  config.telemetry.doseHistory = [];
                }
                
                const change = Math.abs(currentReadings.ph - sensorData.ph);
                const effectivenessRatio = change / doseAmount;
                
                config.telemetry.doseHistory.unshift({
                  timestamp: new Date().toISOString(),
                  pumpName: phUpPumpName,
                  doseAmount,
                  beforeValue: sensorData.ph,
                  afterValue: currentReadings.ph,
                  effectivenessRatio,
                  targetType: 'ph'
                });
                
                // Trim history if needed
                if (config.telemetry.doseHistory.length > (config.telemetry.maxHistoryLength || 100)) {
                  config.telemetry.doseHistory = config.telemetry.doseHistory.slice(
                    0, config.telemetry.maxHistoryLength || 100
                  );
                }
                
                await saveUnifiedDosingConfig(config);
                
                debug(MODULE, `Recorded pH Up effectiveness: ${effectivenessRatio.toFixed(4)} pH/mL`);
              } catch (err) {
                error(MODULE, 'Error recording pH Up effectiveness', err);
              }
            }, 300000); // Check after 5 minutes for stabilization
          }
          
          return {
            action: 'dosed',
            details: {
              type: 'pH Up',
              amount: doseAmount,
              pumpName: phUpPumpName,
              sensorSimulation: isSensorSimulation,
              reason: `pH ${sensorData.ph} below target range (${config.targets.ph.min})`
            }
          };
        } catch (err) {
          error(MODULE, 'Error dispensing pH Up', err);
          
          // Record failure for circuit breaker if enabled
          if (config.errorHandling) {
            config.errorHandling.currentFailCount = (config.errorHandling.currentFailCount || 0) + 1;
            config.errorHandling.lastFailure = Date.now();
            
            if (config.errorHandling.currentFailCount >= config.errorHandling.circuitBreakerThreshold) {
              config.errorHandling.circuitOpen = true;
              warn(MODULE, `Circuit breaker opened after ${config.errorHandling.currentFailCount} failures`);
            }
            
            await saveUnifiedDosingConfig(config);
          }
          
          return {
            action: 'error',
            details: {
              type: 'pH Up',
              error: `Failed to dispense pH Up: ${err}`
            }
          };
        }
      } else {
        debug(MODULE, 'Cannot dose pH Up yet due to minimum interval');
        return {
          action: 'waiting',
          details: {
            type: 'pH Up',
            reason: 'Minimum interval between doses not reached',
            timeRemaining: Math.round(minInterval - timeSinceLastDose)
          }
        };
      }
    }
    
    // Check if pH is too high (need to add pH Down)
    if (sensorData.ph > config.targets.ph.max) {
      info(MODULE, `pH too high: ${sensorData.ph.toFixed(2)}, target: ${config.targets.ph.target.toFixed(2)}`);
      
      // Find pH Down pump
      const phDownPumpName = Object.keys(config.pumps).find(name => 
        name.toLowerCase().includes('ph') && name.toLowerCase().includes('down')
      );
      
      if (!phDownPumpName) {
        warn(MODULE, 'No pH Down pump configured');
        return {
          action: 'error',
          details: { reason: 'No pH Down pump configured' }
        };
      }
      
      // Check if we can dose pH Down (not dosed recently)
      const lastDoseTime = config.lastDose.phDown ? new Date(config.lastDose.phDown).getTime() : 0;
      const timeSinceLastDose = (now - lastDoseTime) / 1000;
      const minInterval = config.pumps[phDownPumpName].minInterval || 120;
      
      if (timeSinceLastDose >= minInterval) {
        try {
          // Calculate dose amount
          let doseAmount = config.pumps[phDownPumpName].doseAmount || 0.5;
          
          // Use PID controller if available
          if (config.pidControllers?.ph) {
            const controller = config.pidControllers.ph;
            const dt = controller.lastTime === 0 ? 1 : 
              Math.min((now - controller.lastTime) / 1000, 10);
            
            // For pH Down, we need to invert the error (want to decrease pH)
            const error = sensorData.ph - config.targets.ph.target;
            
            // Anti-windup: Limit integral term
            const maxIntegral = 5.0;
            controller.integral = Math.max(
              Math.min(controller.integral + error * dt, maxIntegral),
              -maxIntegral
            );
            
            const derivative = dt > 0 ? (error - controller.lastError) / dt : 0;
            
            // Calculate PID output
            const output = (
              controller.kp * error + 
              controller.ki * controller.integral + 
              controller.kd * derivative
            );
            
            // Update controller state
            controller.lastError = error;
            controller.lastTime = now;
            
            // Scale base dose by PID output (minimum 0.1mL, maximum 3x base)
            doseAmount = doseAmount * Math.min(Math.max(Math.abs(output), 0.2), 3.0);
            
            // Round to one decimal place
            doseAmount = Math.round(doseAmount * 10) / 10;
            
            // Save updated controller state
            await saveUnifiedDosingConfig(config);
          } else {
            // Simple scaling based on how far from target
            const phDelta = sensorData.ph - config.targets.ph.target;
            const scaleFactor = Math.min(1 + (phDelta / config.targets.ph.tolerance), 2);
            doseAmount = Math.round((doseAmount * scaleFactor) * 10) / 10;
          }
          
          const flowRate = config.pumps[phDownPumpName].flowRate || 1.0;
          
          info(MODULE, `Dispensing ${doseAmount}ml of pH Down from ${phDownPumpName} at ${flowRate}ml/s`);
          
          // Dispense pH Down
          await dispensePump(phDownPumpName as PumpName, doseAmount, flowRate);
          info(MODULE, `Successfully dispensed ${doseAmount}ml of pH Down`);
          
          // Record dose
          config.lastDose.phDown = new Date().toISOString();
          await saveUnifiedDosingConfig(config);
          
          // Record success for circuit breaker if enabled
          if (config.errorHandling) {
            config.errorHandling.currentFailCount = 0;
            await saveUnifiedDosingConfig(config);
          }
          
          // Schedule effectiveness check if telemetry enabled
          if (config.telemetry) {
            setTimeout(async () => {
              try {
                // Get current reading after stabilization
                let currentReadings;
                
                if (await isSimulationEnabled()) {
                  currentReadings = await getSimulatedSensorReadings();
                } else {
                  currentReadings = await getAllSensorReadings();
                }
                
                // Record effectiveness
                if (!config.telemetry.doseHistory) {
                  config.telemetry.doseHistory = [];
                }
                
                const change = Math.abs(currentReadings.ph - sensorData.ph);
                const effectivenessRatio = change / doseAmount;
                
                config.telemetry.doseHistory.unshift({
                  timestamp: new Date().toISOString(),
                  pumpName: phDownPumpName,
                  doseAmount,
                  beforeValue: sensorData.ph,
                  afterValue: currentReadings.ph,
                  effectivenessRatio,
                  targetType: 'ph'
                });
                
                // Trim history if needed
                if (config.telemetry.doseHistory.length > (config.telemetry.maxHistoryLength || 100)) {
                  config.telemetry.doseHistory = config.telemetry.doseHistory.slice(
                    0, config.telemetry.maxHistoryLength || 100
                  );
                }
                
                await saveUnifiedDosingConfig(config);
                
                debug(MODULE, `Recorded pH Down effectiveness: ${effectivenessRatio.toFixed(4)} pH/mL`);
              } catch (err) {
                error(MODULE, 'Error recording pH Down effectiveness', err);
              }
            }, 300000); // Check after 5 minutes for stabilization
          }
          
          return {
            action: 'dosed',
            details: {
              type: 'pH Down',
              amount: doseAmount,
              pumpName: phDownPumpName,
              sensorSimulation: isSensorSimulation,
              reason: `pH ${sensorData.ph} above target range (${config.targets.ph.max})`
            }
          };
        } catch (err) {
          error(MODULE, 'Error dispensing pH Down', err);
          
          // Record failure for circuit breaker if enabled
          if (config.errorHandling) {
            config.errorHandling.currentFailCount = (config.errorHandling.currentFailCount || 0) + 1;
            config.errorHandling.lastFailure = Date.now();
            
            if (config.errorHandling.currentFailCount >= config.errorHandling.circuitBreakerThreshold) {
              config.errorHandling.circuitOpen = true;
              warn(MODULE, `Circuit breaker opened after ${config.errorHandling.currentFailCount} failures`);
            }
            
            await saveUnifiedDosingConfig(config);
          }
          
          return {
            action: 'error',
            details: {
              type: 'pH Down',
              error: `Failed to dispense pH Down: ${err}`
            }
          };
        }
      } else {
        debug(MODULE, 'Cannot dose pH Down yet due to minimum interval');
        return {
          action: 'waiting',
          details: {
            type: 'pH Down',
            reason: 'Minimum interval between doses not reached',
            timeRemaining: Math.round(minInterval - timeSinceLastDose)
          }
        };
      }
    }
    
    // Check if EC is too low (need to add nutrients)
    if (sensorData.ec < config.targets.ec.min) {
      info(MODULE, `EC too low: ${sensorData.ec.toFixed(2)}, target: ${config.targets.ec.target.toFixed(2)}`);
      
      // Find nutrient pumps (not pH pumps)
      const nutrientPumps = Object.entries(config.pumps)
        .filter(([name]) => !name.toLowerCase().includes('ph') && !name.toLowerCase().includes('water'))
        .map(([name, settings]) => ({ name, ...settings }));
      
      if (nutrientPumps.length === 0) {
        warn(MODULE, 'No nutrient pumps configured');
        return {
          action: 'error',
          details: { reason: 'No nutrient pumps configured' }
        };
      }
      
      // Check which pumps can be dosed (not dosed recently)
      const dosablePumps = nutrientPumps.filter(pump => {
        const lastDoseTime = config.lastDose.nutrientPumps[pump.name] ? 
          new Date(config.lastDose.nutrientPumps[pump.name]).getTime() : 0;
        const timeSinceLastDose = (now - lastDoseTime) / 1000;
        const minInterval = pump.minInterval || 120;
        
        return timeSinceLastDose >= minInterval;
      });
      
      if (dosablePumps.length === 0) {
        debug(MODULE, 'No nutrient pumps available for dosing due to minimum intervals');
        
        // Find the pump that will be available soonest
        const nextAvailable = nutrientPumps.map(pump => {
          const lastDoseTime = config.lastDose.nutrientPumps[pump.name] ? 
            new Date(config.lastDose.nutrientPumps[pump.name]).getTime() : 0;
          const timeSinceLastDose = (now - lastDoseTime) / 1000;
          const minInterval = pump.minInterval || 120;
          const timeRemaining = Math.max(0, minInterval - timeSinceLastDose);
          
          return { name: pump.name, timeRemaining };
        }).sort((a, b) => a.timeRemaining - b.timeRemaining)[0];
        
        return {
          action: 'waiting',
          details: {
            type: 'Nutrients',
            reason: 'No nutrient pumps available for dosing due to minimum intervals',
            nextAvailable: nextAvailable.name,
            timeRemaining: Math.round(nextAvailable.timeRemaining)
          }
        };
      }
      
      // Calculate how far EC is from target
      const ecDeficit = config.targets.ec.target - sensorData.ec;
      const ecDeviation = ecDeficit / config.targets.ec.tolerance;
      const scaleFactor = Math.min(1 + ecDeviation, 2); // Cap at 2x dosage
      
      // Total base amount to dose (will be distributed according to proportions)
      const baseTotalDoseAmount = 2.0; // 2mL total base dose
      const totalDoseAmount = baseTotalDoseAmount * scaleFactor;
      
      debug(MODULE, `Total dose amount: ${totalDoseAmount.toFixed(2)}mL (base ${baseTotalDoseAmount}mL × ${scaleFactor.toFixed(2)})`);
      
      // Calculate proportions if not already defined
      if (dosablePumps.some(pump => !pump.proportion)) {
        // Default to equal proportions
        const equalProportion = 1 / dosablePumps.length;
        dosablePumps.forEach(pump => {
          if (!pump.proportion) {
            pump.proportion = equalProportion;
          }
        });
      }
      
      // Track what was dispensed
      const dispensed = [];
      let successfulDoses = 0;
      
      // Dose each available pump
      for (const pump of dosablePumps) {
        try {
          // Calculate dose based on proportion
          const proportion = pump.proportion || (1 / dosablePumps.length);
          const doseAmount = Math.max(0.1, Math.round((totalDoseAmount * proportion) * 10) / 10);
          const flowRate = pump.flowRate || 1.0;
          
          debug(MODULE, `Dispensing ${doseAmount.toFixed(1)}mL from ${pump.name} (${(proportion * 100).toFixed(1)}% of total)`);
          
          // Dispense nutrient
          await dispensePump(pump.name as PumpName, doseAmount, flowRate);
          info(MODULE, `Successfully dispensed ${doseAmount.toFixed(1)}mL from ${pump.name}`);
          
          // Record dose
          if (!config.lastDose.nutrientPumps) {
            config.lastDose.nutrientPumps = {};
          }
          config.lastDose.nutrientPumps[pump.name] = new Date().toISOString();
          
          // Save after each successful dose in case of errors
          await saveUnifiedDosingConfig(config);
          
          successfulDoses++;
          
          dispensed.push({
            pumpName: pump.name,
            amount: doseAmount,
            proportion,
            sensorSimulation: isSensorSimulation
          });
          
          // Schedule effectiveness check if telemetry enabled
          if (config.telemetry) {
            setTimeout(async () => {
              try {
                // Get current reading after stabilization
                let currentReadings;
                
                if (await isSimulationEnabled()) {
                  currentReadings = await getSimulatedSensorReadings();
                } else {
                  currentReadings = await getAllSensorReadings();
                }
                
                // Record effectiveness
                if (!config.telemetry.doseHistory) {
                  config.telemetry.doseHistory = [];
                }
                
                const change = Math.abs(currentReadings.ec - sensorData.ec);
                const effectivenessRatio = change / doseAmount;
                
                config.telemetry.doseHistory.unshift({
                  timestamp: new Date().toISOString(),
                  pumpName: pump.name,
                  doseAmount,
                  beforeValue: sensorData.ec,
                  afterValue: currentReadings.ec,
                  effectivenessRatio,
                  targetType: 'ec'
                });
                
                // Trim history if needed
                if (config.telemetry.doseHistory.length > (config.telemetry.maxHistoryLength || 100)) {
                  config.telemetry.doseHistory = config.telemetry.doseHistory.slice(
                    0, config.telemetry.maxHistoryLength || 100
                  );
                }
                
                await saveUnifiedDosingConfig(config);
                
                debug(MODULE, `Recorded ${pump.name} effectiveness: ${effectivenessRatio.toFixed(4)} EC/mL`);
              } catch (err) {
                error(MODULE, `Error recording ${pump.name} effectiveness`, err);
              }
            }, 300000); // Check after 5 minutes for stabilization
          }
        } catch (err) {
          error(MODULE, `Error dispensing from ${pump.name}`, err);
          
          // Record in failures but continue with other pumps
          if (config.errorHandling) {
            config.errorHandling.currentFailCount = (config.errorHandling.currentFailCount || 0) + 1;
            config.errorHandling.lastFailure = Date.now();
            await saveUnifiedDosingConfig(config);
          }
        }
      }
      
      if (successfulDoses > 0) {
        // Record success for circuit breaker if enabled
        if (config.errorHandling) {
          config.errorHandling.currentFailCount = 0;
          await saveUnifiedDosingConfig(config);
        }
        
        if (successfulDoses === dosablePumps.length) {
          info(MODULE, `Successfully dosed all ${successfulDoses} nutrient pumps`);
          return {
            action: 'dosed',
            details: {
              type: 'Nutrients',
              dispensed,
              sensorSimulation: isSensorSimulation,
              reason: `EC ${sensorData.ec.toFixed(2)} below target range (${config.targets.ec.min.toFixed(2)})`
            }
          };
        } else {
          warn(MODULE, `Only dosed ${successfulDoses}/${dosablePumps.length} nutrient pumps`);
          return {
            action: 'warning',
            details: { 
              reason: `Only dosed ${successfulDoses}/${dosablePumps.length} nutrient pumps, which may affect nutrient balance`,
              dispensed
            }
          };
        }
      } else {
        warn(MODULE, 'Failed to dose any nutrient pumps');
        return {
          action: 'error',
          details: { reason: 'Failed to dose any nutrient pumps' }
        };
      }
    }
    
    // If EC is too high, we can't automatically reduce it
    if (sensorData.ec > config.targets.ec.max) {
      info(MODULE, `EC too high: ${sensorData.ec.toFixed(2)}, target: ${config.targets.ec.target.toFixed(2)}`);
      return {
        action: 'warning',
        details: {
          type: 'EC High',
          reason: `EC ${sensorData.ec.toFixed(2)} above target range (${config.targets.ec.max.toFixed(2)}). Consider adding fresh water to dilute solution.`
        }
      };
    }
    
    // If we get here, everything is within target ranges
    info(MODULE, 'All parameters within target ranges');
    
    // Record success for circuit breaker
    if (config.errorHandling) {
      config.errorHandling.currentFailCount = 0;
      await saveUnifiedDosingConfig(config);
    }
    
    return {
      action: 'none',
      details: {
        reason: 'All parameters within target ranges',
        currentValues: {
          ph: sensorData.ph,
          ec: sensorData.ec,
          waterTemp: sensorData.waterTemp
        },
        targets: config.targets
      }
    };
  } catch (err) {
    error(MODULE, 'Unexpected error in auto-dosing', err);
    
    // Record failure for circuit breaker if enabled
    if (config.errorHandling) {
      config.errorHandling.currentFailCount = (config.errorHandling.currentFailCount || 0) + 1;
      config.errorHandling.lastFailure = Date.now();
      
      if (config.errorHandling.currentFailCount >= config.errorHandling.circuitBreakerThreshold) {
        config.errorHandling.circuitOpen = true;
        warn(MODULE, `Circuit breaker opened after ${config.errorHandling.currentFailCount} failures`);
      }
      
      try {
        await saveUnifiedDosingConfig(config);
      } catch (saveErr) {
        error(MODULE, 'Failed to save config after error', saveErr);
      }
    }
    
    return {
      action: 'error',
      details: { error: `Unexpected error in auto-dosing: ${err}` }
    };
  } finally {
    // Always release the lock when we're done
    if (dosingLock.timeout) {
      clearTimeout(dosingLock.timeout);
      dosingLock.timeout = null;
    }
    dosingLock.inProgress = false;
    debug(MODULE, 'Dosing cycle completed, lock released');
  }
}
