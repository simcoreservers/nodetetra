/**
 * NuTetra Auto-Dosing System
 * Controls automatic nutrient and pH dosing based on sensor readings
 */

import { PumpName, dispensePump, getAllPumpStatus } from './pumps';
import { SensorData } from './sensors';
import { getAllSensorReadings } from './sensors';
import { getSimulatedSensorReadings, isSimulationEnabled } from './simulation';

// Define the dosing targets and thresholds
export interface DosingConfig {
  enabled: boolean;
  targets: {
    ph: {
      target: number;    // Target pH level (e.g., 6.0)
      tolerance: number; // Acceptable deviation (e.g., 0.2)
    };
    ec: {
      target: number;    // Target EC level (e.g., 1.5)
      tolerance: number; // Acceptable deviation (e.g., 0.1)
    };
  };
  dosing: {
    phUp: {
      pumpName: PumpName;
      doseAmount: number; // mL to dispense per dose
      flowRate: number;   // mL per second flow rate
      minInterval: number; // Minimum seconds between doses
    };
    phDown: {
      pumpName: PumpName;
      doseAmount: number;
      flowRate: number;
      minInterval: number;
    };
    nutrient: {
      pumpName: PumpName;
      doseAmount: number;
      flowRate: number;
      minInterval: number;
    };
  };
  lastDose: {
    phUp: Date | null;
    phDown: Date | null;
    nutrient: Date | null;
  };
}

// Default dosing configuration
const DEFAULT_DOSING_CONFIG: DosingConfig = {
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
      pumpName: 'pH Up',
      doseAmount: 1.0, // 1mL per dose
      flowRate: 1.0,   // 1mL per second
      minInterval: 300 // 5 minutes between doses
    },
    phDown: {
      pumpName: 'pH Down',
      doseAmount: 1.0,
      flowRate: 1.0,
      minInterval: 300
    },
    nutrient: {
      pumpName: 'Pump 1', // Default to Pump 1 for nutrients
      doseAmount: 2.0,
      flowRate: 1.0,
      minInterval: 600 // 10 minutes between nutrient doses
    }
  },
  lastDose: {
    phUp: null,
    phDown: null,
    nutrient: null
  }
};

// Current auto-dosing configuration
let dosingConfig: DosingConfig = { ...DEFAULT_DOSING_CONFIG };

// Store the last reading to avoid duplicate dosing
let lastReading: SensorData | null = null;

/**
 * Initialize the auto-dosing system with configuration
 */
export function initializeAutoDosing(config?: Partial<DosingConfig>): DosingConfig {
  // Merge any provided config with defaults
  if (config) {
    dosingConfig = {
      ...dosingConfig,
      ...config,
      targets: {
        ...dosingConfig.targets,
        ...(config.targets || {})
      },
      dosing: {
        ...dosingConfig.dosing,
        ...(config.dosing || {})
      },
      lastDose: {
        ...dosingConfig.lastDose,
        ...(config.lastDose || {})
      }
    };
  }
  
  console.log('Auto-dosing system initialized with configuration:', dosingConfig);
  return dosingConfig;
}

/**
 * Update the auto-dosing configuration
 */
export function updateDosingConfig(updates: Partial<DosingConfig>): DosingConfig {
  const oldEnabled = dosingConfig.enabled;
  const newEnabled = updates.enabled !== undefined ? updates.enabled : oldEnabled;
  
  // Update the configuration
  dosingConfig = {
    ...dosingConfig,
    ...updates,
    targets: {
      ...dosingConfig.targets,
      ...(updates.targets || {})
    },
    dosing: {
      ...dosingConfig.dosing,
      ...(updates.dosing || {})
    }
  };
  
  // If auto-dosing was just enabled, log this important event
  if (!oldEnabled && newEnabled) {
    console.log('Auto-dosing has been enabled with configuration:', dosingConfig);
    // Dynamically import server-init to avoid circular dependencies
    if (typeof window === 'undefined') {
      import('./server-init').then(({ initializeServer }) => {
        initializeServer().catch(err => {
          console.error('Failed to initialize server after enabling auto-dosing:', err);
        });
      }).catch(err => {
        console.error('Failed to import server-init module:', err);
      });
    }
  }
  
  return dosingConfig;
}

