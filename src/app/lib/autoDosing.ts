/**
 * NuTetra Auto-Dosing System
 * Controls automatic nutrient and pH dosing based on sensor readings
 */

import { PumpName, dispensePump, getAllPumpStatus } from './pumps';
import { SensorData } from './sensors';
import { getAllSensorReadings } from './sensors';
import { getSimulatedSensorReadings, isSimulationEnabled } from './simulation';
import fs from 'fs';
import path from 'path';

// Path to the active profile file
const DATA_PATH = path.join(process.cwd(), 'data');
const ACTIVE_PROFILE_FILE = path.join(DATA_PATH, 'active_profile.json');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');

// Interface for profile pump assignments
interface PumpAssignment {
  pumpName: string;
  dosage: number;
  nutrientId?: number;
  brandId?: number;
  productName?: string;
  brandName?: string;
  isAutoDosage?: boolean;
}

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
    nutrientA: {
      pumpName: PumpName;
      doseAmount: number;
      flowRate: number;
      minInterval: number;
    };
    nutrientB: {
      pumpName: PumpName;
      doseAmount: number;
      flowRate: number;
      minInterval: number;
    };
  };
  lastDose: {
    phUp: Date | null;
    phDown: Date | null;
    nutrientA: Date | null;
    nutrientB: Date | null;
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
      doseAmount: 0.5, // 0.5mL per dose
      flowRate: 1.0,   // 1mL per second
      minInterval: 120 // 2 minutes between doses
    },
    phDown: {
      pumpName: 'pH Down',
      doseAmount: 0.5,
      flowRate: 1.0,
      minInterval: 120
    },
    nutrientA: {
      pumpName: 'Pump 1', // Default to Pump 1 for nutrient A
      doseAmount: 1.0,
      flowRate: 1.0,
      minInterval: 180 // 3 minutes between doses
    },
    nutrientB: {
      pumpName: 'Pump 2', // Default to Pump 2 for nutrient B
      doseAmount: 1.0,
      flowRate: 1.0,
      minInterval: 180 // 3 minutes between doses
    }
  },
  lastDose: {
    phUp: null,
    phDown: null,
    nutrientA: null,
    nutrientB: null
  }
};

// Current auto-dosing configuration
let dosingConfig: DosingConfig = { ...DEFAULT_DOSING_CONFIG };

// Store the last reading to avoid duplicate dosing
let lastReading: SensorData | null = null;

/**
 * Helper function to get the active profile
 */
async function getActiveProfile() {
  try {
    // Check if data directory exists
    if (!fs.existsSync(DATA_PATH)) {
      console.error("Data directory doesn't exist: ", DATA_PATH);
      return null;
    }

    // Get active profile name
    if (!fs.existsSync(ACTIVE_PROFILE_FILE)) {
      console.error("Active profile file doesn't exist: ", ACTIVE_PROFILE_FILE);
      return null;
    }

    const activeProfileData = fs.readFileSync(ACTIVE_PROFILE_FILE, 'utf8');
    const activeProfileObj = JSON.parse(activeProfileData);
    
    if (!activeProfileObj.activeName) {
      console.error("No active profile name in file: ", activeProfileObj);
      return null;
    }
    
    const activeName = activeProfileObj.activeName;
    console.log("Active profile name: ", activeName);

    // Get profiles
    if (!fs.existsSync(PROFILES_FILE)) {
      console.error("Profiles file doesn't exist: ", PROFILES_FILE);
      return null;
    }

    const profilesData = fs.readFileSync(PROFILES_FILE, 'utf8');
    const profiles = JSON.parse(profilesData);
    
    if (!Array.isArray(profiles) || profiles.length === 0) {
      console.error("No profiles found or invalid profiles data");
      return null;
    }

    // Find the active profile
    const profile = profiles.find((profile: any) => profile.name === activeName);
    
    if (!profile) {
      console.error(`Active profile "${activeName}" not found in profiles`);
      return null;
    }
    
    // Log profile info for debugging
    console.log(`Found active profile: "${profile.name}", has pump assignments: ${!!profile.pumpAssignments}`);
    
    return profile;
  } catch (error) {
    console.error("Error getting active profile for auto-dosing:", error);
    return null;
  }
}

/**
 * Sync auto-dosing pump assignments with the active profile
 */
