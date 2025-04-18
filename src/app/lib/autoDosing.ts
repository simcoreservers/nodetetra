/**
 * NuTetra Auto-Dosing System
 * Controls automatic nutrient and pH dosing based on sensor readings
 */

import { PumpName, dispensePump, getAllPumpStatus } from './pumps';
import { SensorData } from './sensors';
import { getAllSensorReadings } from './sensors';
import { getSimulatedSensorReadings, isSimulationEnabled } from './simulation';
import { disableMonitoring } from './monitorControl';
import fs from 'fs';
import path from 'path';
import { info, error, debug, trace, warn } from './logger';

// Module name for logging
const MODULE = 'autoDosing';

// Profile cache system
const profileCache = {
  data: null,
  timestamp: 0,
  TTL: 15000 // 15 second TTL
};

// Add initialization safety delay - prevent dosing for initial seconds after server start
let serverStartTime = Date.now();
const STARTUP_SAFETY_DELAY = 30000; // 30 seconds before allowing any dosing

// Path to the active profile file
const DATA_PATH = path.join(process.cwd(), 'data');
const ACTIVE_PROFILE_FILE = path.join(DATA_PATH, 'active_profile.json');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');

// PID Controller interface for improved dosing accuracy
interface PIDController {
  kp: number;  // Proportional gain
  ki: number;  // Integral gain
  kd: number;  // Derivative gain
  integral: number;
  lastError: number;
  lastTime: number;
}

// Default PID controller settings
const PID_DEFAULTS = {
  ph: { kp: 0.5, ki: 0.1, kd: 0.2, integral: 0, lastError: 0, lastTime: 0 },
  ec: { kp: 0.3, ki: 0.05, kd: 0.1, integral: 0, lastError: 0, lastTime: 0 }
};

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
  // PID controllers for adaptive dosing
  pidControllers?: {
    ph: PIDController;
    ec: PIDController;
  };
  // Error handling settings for improved resilience
  errorHandling?: {
    maxRetries: number;
    backoffFactor: number;
    baseBackoffMs: number;
    currentFailCount: number;
    lastFailure: number | null;
    circuitBreakerThreshold: number;
    circuitBreakerResetTime: number;
    circuitOpen: boolean;
  };
  // Telemetry for dose effectiveness
  telemetry?: {
    doseHistory: DoseEffectiveness[];
    maxHistoryLength: number;
  };
}

// Track dose effectiveness for ML-based improvements
interface DoseEffectiveness {
  timestamp: string;
  pumpName: string;
  doseAmount: number;
  beforeValue: number; // pH or EC
  afterValue: number;  // pH or EC after stabilization
  effectivenessRatio: number; // Change per ml
  targetType: 'ph' | 'ec';
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
  },
  // Add PID controllers for adaptive dosing
  pidControllers: {
    ph: { ...PID_DEFAULTS.ph },
    ec: { ...PID_DEFAULTS.ec }
  },
  // Error handling settings
  errorHandling: {
    maxRetries: 5,
    backoffFactor: 1.5,
    baseBackoffMs: 1000,
    currentFailCount: 0,
    lastFailure: null,
    circuitBreakerThreshold: 10,
    circuitBreakerResetTime: 300000, // 5 minutes
    circuitOpen: false
  },
  // Telemetry data storage
  telemetry: {
    doseHistory: [],
    maxHistoryLength: 100 // Store last 100 dose events
  }
};

// Current auto-dosing configuration
let dosingConfig: DosingConfig = { ...DEFAULT_DOSING_CONFIG };

// Add at the top of the file, near the other variable declarations
let isInitialized = false;
// Track when auto-dosing has been explicitly disabled to prevent any new operations
let autoDosingExplicitlyDisabled = false;

// Unified dosing lock to prevent concurrent operations and rate limit calls
const dosingLock = {
  inProgress: false,
  lastAttempt: 0,
  timeout: null as NodeJS.Timeout | null
};
const MAX_DOSING_LOCK_TIME = 30000; // 30 seconds max lock time as safety measure
const MIN_DOSING_ATTEMPT_INTERVAL = 2000; // 2s minimum between attempts

// Cache for active profile to reduce disk I/O
let activeProfileCache: any = null;
let profileCacheTime: number = 0;
const PROFILE_CACHE_TTL = 60000; // 1 minute cache TTL

// Export lock status check for external components
export function isLocked(): boolean {
  return dosingLock.inProgress;
}

/**
 * Reset all safety flags and allow dosing to restart cleanly
 * This function resets all safety-related flags that might prevent auto-dosing from working
 */
