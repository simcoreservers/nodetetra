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
import { info, error, debug, trace, warn } from './logger';

// Module name for logging
const MODULE = 'autoDosing';

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
        proportion?: number;   // Relative proportion for balanced dosing
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

// Add at the top of the file, near the other variable declarations
let isInitialized = false;

// Dosing lock to prevent concurrent dosing operations
let dosingInProgress = false;
let dosingLockTimeout: NodeJS.Timeout | null = null;
const MAX_DOSING_LOCK_TIME = 60000; // 60 seconds max lock time as safety measure

// Export the dosing status for API and UI
export { dosingInProgress };

// Try to load the saved configuration from disk
try {
  if (typeof window === 'undefined') {
    const fs = require('fs');
    const path = require('path');
    
    const dataPath = path.join(process.cwd(), 'data');
    const configPath = path.join(dataPath, 'autodosing.json');
    
    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      info(MODULE, 'Loading saved auto-dosing config from disk', { path: configPath });
      
      // Deep merge the saved config with defaults to ensure all properties exist
      dosingConfig = deepMerge(DEFAULT_DOSING_CONFIG, savedConfig);
      
      // Convert date strings back to Date objects
      if (dosingConfig.lastDose.phUp) {
        dosingConfig.lastDose.phUp = new Date(dosingConfig.lastDose.phUp);
      }
      if (dosingConfig.lastDose.phDown) {
        dosingConfig.lastDose.phDown = new Date(dosingConfig.lastDose.phDown);
      }
      
      // Convert nutrient pump date strings back to Date objects
      Object.keys(dosingConfig.lastDose.nutrientPumps).forEach(pumpName => {
        const timestamp = dosingConfig.lastDose.nutrientPumps[pumpName];
        if (timestamp) {
          dosingConfig.lastDose.nutrientPumps[pumpName] = new Date(timestamp);
        }
      });
      
      debug(MODULE, 'Loaded auto-dosing configuration', {
        'phUp.minInterval': dosingConfig.dosing.phUp.minInterval,
        'phDown.minInterval': dosingConfig.dosing.phDown.minInterval,
        'nutrientPumps': Object.keys(dosingConfig.dosing.nutrientPumps).map(name => ({
          name,
          minInterval: dosingConfig.dosing.nutrientPumps[name].minInterval
        }))
      });
    } else {
      info(MODULE, 'No existing auto-dosing config found, using defaults');
    }
  }
} catch (err) {
  error(MODULE, 'Error loading auto-dosing config from disk', err);
  // Continue with defaults if loading fails
}

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
    console.log("=== STARTING PUMP SYNC WITH PROFILE ===");
    
    // Create a snapshot of all current minInterval settings that we'll preserve
    const currentSettings = {
      phUp: dosingConfig.dosing.phUp.minInterval,
      phDown: dosingConfig.dosing.phDown.minInterval,
      nutrientPumps: {} as Record<string, number>
    };
    
    // Save all nutrient pump intervals with their current values
    Object.keys(dosingConfig.dosing.nutrientPumps).forEach(pumpName => {
      currentSettings.nutrientPumps[pumpName] = dosingConfig.dosing.nutrientPumps[pumpName].minInterval;
    });
    
    console.log("Current interval settings that will be preserved:", JSON.stringify(currentSettings, null, 2));
    
    // Get active profile
    const profile = await getActiveProfile();
    if (!profile) {
      console.error("Failed to get active profile for auto-dosing sync");
      return false;
    }

    // Check if profile has pump assignments
    if (!profile.pumpAssignments && !profile.pumpDosages) {
      console.error("Profile has no pump assignments or dosages:", profile.name);
      return false;
    }
    
    // Use pumpDosages if it exists, otherwise fallback to pumpAssignments
    const pumpSettings = profile.pumpDosages || profile.pumpAssignments || [];
    
    if (pumpSettings.length === 0) {
      console.error("Profile has empty pump settings:", profile.name);
      return false;
    }
    
    console.log(`Found ${pumpSettings.length} pump settings in profile ${profile.name}`);
    
    // Create a clean config copy
    const updatedConfig = { ...dosingConfig };
    
    // Ensure nutrient pumps object exists
    updatedConfig.dosing.nutrientPumps = {};
    
    // Ensure nutrient pump timestamps object exists
    if (!updatedConfig.lastDose.nutrientPumps) {
      updatedConfig.lastDose.nutrientPumps = {};
    }
    
    // Track added/modified pumps
    const modifiedPumps: string[] = [];
    
    // Process pH pumps first
    const phUpPump = pumpSettings.find((p: PumpAssignment) => 
      p.pumpName && p.pumpName.toLowerCase().includes('ph') && p.pumpName.toLowerCase().includes('up')
    );
    
    const phDownPump = pumpSettings.find((p: PumpAssignment) => 
      p.pumpName && p.pumpName.toLowerCase().includes('ph') && p.pumpName.toLowerCase().includes('down')
    );
    
    // Update pH Up pump if defined
    if (phUpPump && phUpPump.pumpName) {
      updatedConfig.dosing.phUp.pumpName = phUpPump.pumpName as PumpName;
      console.log(`Set pH Up pump to "${phUpPump.pumpName}"`);
    }
    
    // Update pH Down pump if defined
    if (phDownPump && phDownPump.pumpName) {
      updatedConfig.dosing.phDown.pumpName = phDownPump.pumpName as PumpName;
      console.log(`Set pH Down pump to "${phDownPump.pumpName}"`);
    }
    
    // Get only nutrient pumps (filter out pH and water pumps)
    const nutrientPumps = pumpSettings.filter((p: PumpAssignment) => 
      p.pumpName && 
      !(p.pumpName.toLowerCase().includes('ph') || p.pumpName.toLowerCase() === 'water')
    );
    
    // Calculate total dosage for nutrient ratio calculations
    const totalDosage = nutrientPumps.reduce((sum: number, pump: PumpAssignment) => 
      sum + (Number(pump.dosage) || 0), 0);
    
    const hasNutrientDosages = totalDosage > 0;
    
    console.log(`Found ${nutrientPumps.length} nutrient pumps with total dosage ${totalDosage}`);
    
    // Process nutrient pumps
    for (const pump of nutrientPumps) {
      if (pump.pumpName) {
        modifiedPumps.push(pump.pumpName);
        
        // Store the nutrient type info if available
        const nutrientInfo = pump.productName ? 
          (pump.brandName ? `${pump.brandName} ${pump.productName}` : pump.productName) : 
          'General Nutrient';
        
        // Base dose amount (will be adjusted based on profile dosage settings)
        let baseDoseAmount = 0.5; // Default is 0.5mL per dose
        let proportion: number | undefined = undefined;
        
        // If we have dosage information in the profile, use it to set relative dosing
        if (hasNutrientDosages && Number(pump.dosage) > 0) {
          // Calculate proportion for balanced dosing
          proportion = Number(pump.dosage) / totalDosage;
          
          // Scale the base dose amount based on relative proportion (minimum 0.1mL)
          baseDoseAmount = Math.max(0.1, proportion * 2.5);
          baseDoseAmount = Math.round(baseDoseAmount * 10) / 10; // Round to 1 decimal place
          
          console.log(`${pump.pumpName}: dosage=${pump.dosage}, proportion=${proportion.toFixed(2)}, baseDose=${baseDoseAmount}mL`);
        } else {
          console.log(`${pump.pumpName}: No dosage defined, using default of ${baseDoseAmount}mL`);
        }
        
        // Get existing pump settings if this pump was already configured
        const existingPump = dosingConfig.dosing.nutrientPumps[pump.pumpName];
        
        // Add or update the nutrient pump config
        updatedConfig.dosing.nutrientPumps[pump.pumpName] = {
          // Default values for new pumps
          doseAmount: baseDoseAmount,
          flowRate: 1.0,
          minInterval: 120,
          
          // Preserve existing values if the pump was already configured
          ...(existingPump ? {
            doseAmount: existingPump.doseAmount,
            flowRate: existingPump.flowRate,
            minInterval: existingPump.minInterval
          } : {}),
          
          // Always update these fields
          nutrientType: nutrientInfo,
          proportion: proportion
        };
        
        // Preserve custom interval settings
        if (currentSettings.nutrientPumps[pump.pumpName]) {
          updatedConfig.dosing.nutrientPumps[pump.pumpName].minInterval = 
            currentSettings.nutrientPumps[pump.pumpName];
        }
        
        console.log(`Configured nutrient pump "${pump.pumpName}" with doseAmount=${updatedConfig.dosing.nutrientPumps[pump.pumpName].doseAmount}mL`);
      }
    }
    
    // Preserve pH pump intervals
    if (currentSettings.phUp) {
      updatedConfig.dosing.phUp.minInterval = currentSettings.phUp;
    }
    
    if (currentSettings.phDown) {
      updatedConfig.dosing.phDown.minInterval = currentSettings.phDown;
    }
    
    // Apply all updates to the actual config
    dosingConfig = updatedConfig;
    
    // Initialize timestamps for all pumps
    for (const pumpName of modifiedPumps) {
      if (!dosingConfig.lastDose.nutrientPumps[pumpName]) {
        dosingConfig.lastDose.nutrientPumps[pumpName] = null;
        console.log(`Initialized timestamp for new pump: ${pumpName}`);
      }
    }
    
    // Always save config after syncing
    saveDosingConfig();
    
    console.log("=== PROFILE PUMP SYNC COMPLETED SUCCESSFULLY ===");
    return true;
  } catch (error) {
    console.error("Error syncing profile pumps to auto-dosing:", error);
    return false;
  }
}

