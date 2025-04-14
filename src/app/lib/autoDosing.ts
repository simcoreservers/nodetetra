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
    // Dynamic nutrient pumps stored by their pump name
    nutrientPumps: {
      [pumpName: string]: {
        doseAmount: number;
        flowRate: number;
        minInterval: number;
        nutrientType?: string; // Optional info about the nutrient type
      }
    };
  };
  lastDose: {
    phUp: Date | null;
    phDown: Date | null;
    // Dynamic timestamps for last dosing of each pump
    nutrientPumps: {
      [pumpName: string]: Date | null;
    };
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
    nutrientPumps: {}
  },
  lastDose: {
    phUp: null,
    phDown: null,
    nutrientPumps: {}
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
    
    // Store existing intervals before reassigning pumps
    const existingIntervals: Record<string, number> = {};
    
    // Preserve existing interval settings for pH pumps
    const phUpInterval = dosingConfig.dosing.phUp.minInterval;
    const phDownInterval = dosingConfig.dosing.phDown.minInterval;
    
    // Preserve existing interval settings for nutrient pumps
    Object.keys(dosingConfig.dosing.nutrientPumps).forEach(pumpName => {
      const interval = dosingConfig.dosing.nutrientPumps[pumpName].minInterval;
      existingIntervals[pumpName] = interval;
    });
    
    // Log existing intervals
    console.log(`Existing intervals before sync:`, JSON.stringify({
      phUp: phUpInterval,
      phDown: phDownInterval,
      nutrientPumps: existingIntervals
    }, null, 2));
    
    // Default to current configuration first
    let nutrientPumps = dosingConfig.dosing.nutrientPumps;
    
    // First try to get pump assignments from profile
    if (profile.pumpAssignments && profile.pumpAssignments.length > 0) {
      const pumpAssignments: PumpAssignment[] = profile.pumpAssignments;
      console.log(`Found ${pumpAssignments.length} pump assignments in profile "${profile.name}"`);
      
      // Find all nutrient pumps from profile assignments
      const nutrientPumpsFromProfile = pumpAssignments.filter(p => 
        // Consider any pump with nutrient info as a valid nutrient pump
        p.nutrientId || p.productName || p.brandName
      ).map(p => p.pumpName as PumpName);
      
      console.log(`Found ${nutrientPumpsFromProfile.length} nutrient pumps in profile`);
      
      if (nutrientPumpsFromProfile.length > 0) {
        // Assign nutrient pumps from profile, but preserve existing intervals where possible
        nutrientPumps = nutrientPumpsFromProfile.reduce((acc, pumpName) => {
          // Check if we have an existing interval for this pump
          const existingInterval = existingIntervals[pumpName] || 180; // Default to 180 if no existing interval
          
          acc[pumpName] = {
            doseAmount: 1.0,
            flowRate: 1.0,
            minInterval: existingInterval
          };
          return acc;
        }, {} as { [pumpName: string]: { doseAmount: number; flowRate: number; minInterval: number } });
      }
    } else {
      console.log("No pump assignments found in profile, checking for available pumps");
      
      // If no pump assignments in profile, look for pumps with nutrients as fallback
      const nutrientPumpsFromSystem = pumps.filter(p => p.nutrient !== null && p.nutrient !== undefined).map(p => p.name as PumpName);
      console.log(`Found ${nutrientPumpsFromSystem.length} pumps with nutrients in system`);
      
      if (nutrientPumpsFromSystem.length > 0) {
        // Assign nutrient pumps from system, preserving existing intervals
        nutrientPumps = nutrientPumpsFromSystem.reduce((acc, pumpName) => {
          // Check if we have an existing interval for this pump
          const existingInterval = existingIntervals[pumpName] || 180; // Default to 180 if no existing interval
          
          acc[pumpName] = {
            doseAmount: 1.0,
            flowRate: 1.0,
            minInterval: existingInterval
          };
          return acc;
        }, {} as { [pumpName: string]: { doseAmount: number; flowRate: number; minInterval: number } });
      }
    }

    // Update dosingConfig with the assignments
    const updates: Partial<DosingConfig> = {
      dosing: {
        ...dosingConfig.dosing,
        phUp: {
          ...dosingConfig.dosing.phUp,
          pumpName: phUpPump,
          minInterval: phUpInterval // Preserve existing interval
        },
        phDown: {
          ...dosingConfig.dosing.phDown,
          pumpName: phDownPump,
          minInterval: phDownInterval // Preserve existing interval
        },
        nutrientPumps: nutrientPumps
      }
    };

    // Update dosing config
    updateDosingConfig(updates);
    
    console.log("Auto-dosing pump assignments updated from active profile:", {
      phUp: { pump: phUpPump, minInterval: phUpInterval },
      phDown: { pump: phDownPump, minInterval: phDownInterval },
      nutrientPumps: Object.keys(nutrientPumps).map(name => ({
        name,
        minInterval: nutrientPumps[name].minInterval
      }))
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
  
  console.log('Received updates:', JSON.stringify(updates, null, 2));
  
  // Log the before state of dosing config
  console.log('Updating dosing config, before:', JSON.stringify({
    'phUp.minInterval': dosingConfig.dosing.phUp.minInterval,
    'phDown.minInterval': dosingConfig.dosing.phDown.minInterval,
    'nutrientPumps': Object.keys(dosingConfig.dosing.nutrientPumps).map(name => ({
      name,
      minInterval: dosingConfig.dosing.nutrientPumps[name].minInterval,
      doseAmount: dosingConfig.dosing.nutrientPumps[name].doseAmount,
      flowRate: dosingConfig.dosing.nutrientPumps[name].flowRate
    }))
  }, null, 2));
  
  // Deep merge changes
  dosingConfig = deepMerge(dosingConfig, updates);
  
  // Log the after state of dosing config
  console.log('Updated dosing config, after:', JSON.stringify({
    'phUp.minInterval': dosingConfig.dosing.phUp.minInterval,
    'phDown.minInterval': dosingConfig.dosing.phDown.minInterval,
    'nutrientPumps': Object.keys(dosingConfig.dosing.nutrientPumps).map(name => ({
      name,
      minInterval: dosingConfig.dosing.nutrientPumps[name].minInterval,
      doseAmount: dosingConfig.dosing.nutrientPumps[name].doseAmount,
      flowRate: dosingConfig.dosing.nutrientPumps[name].flowRate
    }))
  }, null, 2));
  
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
  
  // Save the config to disk
  try {
    if (typeof window === 'undefined') {
      // Only save on the server side
      const fs = require('fs');
      const path = require('path');
      
      // Create data directory if it doesn't exist
      const dataPath = path.join(process.cwd(), 'data');
      if (!fs.existsSync(dataPath)) {
        fs.mkdirSync(dataPath, { recursive: true });
      }
      
      // Save dosing config
      const configPath = path.join(dataPath, 'autodosing.json');
      fs.writeFileSync(configPath, JSON.stringify(dosingConfig, null, 2), 'utf8');
      console.log('Auto-dosing config saved to:', configPath);
    }
  } catch (error) {
    console.error('Failed to save auto-dosing config:', error);
  }
  
  return dosingConfig;
}

/**
 * Deep merge two objects
 */
function deepMerge(target: any, source: any): any {
  const output = { ...target };
  
  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach(key => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  
  return output;
}

/**
 * Check if value is an object
 */
function isObject(item: any): boolean {
  return (item && typeof item === 'object' && !Array.isArray(item));
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
 * @param pumpType The type of pump ('phUp', 'phDown')
 * @returns Boolean indicating if dosing is allowed
 */
function canDose(pumpType: 'phUp' | 'phDown'): boolean {
  const lastDoseTime = dosingConfig.lastDose[pumpType];
  
  // If never dosed before, allow dosing
  if (!lastDoseTime) return true;
  
  const now = new Date();
  const timeSinceLastDose = (now.getTime() - lastDoseTime.getTime()) / 1000; // in seconds
  const minInterval = dosingConfig.dosing[pumpType].minInterval;
  
  console.log(`[canDose] ${pumpType} - Last dose: ${lastDoseTime.toISOString()}, Time since: ${timeSinceLastDose}s, Min interval: ${minInterval}s`);
  
  return timeSinceLastDose >= minInterval;
}

/**
 * Check if a nutrient pump can be dosed based on its minimum interval
 * @param pumpName The name of the nutrient pump
 * @returns Boolean indicating if dosing is allowed
 */
function canDoseNutrient(pumpName: string): boolean {
  const lastDoseTime = dosingConfig.lastDose.nutrientPumps[pumpName];
  
  // Log all nutrient pumps and their intervals when checking
  if (!lastDoseTime) {
    console.log(`[canDoseNutrient] ${pumpName} - Never dosed before, allowing dose. Configured minInterval: ${dosingConfig.dosing.nutrientPumps[pumpName]?.minInterval || 'not set, using default 180'}`);
    
    // Also log all configured nutrient pumps for reference
    const allPumps = Object.keys(dosingConfig.dosing.nutrientPumps).map(name => ({
      name,
      minInterval: dosingConfig.dosing.nutrientPumps[name]?.minInterval
    }));
    console.log(`[canDoseNutrient] All nutrient pump intervals:`, JSON.stringify(allPumps, null, 2));
    
    return true;
  }
  
  const now = new Date();
  const timeSinceLastDose = (now.getTime() - lastDoseTime.getTime()) / 1000; // in seconds
  const minInterval = dosingConfig.dosing.nutrientPumps[pumpName]?.minInterval || 180;
  
  console.log(`[canDoseNutrient] ${pumpName} - Last dose: ${lastDoseTime.toISOString()}, Time since: ${timeSinceLastDose}s, Min interval: ${minInterval}s, Can dose: ${timeSinceLastDose >= minInterval}`);
  
  return timeSinceLastDose >= minInterval;
}

/**
 * Record a dose event
 * @param pumpType The type of pump dosed
 */
function recordDose(pumpType: 'phUp' | 'phDown'): void {
  dosingConfig.lastDose[pumpType] = new Date();
}

/**
 * Record a nutrient dose event
 * @param pumpName The name of the nutrient pump dosed
 */
function recordNutrientDose(pumpName: string): void {
  if (!dosingConfig.lastDose.nutrientPumps) {
    dosingConfig.lastDose.nutrientPumps = {};
  }
  dosingConfig.lastDose.nutrientPumps[pumpName] = new Date();
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
    // EC is too low, need to add nutrient solutions
    
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
      let anyNutrientDosed = false;
      
      // Try to dispense all available nutrient pumps
      const nutrientPumpNames = Object.keys(dosingConfig.dosing.nutrientPumps);
      console.log(`Attempting to dose ${nutrientPumpNames.length} nutrient pumps`);
      
      for (const pumpName of nutrientPumpNames) {
        if (canDoseNutrient(pumpName)) {
          const pump = dosingConfig.dosing.nutrientPumps[pumpName];
          const { doseAmount, flowRate } = pump;
          
          await dispensePump(pumpName as PumpName, doseAmount, flowRate);
          recordNutrientDose(pumpName);
          
          dispensed.push({
            type: 'Nutrient',
            amount: doseAmount,
            pumpName: pumpName
          });
          
          anyNutrientDosed = true;
        }
      }
      
      if (anyNutrientDosed) {
        return {
          action: 'dosed',
          details: {
            type: 'Nutrients',
            dispensed,
            reason: `EC ${sensorData.ec} below target range (${dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance})`
          }
        };
      } else {
        return {
          action: 'waiting',
          details: {
            type: 'Nutrients',
            reason: 'Minimum interval between doses not reached for all nutrient pumps'
          }
        };
      }
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