/**
 * Get the current auto-dosing configuration
 */
export function getDosingConfig(): DosingConfig {
  return { ...dosingConfig };
}

/**
 * Reset auto-dosing configuration to defaults
 */
export function resetDosingConfig(): DosingConfig {
  dosingConfig = { ...DEFAULT_DOSING_CONFIG };
  return dosingConfig;
}

/**
 * Check if a pump can be dosed based on its minimum interval
 * @param pumpType The type of pump ('phUp', 'phDown', or 'nutrient')
 * @returns Boolean indicating if dosing is allowed
 */
function canDose(pumpType: 'phUp' | 'phDown' | 'nutrient'): boolean {
  const lastDoseTime = dosingConfig.lastDose[pumpType];
  
  // If never dosed before, allow dosing
  if (!lastDoseTime) return true;
  
  const now = new Date();
  const timeSinceLastDose = (now.getTime() - lastDoseTime.getTime()) / 1000; // in seconds
  const minInterval = dosingConfig.dosing[pumpType].minInterval;
  
  return timeSinceLastDose >= minInterval;
}

/**
 * Record a dose event
 * @param pumpType The type of pump dosed
 */
function recordDose(pumpType: 'phUp' | 'phDown' | 'nutrient'): void {
  dosingConfig.lastDose[pumpType] = new Date();
}

/**
 * Perform the dosing based on the current sensor readings
 */