export function resetSafetyFlags(): void {
  info(MODULE, '== RESETTING ALL AUTO-DOSING SAFETY FLAGS ==');
  
  // Reset the explicitly disabled flag
  autoDosingExplicitlyDisabled = false;
  info(MODULE, 'Reset autoDosingExplicitlyDisabled flag: ' + autoDosingExplicitlyDisabled);
  
  // Reset the dosing lock
  if (dosingLock.inProgress) {
    info(MODULE, 'Clearing dosing lock that was in progress');
    dosingLock.inProgress = false;
  }
  
  // Clear any pending timeout
  if (dosingLock.timeout) {
    info(MODULE, 'Clearing pending dosing timeout');
    clearTimeout(dosingLock.timeout);
    dosingLock.timeout = null;
  }
  
  dosingLock.lastAttempt = 0;
  
  // Reset all dose timestamps to allow immediate dosing
  resetDoseTimestamps();
  
  // Reset circuit breaker if it's open
  if (dosingConfig.errorHandling?.circuitOpen) {
    info(MODULE, 'Reset circuit breaker from open state');
    dosingConfig.errorHandling.circuitOpen = false;
    dosingConfig.errorHandling.currentFailCount = 0;
    dosingConfig.errorHandling.lastFailure = null;
  }
  
  // Reset PID controllers
  if (dosingConfig.pidControllers) {
    resetPIDController(dosingConfig.pidControllers.ph);
    resetPIDController(dosingConfig.pidControllers.ec);
    info(MODULE, 'Reset PID controllers to initial state');
  }
  
  // Reset server start time to bypass startup safety delay
  serverStartTime = Date.now() - STARTUP_SAFETY_DELAY - 1000;
  info(MODULE, 'Reset startup safety delay');
  
  info(MODULE, '== ALL SAFETY FLAGS RESET SUCCESSFULLY ==');
}

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
      
      // CRITICAL SAFETY OVERRIDE: Force enabled to false on startup regardless of saved state
      const wasPreviouslyEnabled = dosingConfig.enabled;
      dosingConfig.enabled = false;
      
      if (wasPreviouslyEnabled) {
        info(MODULE, '!!! SAFETY OVERRIDE: Auto-dosing was previously enabled but has been forced OFF on server start !!!');
      }
      
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
      
      // Always save the configuration with enabled=false to ensure it stays off after restart
      saveDosingConfig();
    } else {
      info(MODULE, 'No existing auto-dosing config found, using defaults (auto-dosing disabled)');
    }
  }
} catch (err) {
  error(MODULE, 'Error loading auto-dosing config from disk', err);
  // Continue with defaults if loading fails
}

// Store the last reading to avoid duplicate dosing
let lastReading: SensorData | null = null;

/**
 * Calculate dose amount using PID controller for better accuracy
 * @param current Current value (pH or EC)
 * @param target Target value
 * @param controller PID controller to use
 * @param baseDoseAmount Base dose amount to scale
 * @returns Calculated dose amount in mL
 */
function calculatePIDDose(
  current: number, 
  target: number, 
  controller: PIDController,
  baseDoseAmount: number
): number {
  const now = Date.now();
  const dt = controller.lastTime === 0 ? 1 : Math.min((now - controller.lastTime) / 1000, 10);
  
  // Skip integral if first run
  if (controller.lastTime === 0) {
    controller.lastTime = now;
    controller.lastError = target - current;
    return baseDoseAmount; // Default dose on first run
  }
  
  const error = target - current;
  
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
  const scaledDose = baseDoseAmount * Math.min(Math.max(Math.abs(output), 0.2), 3.0);
  
  // Round to one decimal place
  return Math.round(scaledDose * 10) / 10;
}

/**
 * Reset a PID controller to initial state
 */
function resetPIDController(controller: PIDController): void {
  controller.integral = 0;
  controller.lastError = 0;
  controller.lastTime = 0;
}

/**
 * Record dose effectiveness for analysis and adaptive dosing
 */
function recordDoseEffectiveness(data: DoseEffectiveness): void {
  if (!dosingConfig.telemetry) {
    dosingConfig.telemetry = {
      doseHistory: [],
      maxHistoryLength: 100
    };
  }
  
  // Calculate effectiveness ratio if afterValue exists
  if (data.afterValue !== undefined && data.doseAmount > 0) {
    const change = Math.abs(data.afterValue - data.beforeValue);
    data.effectivenessRatio = change / data.doseAmount;
  }
  
  // Add to history
  dosingConfig.telemetry.doseHistory.unshift(data);
  
  // Trim history if needed
  if (dosingConfig.telemetry.doseHistory.length > dosingConfig.telemetry.maxHistoryLength) {
    dosingConfig.telemetry.doseHistory = dosingConfig.telemetry.doseHistory.slice(
      0, dosingConfig.telemetry.maxHistoryLength
    );
  }
  
  // Save to disk
  saveDosingConfig();
  
  debug(MODULE, `Recorded dose effectiveness for ${data.pumpName}: ${data.effectivenessRatio.toFixed(4)} units/mL`);
}

/**
 * Check if we're in circuit breaker open state
 */
function isCircuitOpen(): boolean {
  if (!dosingConfig.errorHandling) return false;
  
  // If circuit is open, check if reset time has passed
  if (dosingConfig.errorHandling.circuitOpen && dosingConfig.errorHandling.lastFailure) {
    const now = Date.now();
    const resetTime = dosingConfig.errorHandling.lastFailure + 
                     dosingConfig.errorHandling.circuitBreakerResetTime;
    
    // Reset circuit if time has elapsed
    if (now > resetTime) {
      dosingConfig.errorHandling.circuitOpen = false;
      dosingConfig.errorHandling.currentFailCount = 0;
      info(MODULE, 'Circuit breaker reset after timeout period');
      return false;
    }
    return true;
  }
  
  return false;
}

/**
 * Record a failure and potentially open the circuit breaker
 */
function recordFailure(): void {
  if (!dosingConfig.errorHandling) return;
  
  dosingConfig.errorHandling.currentFailCount++;
  dosingConfig.errorHandling.lastFailure = Date.now();
  
  // Open circuit if threshold reached
  if (dosingConfig.errorHandling.currentFailCount >= dosingConfig.errorHandling.circuitBreakerThreshold) {
    dosingConfig.errorHandling.circuitOpen = true;
    warn(MODULE, `Circuit breaker opened after ${dosingConfig.errorHandling.currentFailCount} failures`);
  }
}

/**
 * Record a success and reset failure count
 */
function recordSuccess(): void {
  if (!dosingConfig.errorHandling) return;
  
  // Only reset if we had failures
  if (dosingConfig.errorHandling.currentFailCount > 0) {
    dosingConfig.errorHandling.currentFailCount = 0;
    debug(MODULE, 'Reset failure count after successful operation');
  }
}