/**
 * Load the auto-dosing configuration from disk
 */
async function loadDosingConfigFromDisk(): Promise<void> {
  try {
    const data = await getServerJSON<DosingConfig>('data/autodosing.json');
    if (data) {
      console.log('Loaded auto-dosing configuration from disk');
      // Deep merge to preserve any default settings not in saved file
      dosingConfig = deepMerge(dosingConfig, data);
    } else {
      console.log('No saved auto-dosing configuration found, using defaults');
    }
  } catch (error) {
    console.error('Failed to load auto-dosing configuration from disk:', error);
  }
}

/**
 * Initialize the auto-dosing system with configuration
 */
export async function initializeAutoDosing(): Promise<boolean> {
  try {
    // If not already initialized, load from disk first
    if (!isInitialized) {
      console.log("== AUTO-DOSING: INITIALIZING ==");
      await loadDosingConfigFromDisk(); // Must happen first to load saved settings

      // Only sync with profile if we have an active profile
      const profile = await getActiveProfile();
      if (profile) {
        // We'll only sync pumps on first initialization, but we won't
        // change any intervals that were already loaded from disk
        await syncProfilePumps();
      } else {
        console.log("No active profile found, skipping profile pump sync");
      }
      
      isInitialized = true;
      console.log("== AUTO-DOSING: INITIALIZATION COMPLETE ==");
      
      // Debug output to verify final initialized config
      console.log("Final initialized dosing config:", {
        enabled: dosingConfig.enabled,
        phTarget: dosingConfig.targets.ph.target,
        ecTarget: dosingConfig.targets.ec.target,
        phUp: { 
          pump: dosingConfig.dosing.phUp.pumpName, 
          interval: dosingConfig.dosing.phUp.minInterval 
        },
        phDown: { 
          pump: dosingConfig.dosing.phDown.pumpName, 
          interval: dosingConfig.dosing.phDown.minInterval 
        },
        nutrientPumps: Object.keys(dosingConfig.dosing.nutrientPumps).map(name => ({
          name,
          interval: dosingConfig.dosing.nutrientPumps[name].minInterval
        }))
      });
      
      return true;
    }
    return true;
  } catch (error) {
    console.error("Failed to initialize auto-dosing:", error);
    return false;
  }
}

