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
    const isSimulation = await isSimulationEnabled();
    
    if (isSimulation) {
      sensorData = await getSimulatedSensorReadings();
    } else {
      const readings = await getAllSensorReadings();
      sensorData = {
        ...readings,
        timestamp: new Date().toISOString()
      };
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
  
  // Check if pH is out of range and needs adjustment
  let dosingAction = 'none';
  let dosingDetails = {};
  
  // Get pump status to make sure we don't interfere with active pumps
  const pumpStatus = getAllPumpStatus();
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
        // Dispense pH Up solution
        const pumpName = dosingConfig.dosing.phUp.pumpName;
        const amount = dosingConfig.dosing.phUp.doseAmount;
        const flowRate = dosingConfig.dosing.phUp.flowRate;
        
        await dispensePump(pumpName, amount, flowRate);
        recordDose('phUp');
        
        dosingAction = 'ph-up';
        dosingDetails = {
          initialPh: sensorData.ph,
          targetPh: dosingConfig.targets.ph.target,
          doseAmount: amount,
          pumpName
        };
      } catch (error) {
        console.error('Error dispensing pH Up solution:', error);
        return { 
          action: 'error', 
          details: { error: `Failed to dispense pH Up: ${error}` } 
        };
      }
    } else {
      dosingAction = 'waiting';
      dosingDetails = {
        reason: 'pH Up pump in cooldown period',
        phLevel: sensorData.ph,
        targetPh: dosingConfig.targets.ph.target,
        lastDose: dosingConfig.lastDose.phUp
      };
    }
  } 
  // Check if pH is too high (need to add pH Down)
  else if (sensorData.ph > (dosingConfig.targets.ph.target + dosingConfig.targets.ph.tolerance)) {
    // pH is too high, need to add pH Down solution
    if (canDose('phDown')) {
      try {
        // Dispense pH Down solution
        const pumpName = dosingConfig.dosing.phDown.pumpName;
        const amount = dosingConfig.dosing.phDown.doseAmount;
        const flowRate = dosingConfig.dosing.phDown.flowRate;
        
        await dispensePump(pumpName, amount, flowRate);
        recordDose('phDown');
        
        dosingAction = 'ph-down';
        dosingDetails = {
          initialPh: sensorData.ph,
          targetPh: dosingConfig.targets.ph.target,
          doseAmount: amount,
          pumpName
        };
      } catch (error) {
        console.error('Error dispensing pH Down solution:', error);
        return { 
          action: 'error', 
          details: { error: `Failed to dispense pH Down: ${error}` } 
        };
      }
    } else {
      dosingAction = 'waiting';
      dosingDetails = {
        reason: 'pH Down pump in cooldown period',
        phLevel: sensorData.ph,
        targetPh: dosingConfig.targets.ph.target,
        lastDose: dosingConfig.lastDose.phDown
      };
    }
  }
  
  // If pH is within range and we haven't already dosed something,
  // check if EC (nutrient level) is too low
  if (dosingAction === 'none' && 
      sensorData.ec < (dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance)) {
    // EC is too low, need to add nutrients
    if (canDose('nutrient')) {
      try {
        // Dispense nutrient solution
        const pumpName = dosingConfig.dosing.nutrient.pumpName;
        const amount = dosingConfig.dosing.nutrient.doseAmount;
        const flowRate = dosingConfig.dosing.nutrient.flowRate;
        
        await dispensePump(pumpName, amount, flowRate);
        recordDose('nutrient');
        
        dosingAction = 'nutrient';
        dosingDetails = {
          initialEc: sensorData.ec,
          targetEc: dosingConfig.targets.ec.target,
          doseAmount: amount,
          pumpName
        };
      } catch (error) {
        console.error('Error dispensing nutrient solution:', error);
        return { 
          action: 'error', 
          details: { error: `Failed to dispense nutrients: ${error}` } 
        };
      }
    } else {
      dosingAction = 'waiting';
      dosingDetails = {
        reason: 'Nutrient pump in cooldown period',
        ecLevel: sensorData.ec,
        targetEc: dosingConfig.targets.ec.target,
        lastDose: dosingConfig.lastDose.nutrient
      };
    }
  }
  
  // If we didn't trigger any dosing and we're not waiting for cooldown
  if (dosingAction === 'none') {
    dosingDetails = {
      reason: 'All parameters within target ranges',
      ph: sensorData.ph,
      ec: sensorData.ec,
      phTarget: dosingConfig.targets.ph,
      ecTarget: dosingConfig.targets.ec
    };
  }
  
  return {
    action: dosingAction,
    details: dosingDetails
  };
} 