/**
 * Calculate backoff time based on current failure count
 */
function calculateBackoffTime(): number {
  if (!dosingConfig.errorHandling) return 0;
  
  return Math.min(
    dosingConfig.errorHandling.baseBackoffMs * 
    Math.pow(dosingConfig.errorHandling.backoffFactor, dosingConfig.errorHandling.currentFailCount),
    60000 // Maximum backoff of 1 minute
  );
}

/**
 * Helper function to get the active profile with caching
 */
async function getActiveProfileOptimized() {
  try {
    const now = Date.now();
    
    // Return cached profile if still valid
    if (activeProfileCache && (now - profileCacheTime) < PROFILE_CACHE_TTL) {
      trace(MODULE, 'Using cached active profile');
      return activeProfileCache;
    }
    
    // Get fresh profile using existing function
    const profile = await getActiveProfile();
    
    // Cache the result if valid
    if (profile) {
      activeProfileCache = profile;
      profileCacheTime = now;
    }
    
    return profile;
  } catch (error) {
    console.error("Error in optimized profile getter:", error);
    // Fall back to original implementation on error
    return getActiveProfile();
  }
}

/**
 * Helper function to get the active profile
 */
async function getActiveProfile() {
  try {
    const now = Date.now();
    
    // Return cached data if valid
    if (profileCache.data && (now - profileCache.timestamp) < profileCache.TTL) {
      trace(MODULE, 'Using cached profile data');
      return profileCache.data;
    }
    
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
    
    // Cache the profile
    profileCache.data = profile;
    profileCache.timestamp = now;
    
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
    
    // Get active profile - use optimized version with caching
    const profile = await getActiveProfileOptimized();
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
    
    // Get nutrient pumps (not pH pumps) from profile
    const nutrientPumps = pumpSettings.filter((p: PumpAssignment) => 
      p.pumpName && 
      !(p.pumpName.toLowerCase().includes('ph') || p.pumpName.toLowerCase() === 'water')
    );
    
    if (nutrientPumps.length === 0) {
      // Add more detailed logging to help diagnose the issue
      console.error(`No nutrient pumps found after filtering. Total pumps before filter: ${pumpSettings.length}. Pump names: ${pumpSettings.map((p: PumpAssignment) => p.pumpName).join(', ')}`);
      return false;
    }
    
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
    await saveDosingConfigAsync();
    
    console.log("=== PROFILE PUMP SYNC COMPLETED SUCCESSFULLY ===");
    return true;
  } catch (error) {
    console.error("Error syncing profile pumps to auto-dosing:", error);
    recordFailure();
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
    recordFailure();
  }
}

/**
 * Save the dosing configuration to disk asynchronously
 * This is the preferred method to save configuration
 */