export async function performAutoDosing(): Promise<{
  action: string;
  details: any;
}> {
  // Check if auto-dosing is enabled
  if (!dosingConfig.enabled) {
    return { 
      action: 'none', 
      details: { reason: 'Auto-dosing is disabled' } 
    };
  }
  
  // Get the latest sensor readings
  let sensorData: SensorData;
  
  try {
    // Check if we should use simulated readings
    let isSimulation: boolean;
    try {
      isSimulation = await isSimulationEnabled();
    } catch (error) {
      console.error('Error checking simulation status, assuming not enabled:', error);
      isSimulation = false;
    }
    
    if (isSimulation) {
      try {
        sensorData = await getSimulatedSensorReadings();
      } catch (error) {
        console.error('Error getting simulated readings:', error);
        return { 
          action: 'error', 
          details: { error: `Failed to get simulated sensor readings: ${error}` } 
        };
      }
    } else {
      try {
        const readings = await getAllSensorReadings();
        sensorData = {
          ...readings,
          timestamp: new Date().toISOString()
        };
      } catch (error) {
        console.error('Error getting sensor readings:', error);
        return { 
          action: 'error', 
          details: { error: `Failed to get sensor readings: ${error}` } 
        };
      }
    }
  } catch (error) {
    console.error('Error getting sensor readings for auto-dosing:', error);
    return { 
      action: 'error', 
      details: { error: `Failed to get sensor readings: ${error}` } 
    };
  }
  
  // Store the reading for reference
  lastReading = sensorData;
  
  // Define the maximum execution time for auto-dosing
  const autoDoseTimeoutMs = 60000; // 60 seconds max
  const startTime = Date.now();
  
  // Ensure we don't exceed the maximum execution time
  const checkTimeout = (): boolean => {
    const elapsedTime = Date.now() - startTime;
    if (elapsedTime > autoDoseTimeoutMs) {
      console.error(`Auto-dosing execution timed out after ${elapsedTime}ms`);
      return true;
    }
    return false;
  };
  
  // Check if pH is out of range and needs adjustment
  let dosingAction = 'none';
  let dosingDetails = {};
  
  // Get pump status to make sure we don't interfere with active pumps
  let pumpStatus;
  try {
    pumpStatus = getAllPumpStatus();
  } catch (error) {
    console.error('Error getting pump status:', error);
    return { 
      action: 'error', 
      details: { error: `Failed to get pump status: ${error}` } 
    };
  }
  
  const activePumps = pumpStatus.filter(pump => pump.active).map(pump => pump.name);
  
  if (activePumps.length > 0) {
    return { 
      action: 'waiting', 
      details: { reason: `Active pumps detected: ${activePumps.join(', ')}` } 
    };
  }
  
  // Check if pH is too low (need to add pH Up)
  if (sensorData.ph < (dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance)) {
    // pH is too low, need to add pH Up solution
    if (canDose('phUp')) {
      try {
        // Check for timeout before starting a potentially long operation
        if (checkTimeout()) {
          return { 
            action: 'timeout', 
            details: { reason: 'Auto-dosing execution time limit exceeded' } 
          };
        }
        
        // Dispense pH Up solution
        const pumpName = dosingConfig.dosing.phUp.pumpName;
        const amount = dosingConfig.dosing.phUp.doseAmount;
        const flowRate = dosingConfig.dosing.phUp.flowRate;
        
        await dispensePump(pumpName, amount, flowRate);
        
        // Record the dose
        recordDose('phUp');
        
        return {
          action: 'dosed',
          details: {
            type: 'pH Up',
            amount,
            pumpName,
            reason: `pH ${sensorData.ph} below target range (${dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance})`
          }
        };
      } catch (error) {
        console.error('Error dispensing pH Up:', error);
        return {
          action: 'error',
          details: {
            type: 'pH Up',
            error: `Failed to dispense pH Up: ${error}`
          }
        };
      }
    } else {
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
    // pH is too high, need to add pH Down solution
    if (canDose('phDown')) {
      try {
        // Check for timeout before starting a potentially long operation
        if (checkTimeout()) {
          return { 
            action: 'timeout', 
            details: { reason: 'Auto-dosing execution time limit exceeded' } 
          };
        }
        
        // Dispense pH Down solution
        const pumpName = dosingConfig.dosing.phDown.pumpName;
        const amount = dosingConfig.dosing.phDown.doseAmount;
        const flowRate = dosingConfig.dosing.phDown.flowRate;
        
        await dispensePump(pumpName, amount, flowRate);
        
        // Record the dose
        recordDose('phDown');
        
        return {
          action: 'dosed',
          details: {
            type: 'pH Down',
            amount,
            pumpName,
            reason: `pH ${sensorData.ph} above target range (${dosingConfig.targets.ph.target + dosingConfig.targets.ph.tolerance})`
          }
        };
      } catch (error) {
        console.error('Error dispensing pH Down:', error);
        return {
          action: 'error',
          details: {
            type: 'pH Down',
            error: `Failed to dispense pH Down: ${error}`
          }
        };
      }
    } else {
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
    // EC is too low, need to add nutrient solution
    if (canDose('nutrient')) {
      try {
        // Check for timeout before starting a potentially long operation
        if (checkTimeout()) {
          return { 
            action: 'timeout', 
            details: { reason: 'Auto-dosing execution time limit exceeded' } 
          };
        }
        
        // Dispense nutrient solution
        const pumpName = dosingConfig.dosing.nutrient.pumpName;
        const amount = dosingConfig.dosing.nutrient.doseAmount;
        const flowRate = dosingConfig.dosing.nutrient.flowRate;
        
        await dispensePump(pumpName, amount, flowRate);
        
        // Record the dose
        recordDose('nutrient');
        
        return {
          action: 'dosed',
          details: {
            type: 'Nutrient',
            amount,
            pumpName,
            reason: `EC ${sensorData.ec} below target range (${dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance})`
          }
        };
      } catch (error) {
        console.error('Error dispensing nutrients:', error);
        return {
          action: 'error',
          details: {
            type: 'Nutrient',
            error: `Failed to dispense nutrients: ${error}`
          }
        };
      }
    } else {
      return {
        action: 'waiting',
        details: {
          type: 'Nutrient',
          reason: 'Minimum interval between doses not reached'
        }
      };
    }
  }
  
  // If we get here, everything is within target ranges
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
} 