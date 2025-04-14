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

// Try to load the saved configuration from disk
try {
  if (typeof window === 'undefined') {
    const fs = require('fs');
    const path = require('path');
    
    const dataPath = path.join(process.cwd(), 'data');
    const configPath = path.join(dataPath, 'autodosing.json');
    
    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('Loading saved auto-dosing config from disk:', configPath);
      
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
      
      console.log('Loaded auto-dosing configuration:', JSON.stringify({
        'phUp.minInterval': dosingConfig.dosing.phUp.minInterval,
        'phDown.minInterval': dosingConfig.dosing.phDown.minInterval,
        'nutrientPumps': Object.keys(dosingConfig.dosing.nutrientPumps).map(name => ({
          name,
          minInterval: dosingConfig.dosing.nutrientPumps[name].minInterval
        }))
      }, null, 2));
    } else {
      console.log('No existing auto-dosing config found, using defaults');
    }
  }
} catch (error) {
  console.error('Error loading auto-dosing config from disk:', error);
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
    
    // ==== CRITICAL: SAVE EXISTING INTERVALS FIRST BEFORE ANY PROFILE CHANGES ====
    
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
    
    console.log("IMPORTANT - Current interval settings that will be preserved:", JSON.stringify(currentSettings, null, 2));
    
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
    
    // Track if any pumps were added that need dose timestamp initialization
    const newPumps: string[] = [];
    
    // Create a temp config with updates
    const updatedConfig = { ...dosingConfig };
    
    // Ensure nutrient pumps object exists
    if (!updatedConfig.dosing.nutrientPumps) {
      updatedConfig.dosing.nutrientPumps = {};
    }
    
    // Ensure nutrient pump timestamps object exists
    if (!updatedConfig.lastDose.nutrientPumps) {
      updatedConfig.lastDose.nutrientPumps = {};
    }
    
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
    
    // Process nutrient pumps
    // Reset nutrient pumps first (we'll rebuild it)
    updatedConfig.dosing.nutrientPumps = {};
    
    // Process all non-pH pumps as potential nutrient pumps
    const nutrientPumps = pumpSettings.filter((p: PumpAssignment) => 
      p.pumpName && 
      !(p.pumpName.toLowerCase().includes('ph') || p.pumpName.toLowerCase() === 'water')
    );
    
    // Calculate total dosage for nutrient ratio calculations
    const totalDosage = nutrientPumps.reduce((sum, pump) => sum + (pump.dosage || 0), 0);
    let hasNutrientDosages = totalDosage > 0;
    
    console.log(`Found ${nutrientPumps.length} nutrient pumps with total dosage ${totalDosage}`);
    
    for (const pump of nutrientPumps) {
      if (pump.pumpName) {
        // If this pump didn't exist before, track it as new
        if (!dosingConfig.dosing.nutrientPumps[pump.pumpName]) {
          newPumps.push(pump.pumpName);
        }
        
        // Store the nutrient type info if available
        const nutrientInfo = pump.productName ? 
          (pump.brandName ? `${pump.brandName} ${pump.productName}` : pump.productName) : 
          'General Nutrient';
        
        // Base dose amount that will be adjusted based on profile dosage settings
        let baseDoseAmount = 0.5; // Default is 0.5mL per dose
        
        // If we have dosage information in the profile, use it to set relative dosing
        if (hasNutrientDosages && pump.dosage) {
          // Set relative dosing based on the profile's dosage ratios
          // Store the nutrient proportion for balanced dosing
          const proportion = totalDosage > 0 ? pump.dosage / totalDosage : 0;
          // Scale the base dose amount based on relative proportion
          baseDoseAmount = Math.max(0.1, proportion * 2.5); // Minimum dose of 0.1mL, scaled by proportion
          baseDoseAmount = Math.round(baseDoseAmount * 10) / 10; // Round to 1 decimal place
        }
        
        // Add or update the nutrient pump config
        updatedConfig.dosing.nutrientPumps[pump.pumpName] = {
          // If pump already exists, preserve its flowRate and minInterval, otherwise use defaults
          ...dosingConfig.dosing.nutrientPumps[pump.pumpName],
          doseAmount: baseDoseAmount,
          flowRate: dosingConfig.dosing.nutrientPumps[pump.pumpName]?.flowRate || 1.0,
          minInterval: currentSettings.nutrientPumps[pump.pumpName] || 120, // Preserve interval if it existed
          nutrientType: nutrientInfo,
          proportion: hasNutrientDosages && pump.dosage && totalDosage > 0 ? pump.dosage / totalDosage : null
        };
        
        console.log(`Configured nutrient pump "${pump.pumpName}" with doseAmount=${baseDoseAmount}mL`);
      }
    }
    
    // Preserve any custom intervals
    if (currentSettings.phUp) {
      updatedConfig.dosing.phUp.minInterval = currentSettings.phUp;
    }
    
    if (currentSettings.phDown) {
      updatedConfig.dosing.phDown.minInterval = currentSettings.phDown;
    }
    
    // Apply all updates to the actual config
    dosingConfig = updatedConfig;
    
    // For any new pumps, initialize their last dose timestamps
    if (newPumps.length > 0) {
      console.log(`Initializing timestamps for ${newPumps.length} new pumps`);
      for (const pumpName of newPumps) {
        if (!dosingConfig.lastDose.nutrientPumps[pumpName]) {
          dosingConfig.lastDose.nutrientPumps[pumpName] = null;
        }
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
    console.log(`[canDose] ${pumpType} - Never dosed before, allowing dose. MinInterval: ${dosingConfig.dosing[pumpType].minInterval}s`);
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
  
  console.log(`[canDose] ${pumpType} - DETAILED TIMING CHECK`);
  console.log(`[canDose] ${pumpType} - Last dose timestamp: ${lastDoseTimestamp}`);
  console.log(`[canDose] ${pumpType} - Current timestamp: ${nowTimestamp}`);
  console.log(`[canDose] ${pumpType} - Time since last dose: ${timeSinceLastDose.toFixed(3)}s`);
  console.log(`[canDose] ${pumpType} - Min interval: ${minInterval}s`);
  console.log(`[canDose] ${pumpType} - Can dose: ${canDoseNow}`);
  
  return canDoseNow;
}

/**
 * Check if a nutrient pump can be dosed based on its minimum interval
 * @param pumpName The name of the nutrient pump
 * @returns Boolean indicating if dosing is allowed
 */
function canDoseNutrient(pumpName: string): boolean {
  const lastDoseTime = dosingConfig.lastDose.nutrientPumps[pumpName];
  
  // If never dosed before, allow dosing
  if (!lastDoseTime) {
    console.log(`[canDoseNutrient] ${pumpName} - Never dosed before, allowing dose. MinInterval: ${dosingConfig.dosing.nutrientPumps[pumpName]?.minInterval || 180}s`);
    return true;
  }
  
  // Get timestamps as primitive numbers
  const lastDoseTimestamp = typeof lastDoseTime === 'object' ? 
    lastDoseTime.getTime() : 
    (new Date(lastDoseTime)).getTime();
  
  const nowTimestamp = Date.now();
  
  // Calculate time difference in seconds
  const timeSinceLastDose = (nowTimestamp - lastDoseTimestamp) / 1000;
  const minInterval = Number(dosingConfig.dosing.nutrientPumps[pumpName]?.minInterval || 180);
  
  const canDoseNow = timeSinceLastDose >= minInterval;
  
  console.log(`[canDoseNutrient] ${pumpName} - DETAILED TIMING CHECK`);
  console.log(`[canDoseNutrient] ${pumpName} - Last dose timestamp: ${lastDoseTimestamp}`);
  console.log(`[canDoseNutrient] ${pumpName} - Current timestamp: ${nowTimestamp}`);
  console.log(`[canDoseNutrient] ${pumpName} - Time since last dose: ${timeSinceLastDose.toFixed(3)}s`);
  console.log(`[canDoseNutrient] ${pumpName} - Min interval: ${minInterval}s`);
  console.log(`[canDoseNutrient] ${pumpName} - Can dose: ${canDoseNow}`);
  
  return canDoseNow;
}

/**
 * Record a dose event
 * @param pumpType The type of pump dosed
 */
function recordDose(pumpType: 'phUp' | 'phDown'): void {
  // Store as a primitive ISO string instead of Date object to avoid serialization issues
  dosingConfig.lastDose[pumpType] = new Date();
  
  // Log with timestamp for debugging
  console.log(`[recordDose] Recorded ${pumpType} dose at ${Date.now()}`);
  
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
  
  // Store as a primitive ISO string instead of Date object to avoid serialization issues
  dosingConfig.lastDose.nutrientPumps[pumpName] = new Date();
  
  // Log with timestamp for debugging
  console.log(`[recordNutrientDose] Recorded ${pumpName} dose at ${Date.now()}`);
  
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
      console.log('[saveDosingConfig] Auto-dosing config saved with updated dose timestamps');
    }
  } catch (error) {
    console.error('[saveDosingConfig] Failed to save auto-dosing config:', error);
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
    return { 
      action: 'none', 
      details: { reason: 'Auto-dosing is disabled' } 
    };
  }
  
  // Get the latest sensor readings
  let sensorData: SensorData;
  let isSimulation = false;
  
  try {
    // Check if we should use simulated readings
    try {
      isSimulation = await isSimulationEnabled();
      console.log(`[performAutoDosing] Simulation mode is ${isSimulation ? 'ENABLED' : 'DISABLED'}`);
    } catch (error) {
      console.error('Error checking simulation status, assuming not enabled:', error);
      isSimulation = false;
    }
    
    if (isSimulation) {
      try {
        sensorData = await getSimulatedSensorReadings();
        console.log(`[performAutoDosing] Using SIMULATED readings: pH=${sensorData.ph}, EC=${sensorData.ec}`);
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
        console.log(`[performAutoDosing] Using REAL readings: pH=${sensorData.ph}, EC=${sensorData.ec}`);
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
  
  // Skip pump status check in simulation mode
  let pumpStatus: any[] = [];
  let activePumps: string[] = [];
  
  if (!isSimulation) {
    // Only check real pump status in non-simulation mode
    try {
      pumpStatus = getAllPumpStatus();
      activePumps = pumpStatus.filter(pump => pump.active).map(pump => pump.name);
      
      if (activePumps.length > 0) {
        console.log(`[performAutoDosing] Active pumps detected: ${activePumps.join(', ')}`);
        return { 
          action: 'waiting', 
          details: { reason: `Active pumps detected: ${activePumps.join(', ')}` } 
        };
      }
    } catch (error) {
      console.error('Error getting pump status:', error);
      return { 
        action: 'error', 
        details: { error: `Failed to get pump status: ${error}` } 
      };
    }
  } else {
    console.log('[performAutoDosing] Skipping active pump check in simulation mode');
  }
  
  // Handle pH adjustment first - pH is always prioritized over EC adjustment

  // Check if pH is too low (need to add pH Up)
  if (sensorData.ph < (dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance)) {
    console.log(`[performAutoDosing] pH too low: ${sensorData.ph}, target: ${dosingConfig.targets.ph.target}`);
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
        
        // Calculate dose amount based on how far from target - Growee style dosing
        // The further from target, the larger the dose (within limits)
        const phDelta = dosingConfig.targets.ph.target - sensorData.ph;
        const baseDoseAmount = dosingConfig.dosing.phUp.doseAmount;
        // Scale the dose amount based on how far pH is from target (max 2x base dose)
        const scaleFactor = Math.min(1 + (phDelta / dosingConfig.targets.ph.tolerance), 2);
        const amount = Math.round((baseDoseAmount * scaleFactor) * 10) / 10; // Round to 1 decimal place
        
        const pumpName = dosingConfig.dosing.phUp.pumpName;
        const flowRate = dosingConfig.dosing.phUp.flowRate;
        
        if (!isSimulation) {
          // Only dispense in non-simulation mode
          await dispensePump(pumpName, amount, flowRate);
        } else {
          console.log(`[performAutoDosing] SIMULATION: Would dispense ${amount}ml from ${pumpName} at ${flowRate}ml/s`);
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
    console.log(`[performAutoDosing] pH too high: ${sensorData.ph}, target: ${dosingConfig.targets.ph.target}`);
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
        
        // Calculate dose amount based on how far from target - Growee style dosing
        // The further from target, the larger the dose (within limits)
        const phDelta = sensorData.ph - dosingConfig.targets.ph.target;
        const baseDoseAmount = dosingConfig.dosing.phDown.doseAmount;
        // Scale the dose amount based on how far pH is from target (max 2x base dose)
        const scaleFactor = Math.min(1 + (phDelta / dosingConfig.targets.ph.tolerance), 2);
        const amount = Math.round((baseDoseAmount * scaleFactor) * 10) / 10; // Round to 1 decimal place
        
        const pumpName = dosingConfig.dosing.phDown.pumpName;
        const flowRate = dosingConfig.dosing.phDown.flowRate;
        
        if (!isSimulation) {
          // Only dispense in non-simulation mode
          await dispensePump(pumpName, amount, flowRate);
        } else {
          console.log(`[performAutoDosing] SIMULATION: Would dispense ${amount}ml from ${pumpName} at ${flowRate}ml/s`);
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
  
  // Check if EC is too low (need to add nutrients) - Now using Growee-style proportional dosing
  if (sensorData.ec < (dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance)) {
    console.log(`[performAutoDosing] EC too low: ${sensorData.ec}, target: ${dosingConfig.targets.ec.target}`);
    
    try {
      // Check for timeout
      if (checkTimeout()) {
        return { 
          action: 'timeout', 
          details: { reason: 'Auto-dosing execution time limit exceeded' } 
        };
      }
      
      // Calculate how far EC is from target (for proportional dosing like Growee)
      const ecDeficit = dosingConfig.targets.ec.target - sensorData.ec;
      const ecDeviation = ecDeficit / dosingConfig.targets.ec.tolerance;
      // Scale factor ranges from 1.0 to 2.0 based on how far we are from target
      const scaleFactor = Math.min(1 + ecDeviation, 2);
      
      // Get profile to check for nutrient ratios
      const profile = await getActiveProfile();
      
      // Track what was dispensed
      const dispensed = [];
      let anyNutrientDosed = false;
      
      // Get all configured nutrient pumps
      const nutrientPumpNames = Object.keys(dosingConfig.dosing.nutrientPumps);
      console.log(`[performAutoDosing] Found ${nutrientPumpNames.length} nutrient pumps configured`);
      
      // Get pumps that can be dosed now (passed their minimum interval)
      const dosablePumps = nutrientPumpNames.filter(pumpName => canDoseNutrient(pumpName));
      console.log(`[performAutoDosing] ${dosablePumps.length} of ${nutrientPumpNames.length} pumps are available for dosing`);
      
      // No pumps available to dose
      if (dosablePumps.length === 0) {
        return {
          action: 'waiting',
          details: {
            type: 'Nutrients',
            reason: 'Minimum interval between doses not reached for any nutrient pumps'
          }
        };
      }
      
      // Growee-style balanced dosing - get nutrient ratios from profile
      const allPumpsAvailable = nutrientPumpNames.length === dosablePumps.length;
      let useBalancedDosing = false;
      let nutrientProportions: Record<string, number> = {};
      
      if (profile && profile.pumpDosages && allPumpsAvailable) {
        // Get nutrient pumps from profile (not pH or water pumps)
        const profileNutrientPumps = profile.pumpDosages.filter((p: any) => 
          p.pumpName && 
          !(p.pumpName.toLowerCase().includes('ph') || p.pumpName.toLowerCase() === 'water')
        );
        
        // Calculate total dosage to determine proportions
        const totalDosage = profileNutrientPumps.reduce((sum: number, pump: {pumpName: string, dosage: number}) => 
          sum + (pump.dosage || 0), 0);
        
        if (totalDosage > 0) {
          // Calculate proportions for each pump
          profileNutrientPumps.forEach((pump: any) => {
            if (pump.pumpName && pump.dosage) {
              nutrientProportions[pump.pumpName] = pump.dosage / totalDosage;
            }
          });
          
          useBalancedDosing = true;
          console.log(`[performAutoDosing] Using Growee-style balanced dosing with proportions: ${JSON.stringify(nutrientProportions)}`);
        }
      }
      
      // Process dosing based on mode (balanced or individual)
      if (useBalancedDosing) {
        // Growee-style: use a total dose amount and distribute according to proportions
        const totalDoseAmount = 2.0 * scaleFactor; // Base 2.0mL scaled by deficit
        
        for (const pumpName of dosablePumps) {
          let doseAmount: number;
          const pump = dosingConfig.dosing.nutrientPumps[pumpName];
          
          // Calculate dose based on proportion if available
          if (nutrientProportions[pumpName]) {
            doseAmount = Math.round((totalDoseAmount * nutrientProportions[pumpName]) * 10) / 10;
            doseAmount = Math.max(0.1, doseAmount); // Ensure minimum dose
          } else {
            // Fallback if pump not in profile
            doseAmount = Math.round((pump.doseAmount * scaleFactor) * 10) / 10;
          }
          
          const flowRate = pump.flowRate;
          
          if (!isSimulation) {
            await dispensePump(pumpName as PumpName, doseAmount, flowRate);
          } else {
            console.log(`[performAutoDosing] SIMULATION: Would dispense ${doseAmount}ml from ${pumpName} at ${flowRate}ml/s`);
          }
          
          recordNutrientDose(pumpName);
          
          dispensed.push({
            type: 'Nutrient',
            amount: doseAmount,
            pumpName,
            simulated: isSimulation
          });
          
          anyNutrientDosed = true;
        }
      } else {
        // Individual dosing mode - just dose each available pump independently
        console.log('[performAutoDosing] Using individual pump dosing (no balanced dosing)');
        
        for (const pumpName of dosablePumps) {
          const pump = dosingConfig.dosing.nutrientPumps[pumpName];
          const doseAmount = Math.round((pump.doseAmount * scaleFactor) * 10) / 10;
          const flowRate = pump.flowRate;
          
          if (!isSimulation) {
            await dispensePump(pumpName as PumpName, doseAmount, flowRate);
          } else {
            console.log(`[performAutoDosing] SIMULATION: Would dispense ${doseAmount}ml from ${pumpName} at ${flowRate}ml/s`);
          }
          
          recordNutrientDose(pumpName);
          
          dispensed.push({
            type: 'Nutrient',
            amount: doseAmount,
            pumpName,
            simulated: isSimulation
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
            simulated: isSimulation,
            reason: `EC ${sensorData.ec} below target range (${dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance})`
          }
        };
      } else {
        return {
          action: 'waiting',
          details: {
            type: 'Nutrients',
            reason: 'No eligible nutrient pumps available for dosing'
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
  
  // If EC is too high, we can't automatically reduce it (requires water change)
  if (sensorData.ec > (dosingConfig.targets.ec.target + dosingConfig.targets.ec.tolerance)) {
    return {
      action: 'warning',
      details: {
        type: 'EC High',
        reason: `EC ${sensorData.ec} above target range (${dosingConfig.targets.ec.target + dosingConfig.targets.ec.tolerance}). Consider adding fresh water to dilute solution.`
      }
    };
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