async function saveDosingConfigAsync(): Promise<void> {
  try {
    if (typeof window === 'undefined') {
      // Only save on the server side
      const fs = require('fs/promises');
      const path = require('path');
      
      // Create data directory if it doesn't exist
      const dataPath = path.join(process.cwd(), 'data');
      try {
        await fs.mkdir(dataPath, { recursive: true });
      } catch (err: any) {
        // Ignore if directory already exists, but log other errors
        if (err.code !== 'EEXIST') {
          console.error('Error creating data directory:', err);
        }
      }
      
      // Main config path and temp file path for atomic write
      const configPath = path.join(dataPath, 'autodosing.json');
      const tempPath = `${configPath}.tmp`;
      
      // Try three methods in sequence with proper error handling
      // Method 1: Write to temp file and rename (atomic)
      try {
        await fs.writeFile(tempPath, JSON.stringify(dosingConfig, null, 2), 'utf8');
        
        try {
          // Atomic rename operation
          await fs.rename(tempPath, configPath);
          trace(MODULE, 'Auto-dosing config saved with atomic rename');
          return; // Success, exit function
        } catch (renameErr: any) {
          console.warn('Rename operation failed:', renameErr.code || renameErr.message);
          // Continue to method 2
        }
        
        // Method 2: Check if temp file exists, then copy and delete
        try {
          // Verify temp file exists before attempting to copy
          const tempStats = await fs.stat(tempPath);
          if (tempStats.isFile() && tempStats.size > 0) {
            await fs.copyFile(tempPath, configPath);
            console.log('Used copy method as fallback for saving config');
            
            try {
              await fs.unlink(tempPath); // Clean up temp file
            } catch (unlinkErr) {
              // Just log, don't fail the operation if we can't clean up
              console.error('Failed to clean up temp file:', unlinkErr);
            }
            return; // Success, exit function
          } else {
            console.error('Temp file exists but appears invalid, skipping copy');
            // Continue to method 3
          }
        } catch (statsErr) {
          console.error('Temp file does not exist or cannot be accessed:', statsErr);
          // Continue to method 3
        }
      } catch (writeErr) {
        console.error('Failed to write temp file:', writeErr);
        // Continue to method 3
      }
      
      // Method 3: Direct write to final destination (last resort)
      try {
        console.warn('Falling back to direct file write method (last resort)');
        await fs.writeFile(configPath, JSON.stringify(dosingConfig, null, 2), 'utf8');
        console.log('Config saved with direct write method');
      } catch (directWriteErr) {
        console.error('All file save methods failed. Final error:', directWriteErr);
        throw directWriteErr; // Rethrow to trigger fallback
      }
      
      trace(MODULE, 'Auto-dosing config saved');
      recordSuccess(); // Record success for circuit breaker
    }
  } catch (err) {
    error(MODULE, 'Failed to save auto-dosing config asynchronously', err);
    recordFailure(); // Record failure for circuit breaker
    
    // Fall back to sync method as a backup
    saveDosingConfig();
  }
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
        try {
          fs.mkdirSync(dataPath, { recursive: true });
        } catch (err) {
          // Log error but continue with attempt to save
          console.error('Error creating data directory during sync save:', err);
        }
      }
      
      // Main config path and temp file path for atomic write
      const configPath = path.join(dataPath, 'autodosing.json');
      const tempPath = `${configPath}.tmp`;
      
      // Method 1: Atomic write through temp file
      try {
        // Write to temp file first
        fs.writeFileSync(tempPath, JSON.stringify(dosingConfig, null, 2), 'utf8');
        
        // Check if the temp file was created successfully
        if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 0) {
          try {
            // Attempt atomic rename
            fs.renameSync(tempPath, configPath);
            trace(MODULE, 'Auto-dosing config saved with atomic rename (sync)');
            
            // Success with method 1, return early
            recordSuccess();
            return;
          } catch (renameErr) {
            console.warn('Rename operation failed during sync save:', renameErr);
            // Fall through to next method
          }
          
          // Method 2: Copy and delete if rename failed
          try {
            // Copy temp to destination
            fs.copyFileSync(tempPath, configPath);
            console.log('Used copy method as fallback for sync saving config');
            
            // Try to delete temp file but don't fail if this errors
            try {
              fs.unlinkSync(tempPath);
            } catch (unlinkErr) {
              console.error('Failed to delete temp file after copy (sync):', unlinkErr);
            }
            
            // Success with method 2, return early
            recordSuccess();
            return;
          } catch (copyErr) {
            console.error('Copy operation failed during sync save:', copyErr);
            // Fall through to method 3
          }
        } else {
          console.error('Temp file was not created properly during sync save');
          // Fall through to method 3
        }
      } catch (writeErr) {
        console.error('Error writing temp file during sync save:', writeErr);
        // Fall through to method 3
      }
      
      // Method 3: Direct write as last resort
      try {
        console.warn('Falling back to direct file write method (sync, last resort)');
        fs.writeFileSync(configPath, JSON.stringify(dosingConfig, null, 2), 'utf8');
        console.log('Config saved with direct write method (sync)');
        
        // Try to sync the file if possible
        try {
          const fd = fs.openSync(configPath, 'r');
          fs.fsyncSync(fd);
          fs.closeSync(fd);
        } catch (syncErr) {
          console.warn('Could not fsync file:', syncErr);
        }
        
        // Success with method 3
        recordSuccess();
        return;
      } catch (directWriteErr) {
        console.error('All sync file save methods failed. Final error:', directWriteErr);
        throw directWriteErr;
      }
    }
  } catch (err) {
    error(MODULE, 'Failed to save auto-dosing config', err);
    recordFailure(); // Record failure for circuit breaker
  }
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
    
    const fs = require('fs/promises');
    const path = require('path');
    
    const fullPath = path.join(process.cwd(), filePath);
    
    try {
      const rawData = await fs.readFile(fullPath, 'utf8');
      return JSON.parse(rawData) as T;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        console.log(`File not found: ${fullPath}`);
        return null;
      }
      throw err;
    }
  } catch (error) {
    console.error(`Error reading JSON from ${filePath}:`, error);
    recordFailure(); // Record failure for circuit breaker
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
 * Perform nutrient dosing - extracted as a separate function to ensure proper async handling
 * @param sensorData The sensor data to base dosing on
 * @param isSimulation Whether the sensor readings are simulated
 * @param dispenseMode When true, always dispense regardless of simulation mode
 */
async function doNutrientDosing(sensorData: SensorData, isSimulation: boolean, dispenseMode: boolean = false): Promise<{
  action: string;
  details: any;
}> {
  debug(MODULE, `Starting nutrient dosing process for EC ${sensorData.ec.toFixed(2)}, target: ${dosingConfig.targets.ec.target.toFixed(2)}`);
  
  try {
    // Calculate how far EC is from target
    const ecDeficit = dosingConfig.targets.ec.target - sensorData.ec;
    const ecDeviation = ecDeficit / dosingConfig.targets.ec.tolerance;
    const scaleFactor = Math.min(1 + ecDeviation, 2); // Cap at 2x dosage
    
    trace(MODULE, `EC deficit: ${ecDeficit.toFixed(2)}, scale factor: ${scaleFactor.toFixed(2)}`);
    
    // Get active profile for nutrient proportions
    const profile = await getActiveProfile();
    if (!profile) {
      error(MODULE, 'No active profile found');
      return {
        action: 'error',
        details: { reason: 'No active profile found for nutrient dosing' }
      };
    }
    
    // Verify we have pump assignments in the profile
    const pumpDosages = profile.pumpDosages || profile.pumpAssignments || [];
    if (pumpDosages.length === 0) {
      error(MODULE, 'No pump dosages defined in active profile');
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
      // Add more detailed logging to help diagnose the issue
      error(MODULE, `No nutrient pumps found after filtering. Total pumps before filter: ${pumpDosages.length}. Pump names: ${pumpDosages.map((p: any) => p.pumpName || 'unnamed').join(', ')}`);
      return {
        action: 'error',
        details: { reason: 'No nutrient pumps defined in active profile' }
      };
    }
    
    // Calculate total dosage for proportional mixing
    const totalDosage = nutrientPumpDosages.reduce((sum: number, pump: any) => 
      sum + (Number(pump.dosage) || 0), 0);
      
    if (totalDosage <= 0) {
      error(MODULE, 'Zero total dosage for nutrients in profile');
      return {
        action: 'error',
        details: { reason: 'Zero total dosage for nutrients in profile' }
      };
    }
    
    debug(MODULE, `Total dosage from profile: ${totalDosage}, ${nutrientPumpDosages.length} nutrient pumps`);
    
    // Calculate proportions for each pump based on profile
    const nutrientProportions: Record<string, number> = {};
    nutrientPumpDosages.forEach((pump: any) => {
      if (pump.pumpName && Number(pump.dosage) > 0) {
        nutrientProportions[pump.pumpName] = Number(pump.dosage) / totalDosage;
        trace(MODULE, `${pump.pumpName}: dosage=${pump.dosage}, proportion=${nutrientProportions[pump.pumpName].toFixed(2)}`);
      }
    });
    
    // Get configured pumps from dosing config
    const configuredPumps = Object.keys(dosingConfig.dosing.nutrientPumps);
    debug(MODULE, `Configured pumps in auto-dosing: ${configuredPumps.join(', ')}`);
    
    // Check which pumps we can actually dose (based on timing)
    const dosablePumps = configuredPumps.filter(pumpName => {
      const canDose = canDoseNutrient(pumpName);
      trace(MODULE, `${pumpName} can dose: ${canDose}`);
      return canDose;
    });
    
    // Check if all nutrients from the active profile can be dosed
    const profilePumpNames = nutrientPumpDosages.map((p: any) => p.pumpName);
    const missingPumps = profilePumpNames.filter((name: string) => !dosablePumps.includes(name));
    
    if (missingPumps.length > 0) {
      // If any required nutrients cannot be dosed, wait until all are available
      warn(MODULE, `Cannot dose all required nutrients. Missing pumps: ${missingPumps.join(', ')}`);
      return {
        action: 'waiting',
        details: { 
          reason: 'Cannot dose all required nutrients due to timing restrictions',
          missingPumps
        }
      };
    }
    
    if (dosablePumps.length === 0 || dosablePumps.length < nutrientPumpDosages.length) {
      debug(MODULE, `Not all pumps available for dosing (${dosablePumps.length}/${nutrientPumpDosages.length})`);
      return {
        action: 'waiting',
        details: { reason: 'Not all nutrient pumps available for complete dosing due to minimum interval restrictions' }
      };
    }
    
    debug(MODULE, `${dosablePumps.length} pumps available for dosing`);
    
    // Total base amount to dose (will be distributed according to proportions)
    const baseTotalDoseAmount = 2.0; // 2mL total base dose
    const totalDoseAmount = baseTotalDoseAmount * scaleFactor;
    
    debug(MODULE, `Total dose amount: ${totalDoseAmount.toFixed(2)}mL (base ${baseTotalDoseAmount}mL × ${scaleFactor.toFixed(2)})`);
    
    // Track what was dispensed
    const dispensed = [];
    let successfulDoses = 0;
    
    // Sort pumps according to the order in the profile to maintain consistent dosing order
    const sortedPumps = dosablePumps.sort((a, b) => {
      const aIndex = profilePumpNames.indexOf(a);
      const bIndex = profilePumpNames.indexOf(b);
      return aIndex - bIndex;
    });
    
    // Dose each available pump
    for (const pumpName of sortedPumps) {
      try {
        // Skip if pump not in profile or has zero proportion
        if (!nutrientProportions[pumpName] || nutrientProportions[pumpName] <= 0) {
          trace(MODULE, `Skipping ${pumpName} - not in profile or zero proportion`);
          continue;
        }
        
        // Get pump config
        const pump = dosingConfig.dosing.nutrientPumps[pumpName];
        
        // Calculate dose based on proportion
        const proportion = nutrientProportions[pumpName];
        const doseAmount = Math.max(0.1, Math.round((totalDoseAmount * proportion) * 10) / 10);
        const flowRate = pump.flowRate || 1.0;
        
        debug(MODULE, `Dispensing ${doseAmount.toFixed(1)}mL from ${pumpName} (${(proportion * 100).toFixed(1)}% of total)`);
        
        // Always dispense if dispenseMode is true
        if (dispenseMode) {
          // Actually dispense the nutrient
          info(MODULE, `DISPENSING ${doseAmount.toFixed(1)}mL from ${pumpName}`);
          await dispensePump(pumpName as PumpName, doseAmount, flowRate);
        } else if (isSimulation) {
          info(MODULE, `SIMULATION: Would dispense ${doseAmount.toFixed(1)}mL from ${pumpName}`);
        } else {
          // Actually dispense the nutrient
          info(MODULE, `DISPENSING ${doseAmount.toFixed(1)}mL from ${pumpName}`);
          await dispensePump(pumpName as PumpName, doseAmount, flowRate);
        }
        
        // Record the successful dose
        recordNutrientDose(pumpName);
        successfulDoses++;
        
        dispensed.push({
          pumpName,
          amount: doseAmount,
          proportion,
          sensorSimulation: isSimulation
        });
      } catch (err) {
        error(MODULE, `Error dispensing from ${pumpName}`, err);
        // Continue with other pumps despite errors
      }
    }
    
    if (successfulDoses > 0 && successfulDoses === nutrientPumpDosages.length) {
      info(MODULE, `Successfully dosed all ${successfulDoses} nutrient pumps`);
      return {
        action: 'dosed',
        details: {
          type: 'Nutrients',
          dispensed,
          sensorSimulation: isSimulation,
          reason: `EC ${sensorData.ec} below target range (${dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance})`
        }
      };
    } else if (successfulDoses > 0) {
      warn(MODULE, `Only dosed ${successfulDoses}/${nutrientPumpDosages.length} nutrient pumps`);
      return {
        action: 'warning',
        details: { 
          reason: `Only dosed ${successfulDoses}/${nutrientPumpDosages.length} nutrient pumps, which may affect NPK balance`,
          dispensed
        }
      };
    } else {
      warn(MODULE, 'Failed to dose any pumps');
      return {
        action: 'error',
        details: { reason: 'Failed to dose any nutrient pumps' }
      };
    }
  } catch (err) {
    error(MODULE, 'Error during nutrient dosing', err);
    return {
      action: 'error',
      details: { error: `Error during nutrient dosing: ${err}` }
    };
  }
}

/**
 * Perform the dosing based on the current sensor readings
 * This function can be called both from manual triggers and automatic monitoring
 */
export async function performAutoDosing(): Promise<{
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
  
  // Check startup safety delay to prevent dosing immediately after server start
  if (now - serverStartTime < STARTUP_SAFETY_DELAY) {
    const remainingTime = Math.ceil((STARTUP_SAFETY_DELAY - (now - serverStartTime)) / 1000);
    warn(MODULE, `Server recently started, waiting ${remainingTime}s before allowing dosing operations`);
    return {
      action: 'waiting',
      details: { reason: `Server recently started, safety delay active (${remainingTime}s remaining)` }
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
          'unknown'
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
    
    info(MODULE, 'Starting auto-dosing cycle (LOCK ACQUIRED)');
  
    // Get the latest sensor readings - may be real or simulated
    let sensorData: SensorData;
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
      recordFailure(); // Record failure for circuit breaker
      
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
    } finally {
      // Make sure we unlock if the function exits here
      if (dosingLock.timeout) {
        clearTimeout(dosingLock.timeout);
        dosingLock.timeout = null;
      }
    }
  
    // Validate sensor readings to improve error resilience
    if (!validateSensorReadings(sensorData)) {
      warn(MODULE, `Invalid sensor readings detected: pH=${sensorData.ph}, EC=${sensorData.ec}`);
      recordFailure(); // Record failure for circuit breaker
      
      // Release lock
      dosingLock.inProgress = false;
      return {
        action: 'error',
        details: { reason: 'Invalid sensor readings detected' }
      };
    }
  
    // Store the reading for reference
    lastReading = sensorData;
  
    // Check for already active pumps (don't dose if pumps are already running)
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
      recordFailure(); // Record failure for circuit breaker
    }
    
    // Handle pH adjustment first - pH is always prioritized over EC adjustment
  
    // Check if pH is too low (need to add pH Up)
    if (sensorData.ph < (dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance)) {
      info(MODULE, `pH too low: ${sensorData.ph.toFixed(2)}, target: ${dosingConfig.targets.ph.target.toFixed(2)}`);
      
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
          
          info(MODULE, `PID controller calculated ${amount}ml dose of pH Up from ${pumpName} at ${flowRate}ml/s`);
          
          // Always dispense regardless of sensor simulation mode
          await dispensePump(pumpName, amount, flowRate);
          info(MODULE, `Successfully dispensed ${amount}ml of pH Up`);
          
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
              sensorSimulation: isSensorSimulation,
              reason: `pH ${sensorData.ph} below target range (${dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance})`
            }
          };
        } catch (err) {
          error(MODULE, 'Error dispensing pH Up', err);
          recordFailure(); // Record failure for circuit breaker
          
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
          
          info(MODULE, `PID controller calculated ${amount}ml dose of pH Down from ${pumpName} at ${flowRate}ml/s`);
          
          // Always dispense regardless of sensor simulation mode
          await dispensePump(pumpName, amount, flowRate);
          info(MODULE, `Successfully dispensed ${amount}ml of pH Down`);
          
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
              sensorSimulation: isSensorSimulation,
              reason: `pH ${sensorData.ph} above target range (${dosingConfig.targets.ph.target + dosingConfig.targets.ph.tolerance})`
            }
          };
        } catch (err) {
          error(MODULE, 'Error dispensing pH Down', err);
          recordFailure(); // Record failure for circuit breaker
          
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
      // Pass sensorSimulation flag but true dispenseMode flag to force actual dispensing
      const result = await doNutrientDosing(sensorData, isSensorSimulation, true);
      
      // If successful, record the effectiveness check
      if (result.action === 'dosed' && result.details.dispensed) {
        for (const dispensed of result.details.dispensed) {
          scheduleEffectivenessCheck(
            dispensed.pumpName, 
            dispensed.amount, 
            sensorData.ec,
            'ec'
          );
        }
      }
      
      return result;
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
  } catch (err) {
    error(MODULE, 'Unexpected error in auto-dosing', err);
    recordFailure(); // Record failure for circuit breaker
    
    return {
      action: 'error',
      details: { error: `Unexpected error in auto-dosing: ${err}` }
    };
  } finally {
    // Always release the lock when we're done, regardless of outcome
    if (dosingLock.timeout) {
      clearTimeout(dosingLock.timeout);
      dosingLock.timeout = null;
    }
    dosingLock.inProgress = false;
    debug(MODULE, 'Dosing cycle completed, lock released');
  }
}