/**
 * Update the auto-dosing configuration
 */
export function updateDosingConfig(updates: Partial<DosingConfig>): DosingConfig {
  const oldEnabled = dosingConfig.enabled;
  const newEnabled = updates.enabled !== undefined ? updates.enabled : oldEnabled;
  
  console.log('Received updates:', JSON.stringify(updates, null, 2));
  
  // Check if any minInterval values have changed
  const hasIntervalChanges = checkForIntervalChanges(updates);
  
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
  
  // If intervals changed, reset lastDose timestamps to allow immediate dosing
  if (hasIntervalChanges) {
    console.log('Interval settings changed, resetting lastDose timestamps');
    resetDoseTimestamps();
  }
  
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
    
    // Reset lastDose timestamps when enabling to allow immediate dosing
    resetDoseTimestamps();
    
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
 * Get JSON data from a server-side file
 * @param filePath The path to the JSON file, relative to the project root
 * @returns The parsed JSON data, or null if the file doesn't exist
 */
async function getServerJSON<T>(filePath: string): Promise<T | null> {
  try {
    // Only allow server-side execution
    if (typeof window !== 'undefined') {
      throw new Error('This function can only be called from server-side code');
    }
    
    const fs = require('fs');
    const path = require('path');
    
    const fullPath = path.join(process.cwd(), filePath);
    
    if (!fs.existsSync(fullPath)) {
      console.log(`File not found: ${fullPath}`);
      return null;
    }
    
    const rawData = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(rawData) as T;
  } catch (error) {
    console.error(`Error reading JSON from ${filePath}:`, error);
    throw error; // Re-throw to let the caller handle it
  }
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
  if (!lastDoseTime) {
    trace(MODULE, `${pumpType} - Never dosed before, allowing dose`);
    return true;
  }
  
  // Get timestamps as primitive numbers
  const lastDoseTimestamp = typeof lastDoseTime === 'object' ? 
    lastDoseTime.getTime() : 
    (new Date(lastDoseTime)).getTime();
  
  const nowTimestamp = Date.now();
  
  // Calculate time difference in seconds
  const timeSinceLastDose = (nowTimestamp - lastDoseTimestamp) / 1000;
  const minInterval = Number(dosingConfig.dosing[pumpType].minInterval);
  
  const canDoseNow = timeSinceLastDose >= minInterval;
  
  trace(MODULE, `${pumpType} interval check: ${timeSinceLastDose.toFixed(1)}s of ${minInterval}s required, can dose: ${canDoseNow}`);
  
  return canDoseNow;
}

/**
 * Check if a nutrient pump can be dosed based on its minimum interval
 * @param pumpName The name of the nutrient pump
 * @returns Boolean indicating if dosing is allowed
 */
function canDoseNutrient(pumpName: string): boolean {
  // If pump doesn't exist in config, return false
  if (!dosingConfig.dosing.nutrientPumps[pumpName]) {
    warn(MODULE, `${pumpName} - Pump not found in configuration`);
    return false;
  }

  const lastDoseTime = dosingConfig.lastDose.nutrientPumps[pumpName];
  
  // If never dosed before, allow dosing
  if (!lastDoseTime) {
    trace(MODULE, `${pumpName} - Never dosed before, allowing dose`);
    return true;
  }
  
  // Get timestamps as primitive numbers
  const lastDoseTimestamp = typeof lastDoseTime === 'object' ? 
    lastDoseTime.getTime() : 
    (new Date(lastDoseTime)).getTime();
  
  const nowTimestamp = Date.now();
  
  // Calculate time difference in seconds
  const timeSinceLastDose = (nowTimestamp - lastDoseTimestamp) / 1000;
  const minInterval = Number(dosingConfig.dosing.nutrientPumps[pumpName]?.minInterval || 120);
  
  const canDoseNow = timeSinceLastDose >= minInterval;
  
  trace(MODULE, `${pumpName} interval check: ${timeSinceLastDose.toFixed(1)}s of ${minInterval}s required, can dose: ${canDoseNow}`);
  
  return canDoseNow;
}

/**
 * Record a dose event
 * @param pumpType The type of pump dosed
 */
function recordDose(pumpType: 'phUp' | 'phDown'): void {
  const now = new Date();
  debug(MODULE, `Recording ${pumpType} dose at ${now.toISOString()}`);
  
  // Store the current date
  dosingConfig.lastDose[pumpType] = now;
  
  // Immediately save to disk to ensure timestamps are preserved across restarts
  saveDosingConfig();
}

/**
 * Record a nutrient dose event
 * @param pumpName The name of the nutrient pump dosed
 */
function recordNutrientDose(pumpName: string): void {
  if (!dosingConfig.lastDose.nutrientPumps) {
    dosingConfig.lastDose.nutrientPumps = {};
  }
  
  const now = new Date();
  debug(MODULE, `Recording dose for ${pumpName} at ${now.toISOString()}`);
  
  // Store the current date
  dosingConfig.lastDose.nutrientPumps[pumpName] = now;
  
  // Immediately save to disk to ensure timestamps are preserved across restarts
  saveDosingConfig();
}

/**
 * Save the current dosing configuration to disk
 * This is a utility function to ensure config is saved after recording doses
 */
function saveDosingConfig(): void {
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
      trace(MODULE, 'Auto-dosing config saved with updated dose timestamps');
    }
  } catch (err) {
    error(MODULE, 'Failed to save auto-dosing config', err);
  }
}