export async function syncProfilePumps(): Promise<boolean> {
  try {
    const profile = await getActiveProfile();
    if (!profile) {
      console.log("No active profile found for auto-dosing");
      return false;
    }

    // Get all available pumps
    const pumps = getAllPumpStatus();
    
    // Find the pH Up and pH Down pumps (these should be named exactly that)
    const phUpPump = pumps.find(p => p.name === 'pH Up')?.name as PumpName || dosingConfig.dosing.phUp.pumpName;
    const phDownPump = pumps.find(p => p.name === 'pH Down')?.name as PumpName || dosingConfig.dosing.phDown.pumpName;
    
    // Default to current configuration first
    let nutrientAPump = dosingConfig.dosing.nutrientA.pumpName;
    let nutrientBPump = dosingConfig.dosing.nutrientB.pumpName;
    
    // First try to get pump assignments from profile
    if (profile.pumpAssignments && profile.pumpAssignments.length > 0) {
      const pumpAssignments: PumpAssignment[] = profile.pumpAssignments;
      console.log(`Found ${pumpAssignments.length} pump assignments in profile "${profile.name}"`);
      
      // Find all nutrient pumps from profile assignments
      const nutrientPumps = pumpAssignments.filter(p => 
        // Consider any pump with nutrient info as a valid nutrient pump
        p.nutrientId || p.productName || p.brandName
      );
      
      console.log(`Found ${nutrientPumps.length} nutrient pumps in profile`);
      
      if (nutrientPumps.length > 0) {
        // Assign first nutrient pump as nutrient A
        nutrientAPump = nutrientPumps[0]?.pumpName as PumpName;
        
        // If there's a second nutrient pump, assign it as nutrient B
        if (nutrientPumps.length > 1) {
          nutrientBPump = nutrientPumps[1]?.pumpName as PumpName;
        }
      }
    } else {
      console.log("No pump assignments found in profile, checking for available pumps");
      
      // If no pump assignments in profile, look for pumps with nutrients as fallback
      const nutrientPumps = pumps.filter(p => p.nutrient !== null && p.nutrient !== undefined);
      console.log(`Found ${nutrientPumps.length} pumps with nutrients in system`);
      
      if (nutrientPumps.length > 0) {
        // Assign first nutrient pump as nutrient A
        nutrientAPump = nutrientPumps[0]?.name as PumpName;
        
        // If there's a second nutrient pump, assign it as nutrient B
        if (nutrientPumps.length > 1) {
          nutrientBPump = nutrientPumps[1]?.name as PumpName;
        }
      }
    }

    // Update dosingConfig with the assignments
    const updates: Partial<DosingConfig> = {
      dosing: {
        ...dosingConfig.dosing,
        phUp: {
          ...dosingConfig.dosing.phUp,
          pumpName: phUpPump
        },
        phDown: {
          ...dosingConfig.dosing.phDown,
          pumpName: phDownPump
        },
        nutrientA: {
          ...dosingConfig.dosing.nutrientA,
          pumpName: nutrientAPump
        },
        nutrientB: {
          ...dosingConfig.dosing.nutrientB,
          pumpName: nutrientBPump
        }
      }
    };

    // Update dosing config
    updateDosingConfig(updates);
    
    console.log("Auto-dosing pump assignments updated from active profile:", {
      phUp: phUpPump,
      phDown: phDownPump,
      nutrientA: nutrientAPump,
      nutrientB: nutrientBPump
    });
    
    return true;
  } catch (error) {
    console.error("Error syncing profile pumps for auto-dosing:", error);
    return false;
  }
}

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
  
  // Sync with profile pump assignments
  syncProfilePumps().catch(err => {
    console.error("Failed to sync profile pumps during initialization:", err);
  });
  
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
    
    // Sync with pump assignments from active profile
    syncProfilePumps().catch(err => {
      console.error("Failed to sync profile pumps when enabling auto-dosing:", err);
    });
    
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
function canDose(pumpType: 'phUp' | 'phDown' | 'nutrientA' | 'nutrientB'): boolean {
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
function recordDose(pumpType: 'phUp' | 'phDown' | 'nutrientA' | 'nutrientB'): void {
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
    // EC is too low, need to add nutrient solutions in proper ratio
    const canDoseA = canDose('nutrientA');
    const canDoseB = canDose('nutrientB');
    
    // Try to dose both nutrients if possible, or one if the other is on cooldown
    if (canDoseA || canDoseB) {
      try {
        // Check for timeout before starting a potentially long operation
        if (checkTimeout()) {
          return { 
            action: 'timeout', 
            details: { reason: 'Auto-dosing execution time limit exceeded' } 
          };
        }
        
        // Track what was dispensed
        const dispensed = [];
        
        // Try to dispense nutrient A if available
        if (canDoseA) {
          const pumpNameA = dosingConfig.dosing.nutrientA.pumpName;
          const amountA = dosingConfig.dosing.nutrientA.doseAmount;
          const flowRateA = dosingConfig.dosing.nutrientA.flowRate;
          
          await dispensePump(pumpNameA, amountA, flowRateA);
          recordDose('nutrientA');
          dispensed.push({
            type: 'Nutrient A',
            amount: amountA,
            pumpName: pumpNameA
          });
        }
        
        // Try to dispense nutrient B if available
        if (canDoseB) {
          const pumpNameB = dosingConfig.dosing.nutrientB.pumpName;
          const amountB = dosingConfig.dosing.nutrientB.doseAmount;
          const flowRateB = dosingConfig.dosing.nutrientB.flowRate;
          
          await dispensePump(pumpNameB, amountB, flowRateB);
          recordDose('nutrientB');
          dispensed.push({
            type: 'Nutrient B',
            amount: amountB,
            pumpName: pumpNameB
          });
        }
        
        return {
          action: 'dosed',
          details: {
            type: 'Nutrients',
            dispensed,
            reason: `EC ${sensorData.ec} below target range (${dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance})`
          }
        };
      } catch (error) {
        console.error('Error dispensing nutrients:', error);
        return {
          action: 'error',
          details: {
            type: 'Nutrients',
            error: `Failed to dispense nutrients: ${error}`
          }
        };
      }
    } else {
      return {
        action: 'waiting',
        details: {
          type: 'Nutrients',
          reason: 'Minimum interval between doses not reached for both nutrient pumps'
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