/**
 * Schedule a check to measure the effectiveness of a dose after stabilization
 */
function scheduleEffectivenessCheck(
  pumpName: string,
  doseAmount: number,
  beforeValue: number,
  targetType: 'ph' | 'ec'
): void {
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
      recordDoseEffectiveness({
        timestamp: new Date().toISOString(),
        pumpName,
        doseAmount,
        beforeValue,
        afterValue: targetType === 'ph' ? currentReadings.ph : currentReadings.ec,
        effectivenessRatio: 0, // Will be calculated in recordDoseEffectiveness
        targetType
      });
      
      debug(MODULE, `Recorded effectiveness data for ${pumpName} ${doseAmount}ml dose`);
    } catch (err) {
      error(MODULE, 'Error recording dose effectiveness', err);
    }
  }, 300000); // Check after 5 minutes for stabilization
}

/**
 * Validate sensor readings to prevent acting on bad data
 */
function validateSensorReadings(readings: SensorData): boolean {
  // pH should be between 0 and 14
  if (readings.ph === undefined || readings.ph < 0 || readings.ph > 14) {
    warn(MODULE, `Invalid pH reading: ${readings.ph}`);
    return false;
  }
  
  // EC should be positive
  if (readings.ec === undefined || readings.ec < 0 || readings.ec > 10) {
    warn(MODULE, `Invalid EC reading: ${readings.ec}`);
    return false;
  }
  
  // Water temperature should be reasonable
  if (readings.waterTemp !== undefined && 
     (readings.waterTemp < 0 || readings.waterTemp > 40)) {
    warn(MODULE, `Unusual water temperature: ${readings.waterTemp}°C`);
    // Don't fail on temperature - it's not critical for dosing
  }
  
  return true;
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

/**
 * Initialize the auto-dosing system with configuration
 * Enhanced with error handling and recovery
 */
export async function initializeAutoDosing(): Promise<boolean> {
  try {
    // If not already initialized, load from disk first
    if (!isInitialized) {
      info(MODULE, "== AUTO-DOSING: INITIALIZING ==");
      
      // Reset the server start time to enforce the safety delay
      serverStartTime = Date.now();
      info(MODULE, `Setting startup safety delay - no dosing will occur for ${STARTUP_SAFETY_DELAY/1000} seconds`);
      
      // Reset circuit breaker state on initialization
      if (dosingConfig.errorHandling) {
        dosingConfig.errorHandling.circuitOpen = false;
        dosingConfig.errorHandling.currentFailCount = 0;
        dosingConfig.errorHandling.lastFailure = null;
      }
      
      await loadDosingConfigFromDisk(); // Must happen first to load saved settings
      
      // CRITICAL SAFETY REQUIREMENT: Force auto-dosing to be disabled on startup
      // Track if it was previously enabled just for logging
      const wasEnabled = dosingConfig.enabled;
      
      // Always force disable regardless of loaded config
      dosingConfig.enabled = false;
      autoDosingExplicitlyDisabled = true; // Set the explicit disable flag
      
      // Log the state
      if (wasEnabled) {
        info(MODULE, "!!! CRITICAL SAFETY OVERRIDE: Auto-dosing was previously enabled but has been FORCED OFF on startup !!!");
        info(MODULE, "Auto-dosing will remain disabled until explicitly enabled by the user");
      } else {
        info(MODULE, "Auto-dosing is disabled on startup as required");
      }
      
      // Always save the disabled state
      saveDosingConfig();

      // Only sync with profile if we have an active profile
      const profile = await getActiveProfileOptimized();
      if (profile) {
        // We'll only sync pumps on first initialization, but we won't
        // change any intervals that were already loaded from disk
        const syncSuccess = await syncProfilePumps();
        if (!syncSuccess) {
          warn(MODULE, "Profile pump sync failed, but continuing with initialization");
        }
      } else {
        info(MODULE, "No active profile found, skipping profile pump sync");
      }
      
      // Reset PID controllers on initialization
      if (dosingConfig.pidControllers) {
        resetPIDController(dosingConfig.pidControllers.ph);
        resetPIDController(dosingConfig.pidControllers.ec);
        debug(MODULE, "Reset PID controllers to initial state");
      }
      
      // Verify all pumps are OFF via the pumps module
      if (typeof window === 'undefined') {
        try {
          const { getAllPumpStatus, stopPump } = await import('./pumps');
          const pumpStatus = getAllPumpStatus();
          const activePumps = pumpStatus.filter(p => p.active);
          
          if (activePumps.length > 0) {
            error(MODULE, `SAFETY CRITICAL: Found ${activePumps.length} active pumps during auto-dosing init. Forcing stop.`);
            
            // Stop all active pumps
            await Promise.all(activePumps.map(pump => {
              error(MODULE, `Emergency stopping active pump ${pump.name} during auto-dosing init`);
              return stopPump(pump.name).catch(err => 
                error(MODULE, `Error stopping pump ${pump.name}:`, err));
            }));
          }
        } catch (err) {
          error(MODULE, "Error checking pump status during initialization:", err);
        }
      }
      
      isInitialized = true;
      info(MODULE, "== AUTO-DOSING: INITIALIZATION COMPLETE - AUTO-DOSING IS DISABLED ==");
      
      // Debug output to verify final initialized config
      debug(MODULE, "Final initialized dosing config:", {
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
  } catch (err: any) {
    error(MODULE, "Failed to initialize auto-dosing:", err);
    recordFailure();
    return false;
  }
}

/**
 * Update the auto-dosing configuration
 */
export function updateDosingConfig(updates: Partial<DosingConfig>): DosingConfig {
  const oldEnabled = dosingConfig.enabled;
  const newEnabled = updates.enabled !== undefined ? updates.enabled : oldEnabled;
  
  debug(MODULE, 'Received updates:', updates);
  
  // Check if any minInterval values have changed
  const hasIntervalChanges = checkForIntervalChanges(updates);
  
  // Log the before state of dosing config
  debug(MODULE, 'Updating dosing config, before:', {
    enabled: dosingConfig.enabled,
    'phUp.minInterval': dosingConfig.dosing.phUp.minInterval,
    'phDown.minInterval': dosingConfig.dosing.phDown.minInterval,
    'nutrientPumps': Object.keys(dosingConfig.dosing.nutrientPumps).map(name => ({
      name,
      minInterval: dosingConfig.dosing.nutrientPumps[name].minInterval,
      doseAmount: dosingConfig.dosing.nutrientPumps[name].doseAmount,
      flowRate: dosingConfig.dosing.nutrientPumps[name].flowRate
    }))
  });
  
  // Deep merge changes
  dosingConfig = deepMerge(dosingConfig, updates);
  
  // Ensure the enabled state is explicitly set to prevent defaults from overriding
  if (updates.enabled !== undefined) {
    info(MODULE, `Explicitly setting enabled state to: ${updates.enabled}`);
    dosingConfig.enabled = updates.enabled;
  }
  
  // If intervals changed, reset lastDose timestamps to allow immediate dosing
  if (hasIntervalChanges) {
    info(MODULE, 'Interval settings changed, resetting lastDose timestamps');
    resetDoseTimestamps();
  }
  
  // If PID parameters were updated, reset the controllers
  if (updates.pidControllers) {
    info(MODULE, 'PID controller parameters updated, resetting controllers');
    if (dosingConfig.pidControllers) {
      resetPIDController(dosingConfig.pidControllers.ph);
      resetPIDController(dosingConfig.pidControllers.ec);
    }
  }
  
  // Log the after state of dosing config
  debug(MODULE, 'Updated dosing config, after:', {
    enabled: dosingConfig.enabled,
    'phUp.minInterval': dosingConfig.dosing.phUp.minInterval,
    'phDown.minInterval': dosingConfig.dosing.phDown.minInterval,
    'nutrientPumps': Object.keys(dosingConfig.dosing.nutrientPumps).map(name => ({
      name,
      minInterval: dosingConfig.dosing.nutrientPumps[name].minInterval,
      doseAmount: dosingConfig.dosing.nutrientPumps[name].doseAmount,
      flowRate: dosingConfig.dosing.nutrientPumps[name].flowRate
    }))
  });
  
  // If auto-dosing was just enabled, log this important event
  if (!oldEnabled && newEnabled) {
    info(MODULE, 'Auto-dosing has been enabled with configuration:', dosingConfig);
    
    // Reset the flag when auto-dosing is enabled
    autoDosingExplicitlyDisabled = false;
    
    // Reset lastDose timestamps when enabling to allow immediate dosing
    resetDoseTimestamps();
    
    // Also reset the circuit breaker
    if (dosingConfig.errorHandling) {
      dosingConfig.errorHandling.circuitOpen = false;
      dosingConfig.errorHandling.currentFailCount = 0;
      info(MODULE, 'Reset circuit breaker on auto-dosing enable');
    }
    
    // Sync with pump assignments from active profile
    syncProfilePumps().catch(err => {
      error(MODULE, "Failed to sync profile pumps when enabling auto-dosing:", err);
    });
    
    // Dynamically import server-init to avoid circular dependencies
    if (typeof window === 'undefined') {
      // Stop any existing monitoring first to ensure a clean restart
      import('./monitorControl').then(({ enableMonitoring }) => {
        // Explicitly re-enable monitoring
        enableMonitoring();
        info(MODULE, 'Explicitly enabled monitoring on auto-dosing enable');
        
        import('./server-init').then(({ initializeServer, startContinuousMonitoring, stopContinuousMonitoring }) => {
          // First stop any existing monitoring
          stopContinuousMonitoring();
          info(MODULE, 'Stopped any existing monitoring before restart');
          
          initializeServer().catch(err => {
            error(MODULE, 'Failed to initialize server after enabling auto-dosing:', err);
          });
          
          // Start continuous monitoring when auto-dosing is enabled
          startContinuousMonitoring();
          info(MODULE, 'Started continuous monitoring for auto-dosing');
        }).catch(err => {
          error(MODULE, 'Failed to import server-init module:', err);
        });
      }).catch(err => {
        error(MODULE, 'Failed to import monitorControl module:', err);
      });
    }
  } else if (oldEnabled && !newEnabled) {
    // Stop continuous monitoring when auto-dosing is disabled
    info(MODULE, '### AUTO-DOSING DISABLED - STOPPING MONITORING ###');
    
    // Set the explicit disable flag
    autoDosingExplicitlyDisabled = true;
    
    // Directly disable monitoring flag
    disableMonitoring();
    
    // Force stop any active pumps when auto-dosing is disabled
    if (typeof window === 'undefined') {
      // First stop monitoring
      import('./server-init').then(({ stopContinuousMonitoring }) => {
        stopContinuousMonitoring();
        
        // Then force stop any active pumps
        return import('./pumps').then(({ getAllPumpStatus, stopPump }) => {
          const pumps = getAllPumpStatus();
          info(MODULE, `Checking for active pumps to stop: ${pumps.filter(p => p.active).length} active`);
          
          for (const pump of pumps) {
            if (pump.active) {
              info(MODULE, `Force stopping active pump ${pump.name} due to auto-dosing being disabled`);
              stopPump(pump.name).catch(err => 
                error(MODULE, `Error stopping pump ${pump.name}:`, err));
            }
          }
        });
      }).catch(err => {
        error(MODULE, 'Failed to import server-init module or stop pumps:', err);
      });
    }
  }
  
  // Save the config to disk asynchronously
  saveDosingConfigAsync().catch((err: any) => {
    error(MODULE, 'Failed to save auto-dosing config asynchronously:', err);
    // Fall back to sync save
    saveDosingConfig();
  });
  
  return dosingConfig;
} 