/**
 * Perform nutrient dosing - extracted as a separate function to ensure proper async handling
 */
async function doNutrientDosing(sensorData: SensorData, isSimulation: boolean): Promise<{
  action: string;
  details: any;
}> {
  console.log(`[doNutrientDosing] Starting nutrient dosing process for EC ${sensorData.ec}, target: ${dosingConfig.targets.ec.target}`);
  
  try {
    // Calculate how far EC is from target
    const ecDeficit = dosingConfig.targets.ec.target - sensorData.ec;
    const ecDeviation = ecDeficit / dosingConfig.targets.ec.tolerance;
    const scaleFactor = Math.min(1 + ecDeviation, 2); // Cap at 2x dosage
    
    console.log(`[doNutrientDosing] EC deficit: ${ecDeficit.toFixed(2)}, scale factor: ${scaleFactor.toFixed(2)}`);
    
    // Get active profile for nutrient proportions
    const profile = await getActiveProfile();
    if (!profile) {
      console.error('[doNutrientDosing] No active profile found');
      return {
        action: 'error',
        details: { reason: 'No active profile found for nutrient dosing' }
      };
    }
    
    // Verify we have pump assignments in the profile
    const pumpDosages = profile.pumpDosages || [];
    if (pumpDosages.length === 0) {
      console.error('[doNutrientDosing] No pump dosages defined in active profile');
      return {
        action: 'error',
        details: { reason: 'No pump dosages defined in active profile' }
      };
    }
    
    // Get nutrient pumps (not pH pumps) from profile
    const nutrientPumpDosages = pumpDosages.filter((p: any) => 
      p.pumpName && 
      !(p.pumpName.toLowerCase().includes('ph') || p.pumpName.toLowerCase() === 'water')
    );
    
    if (nutrientPumpDosages.length === 0) {
      console.error('[doNutrientDosing] No nutrient pumps defined in active profile');
      return {
        action: 'error',
        details: { reason: 'No nutrient pumps defined in active profile' }
      };
    }
    
    // Calculate total dosage for proportional mixing
    const totalDosage = nutrientPumpDosages.reduce((sum: number, pump: any) => 
      sum + (Number(pump.dosage) || 0), 0);
      
    if (totalDosage <= 0) {
      console.error('[doNutrientDosing] Zero total dosage for nutrients in profile');
      return {
        action: 'error',
        details: { reason: 'Zero total dosage for nutrients in profile' }
      };
    }
    
    console.log(`[doNutrientDosing] Total dosage from profile: ${totalDosage}, ${nutrientPumpDosages.length} nutrient pumps`);
    
    // Calculate proportions for each pump based on profile
    const nutrientProportions: Record<string, number> = {};
    nutrientPumpDosages.forEach((pump: any) => {
      if (pump.pumpName && Number(pump.dosage) > 0) {
        nutrientProportions[pump.pumpName] = Number(pump.dosage) / totalDosage;
        console.log(`[doNutrientDosing] ${pump.pumpName}: dosage=${pump.dosage}, proportion=${nutrientProportions[pump.pumpName].toFixed(2)}`);
      }
    });
    
    // Get configured pumps from dosing config
    const configuredPumps = Object.keys(dosingConfig.dosing.nutrientPumps);
    console.log(`[doNutrientDosing] Configured pumps in auto-dosing: ${configuredPumps.join(', ')}`);
    
    // Check which pumps we can actually dose (based on timing)
    const dosablePumps = configuredPumps.filter(pumpName => {
      const canDose = canDoseNutrient(pumpName);
      console.log(`[doNutrientDosing] ${pumpName} can dose: ${canDose}`);
      return canDose;
    });
    
    if (dosablePumps.length === 0) {
      console.log('[doNutrientDosing] No pumps available for dosing (timing restrictions)');
      return {
        action: 'waiting',
        details: { reason: 'No nutrient pumps available for dosing due to minimum interval restrictions' }
      };
    }
    
    console.log(`[doNutrientDosing] ${dosablePumps.length} pumps available for dosing`);
    
    // Total base amount to dose (will be distributed according to proportions)
    const baseTotalDoseAmount = 2.0; // 2mL total base dose
    const totalDoseAmount = baseTotalDoseAmount * scaleFactor;
    
    console.log(`[doNutrientDosing] Total dose amount: ${totalDoseAmount.toFixed(2)}mL (base ${baseTotalDoseAmount}mL × ${scaleFactor.toFixed(2)})`);
    
    // Track what was dispensed
    const dispensed = [];
    let successfulDoses = 0;
    
    // Dose each available pump
    for (const pumpName of dosablePumps) {
      try {
        // Skip if pump not in profile or has zero proportion
        if (!nutrientProportions[pumpName] || nutrientProportions[pumpName] <= 0) {
          console.log(`[doNutrientDosing] Skipping ${pumpName} - not in profile or zero proportion`);
          continue;
        }
        
        // Get pump config
        const pump = dosingConfig.dosing.nutrientPumps[pumpName];
        
        // Calculate dose based on proportion
        const proportion = nutrientProportions[pumpName];
        const doseAmount = Math.max(0.1, Math.round((totalDoseAmount * proportion) * 10) / 10);
        const flowRate = pump.flowRate || 1.0;
        
        console.log(`[doNutrientDosing] Dispensing ${doseAmount.toFixed(1)}mL from ${pumpName} (${(proportion * 100).toFixed(1)}% of total)`);
        
        if (isSimulation) {
          console.log(`[doNutrientDosing] SIMULATION: Would dispense ${doseAmount.toFixed(1)}mL from ${pumpName}`);
        } else {
          // Actually dispense the nutrient
          console.log(`[doNutrientDosing] ACTUALLY DISPENSING ${doseAmount.toFixed(1)}mL from ${pumpName}`);
          await dispensePump(pumpName as PumpName, doseAmount, flowRate);
        }
        
        // Record the successful dose
        recordNutrientDose(pumpName);
        successfulDoses++;
        
        dispensed.push({
          pumpName,
          amount: doseAmount,
          proportion,
          simulated: isSimulation
        });
      } catch (error) {
        console.error(`[doNutrientDosing] Error dispensing from ${pumpName}:`, error);
        // Continue with other pumps despite errors
      }
    }
    
    if (successfulDoses > 0) {
      console.log(`[doNutrientDosing] Successfully dosed ${successfulDoses} nutrient pumps`);
      return {
        action: 'dosed',
        details: {
          type: 'Nutrients',
          dispensed,
          simulated: isSimulation,
          reason: `EC ${sensorData.ec} below target range (${dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance})`
        }
      };
    } else {
      console.log('[doNutrientDosing] Failed to dose any pumps');
      return {
        action: 'error',
        details: { reason: 'Failed to dose any nutrient pumps' }
      };
    }
  } catch (error) {
    console.error('[doNutrientDosing] Error during nutrient dosing:', error);
    // Note: We're NOT releasing the dosing lock here - that's handled by the parent function
    return {
      action: 'error',
      details: { error: `Error during nutrient dosing: ${error}` }
    };
  }
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
    debug(MODULE, 'Auto-dosing is disabled, skipping cycle');
    return { 
      action: 'none', 
      details: { reason: 'Auto-dosing is disabled' } 
    };
  }
  
  // Check if a dosing operation is already in progress
  if (dosingInProgress) {
    warn(MODULE, 'Dosing already in progress, cannot start another operation');
    return {
      action: 'waiting',
      details: { reason: 'A dosing operation is already in progress' }
    };
  }
  
  try {
    // Acquire dosing lock
    dosingInProgress = true;
    
    // Set safety timeout to release lock in case of unhandled errors
    if (dosingLockTimeout) {
      clearTimeout(dosingLockTimeout);
    }
    dosingLockTimeout = setTimeout(() => {
      warn(MODULE, 'Safety timeout reached, releasing dosing lock');
      dosingInProgress = false;
      dosingLockTimeout = null;
    }, MAX_DOSING_LOCK_TIME);
    
    info(MODULE, 'Starting auto-dosing cycle (LOCK ACQUIRED)');
  
    // Get the latest sensor readings
    let sensorData: SensorData;
    let isSimulation = false;
  
    try {
      // Check if we should use simulated readings
      isSimulation = await isSimulationEnabled();
      debug(MODULE, `Simulation mode: ${isSimulation ? 'ENABLED' : 'DISABLED'}`);
      
      if (isSimulation) {
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
      return { 
        action: 'error', 
        details: { error: `Failed to get sensor readings: ${err}` } 
      };
    } finally {
      // Make sure we unlock if the function exits here
      if (dosingLockTimeout) {
        clearTimeout(dosingLockTimeout);
        dosingLockTimeout = null;
      }
    }
    
    // Store the reading for reference
    lastReading = sensorData;
    
    // Check for already active pumps (don't dose if pumps are already running)
    if (!isSimulation) {
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
    }
    
    // Handle pH adjustment first - pH is always prioritized over EC adjustment

    // Check if pH is too low (need to add pH Up)
    if (sensorData.ph < (dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance)) {
      info(MODULE, `pH too low: ${sensorData.ph.toFixed(2)}, target: ${dosingConfig.targets.ph.target.toFixed(2)}`);
      
      // Check if we can dose pH Up
      if (canDose('phUp')) {
        try {
          // Calculate dose amount based on how far from target
          const phDelta = dosingConfig.targets.ph.target - sensorData.ph;
          const baseDoseAmount = dosingConfig.dosing.phUp.doseAmount;
          // Scale the dose amount based on how far pH is from target (max 2x base dose)
          const scaleFactor = Math.min(1 + (phDelta / dosingConfig.targets.ph.tolerance), 2);
          const amount = Math.round((baseDoseAmount * scaleFactor) * 10) / 10; // Round to 1 decimal place
          
          const pumpName = dosingConfig.dosing.phUp.pumpName;
          const flowRate = dosingConfig.dosing.phUp.flowRate;
          
          info(MODULE, `Dispensing ${amount}ml of pH Up from ${pumpName} at ${flowRate}ml/s`);
          
          if (!isSimulation) {
            await dispensePump(pumpName, amount, flowRate);
            info(MODULE, `Successfully dispensed ${amount}ml of pH Up`);
          } else {
            info(MODULE, `SIMULATION: Would dispense ${amount}ml of pH Up`);
          }
          
          // Record the dose in both real and simulation modes
          recordDose('phUp');
          
          return {
            action: 'dosed',
            details: {
              type: 'pH Up',
              amount,
              pumpName,
              simulated: isSimulation,
              reason: `pH ${sensorData.ph} below target range (${dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance})`
            }
          };
        } catch (err) {
          error(MODULE, 'Error dispensing pH Up', err);
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
            reason: 'Minimum interval between doses not reached'
          }
        };
      }
    }
    
    // Check if pH is too high (need to add pH Down)
    if (sensorData.ph > (dosingConfig.targets.ph.target + dosingConfig.targets.ph.tolerance)) {
      info(MODULE, `pH too high: ${sensorData.ph.toFixed(2)}, target: ${dosingConfig.targets.ph.target.toFixed(2)}`);
      
      // Check if we can dose pH Down
      if (canDose('phDown')) {
        try {
          // Calculate dose amount based on how far from target
          const phDelta = sensorData.ph - dosingConfig.targets.ph.target;
          const baseDoseAmount = dosingConfig.dosing.phDown.doseAmount;
          // Scale the dose amount based on how far pH is from target (max 2x base dose)
          const scaleFactor = Math.min(1 + (phDelta / dosingConfig.targets.ph.tolerance), 2);
          const amount = Math.round((baseDoseAmount * scaleFactor) * 10) / 10; // Round to 1 decimal place
          
          const pumpName = dosingConfig.dosing.phDown.pumpName;
          const flowRate = dosingConfig.dosing.phDown.flowRate;
          
          info(MODULE, `Dispensing ${amount}ml of pH Down from ${pumpName} at ${flowRate}ml/s`);
          
          if (!isSimulation) {
            await dispensePump(pumpName, amount, flowRate);
            info(MODULE, `Successfully dispensed ${amount}ml of pH Down`);
          } else {
            info(MODULE, `SIMULATION: Would dispense ${amount}ml of pH Down`);
          }
          
          // Record the dose in both real and simulation modes
          recordDose('phDown');
          
          return {
            action: 'dosed',
            details: {
              type: 'pH Down',
              amount,
              pumpName,
              simulated: isSimulation,
              reason: `pH ${sensorData.ph} above target range (${dosingConfig.targets.ph.target + dosingConfig.targets.ph.tolerance})`
            }
          };
        } catch (err) {
          error(MODULE, 'Error dispensing pH Down', err);
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
            reason: 'Minimum interval between doses not reached'
          }
        };
      }
    }
    
    // Check if EC is too low (need to add nutrients)
    if (sensorData.ec < (dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance)) {
      info(MODULE, `EC too low: ${sensorData.ec.toFixed(2)}, target: ${dosingConfig.targets.ec.target.toFixed(2)}`);
      
      // Use dedicated function for nutrient dosing to ensure proper async handling
      return await doNutrientDosing(sensorData, isSimulation);
    }
    
    // If EC is too high, we can't automatically reduce it (requires water change)
    if (sensorData.ec > (dosingConfig.targets.ec.target + dosingConfig.targets.ec.tolerance)) {
      info(MODULE, `EC too high: ${sensorData.ec.toFixed(2)}, target: ${dosingConfig.targets.ec.target.toFixed(2)}`);
      return {
        action: 'warning',
        details: {
          type: 'EC High',
          reason: `EC ${sensorData.ec} above target range (${dosingConfig.targets.ec.target + dosingConfig.targets.ec.tolerance}). Consider adding fresh water to dilute solution.`
        }
      };
    }
    
    // If we get here, everything is within target ranges
    info(MODULE, 'All parameters within target ranges');
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
  } catch (err) {
    error(MODULE, 'Unexpected error in auto-dosing', err);
    return {
      action: 'error',
      details: { error: `Unexpected error in auto-dosing: ${err}` }
    };
  } finally {
    // Always release the lock when we're done, regardless of outcome
    if (dosingLockTimeout) {
      clearTimeout(dosingLockTimeout);
      dosingLockTimeout = null;
    }
    dosingInProgress = false;
    debug(MODULE, 'Dosing cycle completed, lock released');
  }
}

/**
 * Check if interval settings were changed in the updates
 */
function checkForIntervalChanges(updates: Partial<DosingConfig>): boolean {
  if (!updates.dosing) return false;
  
  // Check pH Up/Down interval changes
  if (updates.dosing.phUp?.minInterval !== undefined && 
      updates.dosing.phUp.minInterval !== dosingConfig.dosing.phUp.minInterval) {
    return true;
  }
  
  if (updates.dosing.phDown?.minInterval !== undefined && 
      updates.dosing.phDown.minInterval !== dosingConfig.dosing.phDown.minInterval) {
    return true;
  }
  
  // Check nutrient pump interval changes
  if (updates.dosing.nutrientPumps) {
    for (const pumpName in updates.dosing.nutrientPumps) {
      const updatedInterval = updates.dosing.nutrientPumps[pumpName]?.minInterval;
      const currentInterval = dosingConfig.dosing.nutrientPumps[pumpName]?.minInterval;
      
      if (updatedInterval !== undefined && updatedInterval !== currentInterval) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Reset all lastDose timestamps to allow immediate dosing
 */
function resetDoseTimestamps(): void {
  console.log('[resetDoseTimestamps] Resetting all dose timestamps to allow immediate dosing');
  dosingConfig.lastDose.phUp = null;
  dosingConfig.lastDose.phDown = null;
  dosingConfig.lastDose.nutrientPumps = {};
  
  // Save immediately to persist changes
  saveDosingConfig();
}

/**
 * Force the next dosing cycle by resetting the last dose timestamps
 * This allows a dosing to occur immediately, ignoring the minimum interval
 */
export function forceNextDosing(): void {
  console.log('Forcing next dosing cycle by resetting dose timestamps');
  
  // Reset all dose timestamps
  dosingConfig.lastDose.phUp = null;
  dosingConfig.lastDose.phDown = null;
  
  // Reset nutrient pump timestamps
  Object.keys(dosingConfig.lastDose.nutrientPumps).forEach(pumpName => {
    dosingConfig.lastDose.nutrientPumps[pumpName] = null;
  });
  
  // Save the updated configuration
  saveDosingConfig();
  
  console.log('Dose timestamps reset, next performAutoDosing call will attempt to dose if needed');
} 