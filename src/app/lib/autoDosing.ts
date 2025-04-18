/**
 * NuTetra Auto-Dosing System
 * Controls automatic nutrient and pH dosing based on sensor readings
 */

import { getAllPumpStatus, stopPump, dispensePump } from './pumps';
import type { PumpName } from './pumps';
import { getAllSensorReadings, SensorData } from './sensors';
import { getSimulatedSensorReadings, isSimulationEnabled } from './simulation';
import fs from 'fs';
import path from 'path';
import { info, error as logError, debug, trace, warn } from './logger';

// Module name for logging
const MODULE = 'autoDosing';

// Add initialization safety delay - prevent dosing for initial seconds after server start
let serverStartTime = Date.now();
const STARTUP_SAFETY_DELAY = 30000; // 30 seconds before allowing any dosing

// Environment configuration
const ENV = process.env.NODE_ENV || 'development';

// Path configuration with environment support
const DATA_PATHS = {
  development: path.join(process.cwd(), 'data'),
  test: path.join(process.cwd(), 'test_data'),
  production: path.join(process.cwd(), 'data')
};

// Get the appropriate data path for current environment
const DATA_PATH = DATA_PATHS[ENV] || DATA_PATHS.development;

// Ensure the data directory exists
if (typeof window === 'undefined' && !fs.existsSync(DATA_PATH)) {
  try {
    fs.mkdirSync(DATA_PATH, { recursive: true });
    console.log(`Created data directory for ${ENV} environment: ${DATA_PATH}`);
  } catch (err) {
    console.error(`Failed to create data directory for ${ENV} environment:`, err);
  }
}

// Configure path to the active profile and profiles files
const ACTIVE_PROFILE_FILE = path.join(DATA_PATH, 'active_profile.json');
const PROFILES_FILE = path.join(DATA_PATH, 'profiles.json');

console.log(`Using data path for ${ENV} environment: ${DATA_PATH}`);
console.log(`Active profile file: ${ACTIVE_PROFILE_FILE}`);
console.log(`Profiles file: ${PROFILES_FILE}`);

// Cache TTL configuration based on environment
const CACHE_CONFIG = {
  development: {
    profileTTL: 15000, // 15 seconds in development for faster testing
    stateRefreshInterval: 5000 // 5 seconds refresh in development
  },
  test: {
    profileTTL: 5000, // 5 seconds in test for faster unit tests
    stateRefreshInterval: 2000 // 2 seconds refresh in test
  },
  production: {
    profileTTL: 60000, // 1 minute in production for stability
    stateRefreshInterval: 15000 // 15 seconds refresh in production
  }
};

// Get the appropriate cache configuration for current environment
const currentCacheConfig = CACHE_CONFIG[ENV] || CACHE_CONFIG.development;
console.log(`Using ${ENV} environment cache configuration: profileTTL=${currentCacheConfig.profileTTL}ms`);

// Profile cache system with environment-specific TTL
const profileCache = {
  data: null,
  timestamp: 0,
  TTL: currentCacheConfig.profileTTL // Use environment-specific TTL from config
};

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
  // pH has more immediate reaction, needs smoother control
  ph: { 
    kp: 0.6,   // Higher proportional gain for faster response
    ki: 0.05,  // Lower integral to prevent overshoot
    kd: 0.1,   // Low derivative for stability
    integral: 0, 
    lastError: 0, 
    lastTime: 0 
  },
  // EC changes more slowly, needs more aggressive control
  ec: { 
    kp: 0.4,   // Lower proportional gain for EC
    ki: 0.15,  // Higher integral to accumulate error over time
    kd: 0.05,  // Lower derivative for smoother response
    integral: 0, 
    lastError: 0, 
    lastTime: 0 
  }
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
    nutrient: {
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
    nutrient: Date | null;
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
    nutrient: {
      pumpName: 'Pump 1', // Changed from 'Nutrient' to a valid PumpName
      doseAmount: 0.5,
      flowRate: 1.0,
      minInterval: 120
    },
    nutrientPumps: {}
  },
  lastDose: {
    phUp: null,
    phDown: null,
    nutrient: null,
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

// Update the dosingLock object and timeout management
// Unified dosing lock to prevent concurrent operations and rate limit calls
const dosingLock = {
  inProgress: false,
  lastAttempt: 0,
  acquiredAt: 0, // Track when the lock was acquired
  timeout: null as NodeJS.Timeout | null
};
const MAX_DOSING_LOCK_TIME = 30000; // 30 seconds max lock time as safety measure
const MIN_DOSING_ATTEMPT_INTERVAL = 2000; // 2s minimum between attempts

// Acquire the dosing lock with proper timeout management
function acquireDosingLock(): boolean {
  // Check if lock is already held
  if (dosingLock.inProgress) {
    const lockHeldTime = Date.now() - dosingLock.acquiredAt;
    
    // If the lock has been held too long, force release it
    if (lockHeldTime > MAX_DOSING_LOCK_TIME) {
      warn(MODULE, `Force releasing dosing lock after ${lockHeldTime}ms (exceeds max time of ${MAX_DOSING_LOCK_TIME}ms)`);
      releaseDosingLock();
    } else {
      // Lock is still validly held
      return false;
    }
  }
  
  // Acquire the lock
  dosingLock.inProgress = true;
  dosingLock.acquiredAt = Date.now();
  
  // Set a safety timeout to release the lock if something goes wrong
  if (dosingLock.timeout) {
    clearTimeout(dosingLock.timeout);
  }
  
  dosingLock.timeout = setTimeout(() => {
    warn(MODULE, 'Safety timeout reached, releasing dosing lock');
    releaseDosingLock();
  }, MAX_DOSING_LOCK_TIME);
  
  return true;
}

// Release the dosing lock and clear any timeouts
function releaseDosingLock(): void {
  dosingLock.inProgress = false;
  
  if (dosingLock.timeout) {
    clearTimeout(dosingLock.timeout);
    dosingLock.timeout = null;
  }
  
  debug(MODULE, 'Dosing lock released');
}

// Reset the dosing lock timeout - call this during long operations to prevent timeout
function resetDosingLockTimeout(): void {
  if (!dosingLock.inProgress) {
    return; // No lock to reset
  }
  
  // Clear existing timeout
  if (dosingLock.timeout) {
    clearTimeout(dosingLock.timeout);
  }
  
  // Set a new timeout
  dosingLock.timeout = setTimeout(() => {
    warn(MODULE, 'Safety timeout reached, releasing dosing lock');
    releaseDosingLock();
  }, MAX_DOSING_LOCK_TIME);
  
  debug(MODULE, 'Dosing lock timeout reset');
}

// Cache for active profile to reduce disk I/O - uses environment-specific TTL
let activeProfileCache: any = null;
let profileCacheTime: number = 0;
const PROFILE_CACHE_TTL = currentCacheConfig.profileTTL; // Use environment-specific TTL

// Export lock status check for external components
export function isLocked(): boolean {
  return dosingLock.inProgress;
}

/**
 * Deep merge utility that creates a new object without mutating originals
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  if (!source || typeof source !== 'object') return target;
  if (!target || typeof target !== 'object') return target;
  
  // Create a new object to avoid modifying the original
  const output = Array.isArray(target) ? [...target as any] : {...target};
  
  // Iterate over source properties
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      // Skip undefined values
      if (sourceValue === undefined) continue;
      
      // If both values are objects (but not null), merge them recursively
      if (sourceValue && targetValue && 
          typeof sourceValue === 'object' && typeof targetValue === 'object' && 
          !Array.isArray(sourceValue) && !Array.isArray(targetValue) &&
          sourceValue !== null && targetValue !== null) {
        // Recursive merge for nested objects
        output[key] = deepMerge(targetValue, sourceValue);
      } else {
        // For non-objects or arrays, just copy the value
        // For arrays, replace entirely rather than merging
        // Use JSON parse/stringify for deep cloning to avoid reference issues
        if (sourceValue !== null && typeof sourceValue === 'object') {
          output[key] = JSON.parse(JSON.stringify(sourceValue));
        } else {
          output[key] = sourceValue;
        }
      }
    }
  }
  
  return output as T;
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
    // Use the environment-specific data path for configuration
    const configPath = path.join(DATA_PATH, 'autodosing.json');
    
    if (fs.existsSync(configPath)) {
      const savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      info(MODULE, 'Loading saved auto-dosing config from disk', { path: configPath, environment: ENV });
      
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
  logError(MODULE, 'Error loading auto-dosing config from disk', err);
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
  try {
    // Input validation
    if (current === undefined || target === undefined) {
      logError(MODULE, 'Invalid input to PID controller: current or target is undefined');
      return baseDoseAmount; // Return base dose as fallback
    }
    
    if (!controller) {
      logError(MODULE, 'PID controller is null or undefined');
      return baseDoseAmount; // Return base dose as fallback
    }
    
    const now = Date.now();
    const dt = controller.lastTime === 0 ? 1 : Math.min((now - controller.lastTime) / 1000, 10);
    
    // Skip integral if first run
    if (controller.lastTime === 0) {
      controller.lastTime = now;
      controller.lastError = target - current;
      debug(MODULE, 'First PID run, using base dose amount', { baseDoseAmount });
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
    const result = Math.round(scaledDose * 10) / 10;
    
    trace(MODULE, 'PID calculation', {
      current,
      target,
      error,
      integral: controller.integral,
      derivative,
      output,
      scaledDose: result,
      baseDose: baseDoseAmount
    });
    
    return result;
  } catch (err) {
    logError(MODULE, 'Error in PID calculation:', err);
    recordFailure(); // Record failure for circuit breaker
    return baseDoseAmount; // Return base dose as fallback on error
  }
}

/**
 * Reset a PID controller to initial state
 */
function resetPIDController(controller: PIDController): void {
  try {
    // Guard against null or undefined controller
    if (!controller) {
      logError(MODULE, 'Attempted to reset null or undefined PID controller');
      return;
    }
    
    controller.integral = 0;
    controller.lastError = 0;
    controller.lastTime = 0;
    
    debug(MODULE, 'PID controller reset successful', {
      kp: controller.kp,
      ki: controller.ki,
      kd: controller.kd
    });
  } catch (err) {
    logError(MODULE, 'Error resetting PID controller:', err);
    // Don't throw - this is a non-critical operation
  }
}

/**
 * Record dose effectiveness for analysis and adaptive dosing
 */
function recordDoseEffectiveness(data: DoseEffectiveness): void {
  // First check circuit breaker to prevent recording when system is in failure mode
  if (isCircuitOpen()) {
    warn(MODULE, 'Circuit breaker is open, skipping dose effectiveness recording');
    return;
  }

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
 * Always resets the failure count even after temporary success
 */
function recordSuccess(): void {
  if (!dosingConfig.errorHandling) return;
  
  // Reset failure count regardless of previous state
  dosingConfig.errorHandling.currentFailCount = 0;
  
  // Reset circuit breaker if it was open
  if (dosingConfig.errorHandling.circuitOpen) {
    dosingConfig.errorHandling.circuitOpen = false;
    info(MODULE, 'Circuit breaker reset after successful operation');
  }
  
  // Also clear the last failure timestamp
  dosingConfig.errorHandling.lastFailure = null;
  
  debug(MODULE, 'Reset failure tracking after successful operation');
  
  // Ensure changes are saved to persist circuit breaker state
  saveDosingConfig();
}

/**
 * Calculate backoff time based on current failure count
 */
function calculateBackoffTime(): number {
  // Use current failure count to determine backoff time
  if (!dosingConfig.errorHandling) return 5000; // Default 5 seconds if no config
  
  const baseBackoff = dosingConfig.errorHandling.baseBackoffMs || 1000;
  const backoffFactor = dosingConfig.errorHandling.backoffFactor || 1.5;
  const failCount = dosingConfig.errorHandling.currentFailCount || 0;
  
  // Calculate exponential backoff with ceiling
  return Math.min(baseBackoff * Math.pow(backoffFactor, failCount), 60000); // Max 60 seconds
}

/**
 * Save dosing configuration to disk
 * Uses atomic file operations to prevent data corruption
 */
function saveDosingConfig(): void {
  if (typeof window !== 'undefined') return; // Don't run on client
  
  try {
    // Ensure data directory exists
    if (!fs.existsSync(DATA_PATH)) {
      fs.mkdirSync(DATA_PATH, { recursive: true });
    }
    
    // Get path for config file
    const configPath = path.join(DATA_PATH, 'autodosing.json');
    const tempPath = path.join(DATA_PATH, 'autodosing.json.tmp');
    
    // Create a deep copy of the config to avoid reference issues
    const configToSave = JSON.parse(JSON.stringify(dosingConfig));
    
    // Write to temporary file first
    fs.writeFileSync(tempPath, JSON.stringify(configToSave, null, 2), 'utf8');
    
    // Atomic rename to final filename (prevents corruption if system crashes during write)
    fs.renameSync(tempPath, configPath);
    
    // Optionally force sync the parent directory to ensure changes are flushed to disk
    // This is more reliable but can be slower
    try {
      const dirFd = fs.openSync(DATA_PATH, 'r');
      fs.fsyncSync(dirFd);
      fs.closeSync(dirFd);
    } catch (syncErr) {
      warn(MODULE, 'Could not fsync directory:', syncErr);
      // Continue without error - this is just an additional safety measure
    }
    
    trace(MODULE, `Auto-dosing config saved to ${configPath}`);
  } catch (err) {
    logError(MODULE, 'Failed to save auto-dosing config to disk:', err);
    recordFailure(); // Record failure for circuit breaker
  }
}

/**
 * Asynchronous version of saveDosingConfig for non-blocking saves
 * Uses atomic file operations without creating backup files
 */
async function saveDosingConfigAsync(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Check circuit breaker but don't block config saves
      // Just log the warning but still proceed with the save
      if (isCircuitOpen()) {
        warn(MODULE, 'Circuit breaker is open, but still proceeding with config save');
      }
      
      saveDosingConfig();
      resolve();
    } catch (err) {
      logError(MODULE, 'Async save of dosing config failed:', err);
      reject(err);
    }
  });
}

/**
 * Load dosing configuration from disk with validation
 */
async function loadDosingConfigFromDisk(): Promise<boolean> {
  if (typeof window !== 'undefined') return false; // Don't run on client
  
  try {
    const configPath = path.join(DATA_PATH, 'autodosing.json');
    
    if (!fs.existsSync(configPath)) {
      info(MODULE, 'No saved auto-dosing config found, using defaults');
      return false;
    }
    
    const data = await fs.promises.readFile(configPath, 'utf8');
    const loadedConfig = JSON.parse(data);
    
    // Validate the loaded config
    if (!loadedConfig || typeof loadedConfig !== 'object') {
      warn(MODULE, 'Invalid auto-dosing config file format, using defaults');
      return false;
    }
    
    // Deep merge with defaults to ensure all required fields exist
    dosingConfig = deepMerge(DEFAULT_DOSING_CONFIG, loadedConfig);
    
    // Convert date strings back to Date objects for lastDose timestamps
    if (dosingConfig.lastDose.phUp) {
      dosingConfig.lastDose.phUp = new Date(dosingConfig.lastDose.phUp);
    }
    if (dosingConfig.lastDose.phDown) {
      dosingConfig.lastDose.phDown = new Date(dosingConfig.lastDose.phDown);
    }
    if (dosingConfig.lastDose.nutrient) {
      dosingConfig.lastDose.nutrient = new Date(dosingConfig.lastDose.nutrient);
    }
    
    // Convert nutrient pump timestamps
    for (const pumpName in dosingConfig.lastDose.nutrientPumps) {
      const timestamp = dosingConfig.lastDose.nutrientPumps[pumpName];
      if (timestamp) {
        dosingConfig.lastDose.nutrientPumps[pumpName] = new Date(timestamp);
      }
    }
    
    info(MODULE, 'Successfully loaded auto-dosing config from disk');
    return true;
  } catch (err) {
    logError(MODULE, 'Error loading auto-dosing config from disk:', err);
    recordFailure(); // Record failure for circuit breaker
    return false;
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
 * Sync auto-dosing pump configuration with the active profile
 * Enhanced to validate profile format and handle errors
 */
export async function syncProfilePumps(): Promise<boolean> {
  // Check circuit breaker first before proceeding
  if (isCircuitOpen()) {
    warn(MODULE, 'Circuit breaker is open, cannot sync profile pumps');
    return false;
  }

  try {
    const profile = await getActiveProfile();
    
    // Check if we have a valid profile
    if (!profile) {
      info(MODULE, 'No active profile found, leaving current pump configuration unchanged');
      return false;
    }
    
    // Validate profile format
    if (!isValidProfileFormat(profile)) {
      logError(MODULE, 'Invalid profile format, cannot sync pumps');
      recordFailure();
      return false;
    }
    
    // Get the current pump settings for preservation
    const currentSettings = {
      phUp: dosingConfig.dosing.phUp.minInterval,
      phDown: dosingConfig.dosing.phDown.minInterval,
      nutrientPumps: {} as Record<string, number>
    };
    
    // Store current nutrient pump intervals
    Object.keys(dosingConfig.dosing.nutrientPumps).forEach(pumpName => {
      currentSettings.nutrientPumps[pumpName] = 
        dosingConfig.dosing.nutrientPumps[pumpName].minInterval;
    });
    
    // Start with a copy of the current config to prevent mutation issues
    const updatedConfig = deepMerge({}, dosingConfig);
    
    // Clear out existing nutrient pump config to rebuild it
    updatedConfig.dosing.nutrientPumps = {};
    
    // Track pump names we've added so we can clean up any orphaned pumps
    const modifiedPumps: string[] = [];
    
    // Extract nutrient pump assignments from profile
    const pumps = profile.pumpAssignments || [];
    
    // Calculate nutrient proportions
    const nutrientProportions: Record<string, number> = {};
    let totalProportions = 0;
    
    // First pass to calculate total proportions
    for (const pump of pumps) {
      // Skip if missing key fields
      if (!pump.pumpName || typeof pump.dosage !== 'number') {
        warn(MODULE, `Skipping invalid pump in profile: ${JSON.stringify(pump)}`);
        continue;
      }
      
      // Add proportions for valid pumps
      nutrientProportions[pump.pumpName] = pump.dosage;
      totalProportions += pump.dosage;
    }
    
    // Safety check - if total is 0, use equal proportions
    if (totalProportions === 0) {
      warn(MODULE, 'Total pump proportions is 0, using equal proportions');
      
      // Assign equal proportions to all pumps
      for (const pump of pumps) {
        if (pump.pumpName) {
          nutrientProportions[pump.pumpName] = 1;
          totalProportions += 1;
        }
      }
      
      // If we still have 0, something is wrong - abort
      if (totalProportions === 0) {
        logError(MODULE, 'No valid pumps found in profile');
        return false;
      }
    }
    
    // Normalize the proportions
    for (const pumpName in nutrientProportions) {
      nutrientProportions[pumpName] = nutrientProportions[pumpName] / totalProportions;
    }
    
    // Base dose amount for nutrient pumps
    const baseDoseAmount = 0.5; // 0.5mL base dose
    
    // Process each pump in the profile
    for (const pump of pumps) {
      try {
        // Validate pump has the required fields
        if (!pump.pumpName || typeof pump.dosage !== 'number') {
          continue; // Already warned above
        }
        
        // Add to modified pumps list
        modifiedPumps.push(pump.pumpName);
        
        // Calculate this pump's proportion
        const proportion = nutrientProportions[pump.pumpName];
        
        // Get any existing configuration
        const existingPump = dosingConfig.dosing.nutrientPumps[pump.pumpName];
        
        // Get nutrient information if available
        let nutrientInfo = null;
        if (pump.nutrientId && pump.brandId) {
          nutrientInfo = {
            productId: pump.nutrientId,
            brandId: pump.brandId,
            productName: pump.productName || 'Unknown Product',
            brandName: pump.brandName || 'Unknown Brand'
          };
        }
        
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
        
        info(MODULE, `Configured nutrient pump "${pump.pumpName}" with doseAmount=${updatedConfig.dosing.nutrientPumps[pump.pumpName].doseAmount}mL, proportion=${proportion.toFixed(2)}`);
      } catch (err) {
        warn(MODULE, `Error processing pump ${pump.pumpName}:`, err);
        // Continue with other pumps
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
        debug(MODULE, `Initialized timestamp for new pump: ${pumpName}`);
      }
    }
    
    // Always save config after syncing
    await saveDosingConfigAsync().catch(err => {
      logError(MODULE, 'Failed to save dosing config after profile sync:', err);
      // Still continue since we've updated in-memory config
    });
    
    info(MODULE, "=== PROFILE PUMP SYNC COMPLETED SUCCESSFULLY ===");
    
    // Record success for circuit breaker
    recordSuccess();
    
    return true;
  } catch (err) {
    logError(MODULE, 'Error syncing profile pumps:', err);
    recordFailure();
    
    // Try to recover from the error condition
    try {
      // If the config might be in a bad state, revert to the last known good state
      await loadDosingConfigFromDisk().catch(loadErr => {
        logError(MODULE, 'Failed to load config during error recovery:', loadErr);
      });
    } catch (recoveryErr) {
      logError(MODULE, 'Error during recovery attempt:', recoveryErr);
    }
    
    return false;
  }
}

/**
 * Validate that the profile has the expected format
 */
function isValidProfileFormat(profile: any): boolean {
  // Check for basic structure
  if (!profile || typeof profile !== 'object') {
    warn(MODULE, 'Profile is not an object');
    return false;
  }
  
  // Check for pump assignments array
  if (!Array.isArray(profile.pumpAssignments)) {
    warn(MODULE, 'Profile does not have a valid pumpAssignments array');
    return false;
  }
  
  // Must have at least one pump
  if (profile.pumpAssignments.length === 0) {
    warn(MODULE, 'Profile has empty pumpAssignments array');
    return false;
  }
  
  // Check that at least one pump has required fields
  let hasValidPump = false;
  for (const pump of profile.pumpAssignments) {
    if (pump.pumpName && typeof pump.dosage === 'number') {
      hasValidPump = true;
      break;
    }
  }
  
  if (!hasValidPump) {
    warn(MODULE, 'Profile has no valid pump assignments');
    return false;
  }
  
  return true;
}

/**
 * Get the active profile with improved error handling and caching
 */
async function getActiveProfileOptimized(): Promise<any> {
  try {
    // Use cached profile if available and not expired
    if (profileCache.data && 
        (Date.now() - profileCache.timestamp) < profileCache.TTL) {
      return profileCache.data;
    }
    
    // Get active profile ID
    const activeProfileData = await getServerJSON(ACTIVE_PROFILE_FILE);
    if (!activeProfileData || !activeProfileData.activeProfileId) {
      debug(MODULE, 'No active profile ID found');
      return null;
    }
    
    // Get all profiles
    const profiles = await getServerJSON(PROFILES_FILE);
    if (!profiles || !Array.isArray(profiles.profiles)) {
      warn(MODULE, 'No valid profiles data found');
      return null;
    }
    
    // Find the active profile
    const activeProfile = profiles.profiles.find(
      (p: any) => p.id === activeProfileData.activeProfileId
    );
    
    if (!activeProfile) {
      warn(MODULE, `Active profile ID ${activeProfileData.activeProfileId} not found in profiles list`);
      return null;
    }
    
    // Update cache
    profileCache.data = activeProfile;
    profileCache.timestamp = Date.now();
    
    return activeProfile;
  } catch (err) {
    logError(MODULE, 'Error getting active profile:', err);
    recordFailure();
    return null;
  }
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
  // Check circuit breaker first before any operations
  if (isCircuitOpen()) {
    warn(MODULE, 'Circuit breaker is open, skipping nutrient dosing');
    return {
      action: 'circuitOpen',
      details: { reason: 'Too many failures detected, system paused for safety' }
    };
  }

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
      logError(MODULE, 'No active profile found');
      return {
        action: 'error',
        details: { reason: 'No active profile found for nutrient dosing' }
      };
    }
    
    // Verify we have pump assignments in the profile
    const pumpDosages = profile.pumpDosages || profile.pumpAssignments || [];
    if (pumpDosages.length === 0) {
      logError(MODULE, 'No pump dosages defined in active profile');
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
      logError(MODULE, `No nutrient pumps found after filtering. Total pumps before filter: ${pumpDosages.length}. Pump names: ${pumpDosages.map((p: any) => p.pumpName || 'unnamed').join(', ')}`);
      return {
        action: 'error',
        details: { reason: 'No nutrient pumps defined in active profile' }
      };
    }
    
    // Calculate total dosage for proportional mixing
    const totalDosage = nutrientPumpDosages.reduce((sum: number, pump: any) => 
      sum + (Number(pump.dosage) || 0), 0);
      
    if (totalDosage <= 0) {
      logError(MODULE, 'Zero total dosage for nutrients in profile');
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
        logError(MODULE, `Error dispensing from ${pumpName}`, err);
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
    logError(MODULE, 'Error during nutrient dosing', err);
    return {
      action: 'error',
      details: { error: `Error during nutrient dosing: ${err}` }
    };
  }
}

/**
 * Check if we can dose a particular type now (respects minimum interval)
 * @param type The type of dosing to check (phUp, phDown, nutrient)
 */
function canDose(type: 'phUp' | 'phDown' | 'nutrient'): boolean {
  // First check circuit breaker - if open, no dosing is allowed
  if (isCircuitOpen()) {
    debug(MODULE, `Cannot dose ${type} - circuit breaker is open`);
    return false;
  }

  const now = new Date();
  const lastDose = dosingConfig.lastDose[type];
  
  // If we've never dosed or no timestamp exists, we can dose
  if (!lastDose) {
    return true;
  }
  
  // Get the minimum interval for this dosing type
  const minInterval = dosingConfig.dosing[type].minInterval * 1000; // convert to ms
  
  // Calculate time since last dose
  const timeSinceLastDose = now.getTime() - lastDose.getTime();
  
  // Can dose if enough time has passed
  return timeSinceLastDose >= minInterval;
}

/**
 * Check if we can dose a particular nutrient pump now (respects minimum interval)
 * @param pumpName The name of the nutrient pump to check
 */
function canDoseNutrient(pumpName: string): boolean {
  // First check circuit breaker - if open, no dosing is allowed
  if (isCircuitOpen()) {
    debug(MODULE, `Cannot dose ${pumpName} - circuit breaker is open`);
    return false;
  }

  // Make sure the pump exists in the config
  if (!dosingConfig.dosing.nutrientPumps[pumpName]) {
    warn(MODULE, `Cannot dose unknown pump: ${pumpName}`);
    return false;
  }
  
  const now = new Date();
  const lastDose = dosingConfig.lastDose.nutrientPumps[pumpName];
  
  // If we've never dosed or no timestamp exists, we can dose
  if (!lastDose) {
    return true;
  }
  
  // Get the minimum interval for this pump
  const minInterval = dosingConfig.dosing.nutrientPumps[pumpName].minInterval * 1000; // convert to ms
  
  // Calculate time since last dose
  const timeSinceLastDose = now.getTime() - lastDose.getTime();
  
  // Can dose if enough time has passed
  return timeSinceLastDose >= minInterval;
}

/**
 * Record that we dosed a particular type
 * @param type The type of dosing to record (phUp, phDown, nutrient)
 */
function recordDose(type: 'phUp' | 'phDown' | 'nutrient'): void {
  // Record the dose time
  dosingConfig.lastDose[type] = new Date();
  
  // Save the updated config to disk
  saveDosingConfig();
  
  debug(MODULE, `Recorded ${type} dose at ${dosingConfig.lastDose[type]?.toISOString()}`);
}

/**
 * Record that we dosed a particular nutrient pump
 * @param pumpName The name of the nutrient pump to record
 */
function recordNutrientDose(pumpName: string): void {
  // Make sure the pump exists in the lastDose structure
  if (!dosingConfig.lastDose.nutrientPumps[pumpName]) {
    dosingConfig.lastDose.nutrientPumps[pumpName] = null;
  }
  
  // Record the dose time
  dosingConfig.lastDose.nutrientPumps[pumpName] = new Date();
  
  // Save the updated config to disk
  saveDosingConfig();
  
  debug(MODULE, `Recorded ${pumpName} dose at ${dosingConfig.lastDose.nutrientPumps[pumpName]?.toISOString()}`);
}

/**
 * Helper function to load JSON from a server file
 */
async function getServerJSON(filePath: string): Promise<any> {
  if (typeof window !== 'undefined') return null;
  if (isCircuitOpen()) {
    warn(MODULE, `Circuit breaker is open, cannot load JSON from ${filePath}`);
    return null;
  }
  
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    
    const data = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    logError(MODULE, `Error loading JSON from ${filePath}:`, err);
    recordFailure();
    return null;
  }
}

// Add or update this interface definition near the top of the file
interface ExtendedSensorData {
  ec?: number;
  ph?: number;
  dosing?: {
    ec: { target: number; current: number };
    ph: { target: number; current: number };
  };
  [key: string]: any;
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
  let result: { action: string; details: any } | null = null;
  
  if (now - dosingLock.lastAttempt < MIN_DOSING_ATTEMPT_INTERVAL) {
    warn(MODULE, `Dosing attempted too frequently (${now - dosingLock.lastAttempt}ms since last attempt)`);
    result = {
      action: 'waiting',
      details: { reason: 'Dosing attempted too frequently, please wait' }
    };
    return result;
  }
  dosingLock.lastAttempt = now;
  
  // Check startup safety delay to prevent dosing immediately after server start
  if (now - serverStartTime < STARTUP_SAFETY_DELAY) {
    const remainingTime = Math.ceil((STARTUP_SAFETY_DELAY - (now - serverStartTime)) / 1000);
    warn(MODULE, `Server recently started, waiting ${remainingTime}s before allowing dosing operations`);
    result = {
      action: 'waiting',
      details: { reason: `Server recently started, safety delay active (${remainingTime}s remaining)` }
    };
    return result;
  }
  
  // First, check if auto-dosing has been explicitly disabled
  if (autoDosingExplicitlyDisabled) {
    warn(MODULE, 'Auto-dosing has been explicitly disabled, aborting dosing operation');
    result = { 
      action: 'aborted', 
      details: { reason: 'Auto-dosing has been explicitly disabled' } 
    };
    return result;
  }
  
  // Check if auto-dosing is enabled using strict comparison
  if (dosingConfig.enabled !== true) {
    debug(MODULE, 'Auto-dosing is disabled, skipping cycle');
    result = { 
      action: 'none', 
      details: { reason: 'Auto-dosing is disabled' } 
    };
    return result;
  }
  
  // Check if circuit breaker is open
  if (isCircuitOpen()) {
    warn(MODULE, 'Circuit breaker is open, skipping dosing cycle');
    result = {
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
    return result;
  }
  
  // Synchronous check to prevent concurrent operations
  if (dosingLock.inProgress) {
    warn(MODULE, 'Dosing already in progress, cannot start another operation');
    result = {
      action: 'waiting',
      details: { reason: 'A dosing operation is already in progress' }
    };
    return result;
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
    let sensorData: ExtendedSensorData = {
      dosing: {
        ec: { target: 0, current: 0 },
        ph: { target: 0, current: 0 }
      }
    };
    let isSimulationMode = false;
    
    try {
      // Check simulation mode first
      try {
        isSimulationMode = await isSimulationEnabled();
      } catch (err) {
        warn(MODULE, 'Error checking simulation mode, assuming not simulated', err);
        isSimulationMode = false;
      }
      
      // Get the sensor data from the API endpoint to ensure consistent readings
      try {
        // Use the API endpoint to get sensor readings (simulated or real)
        const response = await fetch('http://localhost:3000/api/sensors');
        if (!response.ok) {
          throw new Error(`Failed to get sensor readings from API: ${response.statusText}`);
        }
        
        const apiData = await response.json();
        if (apiData.status === 'error') {
          throw new Error(`Sensor API returned error: ${apiData.error}`);
        }
        
        sensorData = {
          ph: apiData.ph,
          ec: apiData.ec,
          waterTemp: apiData.waterTemp,
          timestamp: apiData.timestamp || new Date().toISOString()
        };
        
        // Log the source of the data
        info(MODULE, `Got sensor readings from API: pH=${sensorData.ph.toFixed(2)}, EC=${sensorData.ec.toFixed(2)} (simulation: ${isSimulationMode})`);
      } catch (apiError) {
        // Fallback to direct method calls if API fails
        warn(MODULE, `Failed to get readings from API, falling back to direct method calls: ${apiError}`);
        
        if (isSimulationMode) {
          const simData = await getSimulatedSensorReadings();
          sensorData = {
            ph: simData.ph,
            ec: simData.ec,
            waterTemp: simData.waterTemp,
            timestamp: new Date().toISOString()
          };
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
      }
      
      // Validate sensor data regardless of source
      if (sensorData.ph === undefined || sensorData.ec === undefined) {
        throw new Error('Invalid sensor data: Missing pH or EC values');
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
      result = {
        action: 'error',
        details: { reason: 'Failed to get sensor readings', error: error instanceof Error ? error.message : String(error) }
      };
      return result;
    }
    
    // Check if sensors report realistic values to prevent dosing based on bad data
    if (sensorData.ph <= 0 || sensorData.ph >= 14 || sensorData.ec < 0 || sensorData.ec > 5) {
      // Release the lock before returning
      dosingLock.inProgress = false;
      if (dosingLock.timeout) {
        clearTimeout(dosingLock.timeout);
        dosingLock.timeout = null;
      }
      
      recordFailure();
      
      warn(MODULE, `Invalid sensor readings detected: pH=${sensorData.ph}, EC=${sensorData.ec}`);
      result = {
        action: 'error',
        details: { reason: 'Invalid sensor readings detected', sensorData }
      };
      return result;
    }
    
    info(MODULE, `Current readings: pH=${sensorData.ph.toFixed(2)}, EC=${sensorData.ec.toFixed(2)}`);
    
    // Keep track of what was dosed
    const dosed: any[] = [];
    
    // Initialize sensorData with dosing property
    sensorData = {
      ...sensorData,
      dosing: {
        ec: { 
          target: dosingConfig.targets.ec.target, 
          current: sensorData?.ec || 0 
        },
        ph: { 
          target: dosingConfig.targets.ph.target, 
          current: sensorData?.ph || 7 
        }
      }
    };
    
    // Check if pH is too low (need to add pH Up)
    if (sensorData.ph < (dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance)) {
      info(MODULE, `pH too low: ${sensorData.ph.toFixed(2)}, target: ${dosingConfig.targets.ph.target.toFixed(2)}`);
      
      // Initialize the dosing.ph if it doesn't exist
      if (!sensorData.dosing.ph) {
        sensorData.dosing.ph = {
          target: dosingConfig.targets.ph.target,
          current: sensorData.ph
        };
      }
      
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
          
          // Force direct import of dispensePump to ensure it's using the correct implementation
          const { dispensePump } = await import('./pumps');
          
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
          
          result = {
            action: 'dosed',
            details: {
              type: 'pH Up',
              amount,
              pumpName,
              sensorSimulation: isSimulationMode,
              reason: `pH ${sensorData.ph} below target range (${dosingConfig.targets.ph.target - dosingConfig.targets.ph.tolerance})`
            }
          };
          return result;
        } catch (err) {
          logError(MODULE, 'Error dispensing pH Up', err);
          recordFailure(); // Record failure for circuit breaker
          
          result = {
            action: 'error',
            details: {
              type: 'pH Up',
              error: `Failed to dispense pH Up: ${err}`
            }
          };
          return result;
        }
      } else {
        debug(MODULE, 'Cannot dose pH Up yet due to minimum interval');
        result = {
          action: 'waiting',
          details: {
            type: 'pH Up',
            reason: 'Minimum interval between doses not reached'
          }
        };
        return result;
      }
    }
  
    // Check if pH is too high (need to add pH Down)
    if (sensorData.ph > (dosingConfig.targets.ph.target + dosingConfig.targets.ph.tolerance)) {
      info(MODULE, `pH too high: ${sensorData.ph.toFixed(2)}, target: ${dosingConfig.targets.ph.target.toFixed(2)}`);
      
      // Initialize the dosing.ph if it doesn't exist
      if (!sensorData.dosing.ph) {
        sensorData.dosing.ph = {
          target: dosingConfig.targets.ph.target,
          current: sensorData.ph
        };
      }
      
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
          
          result = {
            action: 'dosed',
            details: {
              type: 'pH Down',
              amount,
              pumpName,
              sensorSimulation: isSimulationMode,
              reason: `pH ${sensorData.ph} above target range (${dosingConfig.targets.ph.target + dosingConfig.targets.ph.tolerance})`
            }
          };
          return result;
        } catch (err) {
          logError(MODULE, 'Error dispensing pH Down', err);
          recordFailure(); // Record failure for circuit breaker
          
          result = {
            action: 'error',
            details: {
              type: 'pH Down',
              error: `Failed to dispense pH Down: ${err}`
            }
          };
          return result;
        }
      } else {
        debug(MODULE, 'Cannot dose pH Down yet due to minimum interval');
        result = {
          action: 'waiting',
          details: {
            type: 'pH Down',
            reason: 'Minimum interval between doses not reached'
          }
        };
        return result;
      }
    }
  
    // Check if EC is too low (need to add nutrients)
    if (sensorData.ec < (dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance)) {
      info(MODULE, `EC too low: ${sensorData.ec.toFixed(2)}, target: ${dosingConfig.targets.ec.target.toFixed(2)}`);
      
      // Initialize the dosing.ec if it doesn't exist
      if (!sensorData.dosing.ec) {
        sensorData.dosing.ec = {
          target: dosingConfig.targets.ec.target,
          current: sensorData.ec
        };
      }
      
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
          
          info(MODULE, `PID controller calculated ${amount}ml dose of Nutrient from ${pumpName} at ${flowRate}ml/s`);
          
          // Force direct import of dispensePump to ensure it's using the correct implementation
          const { dispensePump } = await import('./pumps');
          
          // Always dispense regardless of sensor simulation mode
          await dispensePump(pumpName, amount, flowRate);
          info(MODULE, `Successfully dispensed ${amount}ml of Nutrient`);
          
          // Record success for circuit breaker
          recordSuccess();
          
          // Record the dose
          recordDose('nutrient');
          
          // Record effectiveness for adaptive learning - create a timeout to check after 5 minutes
          const beforeValue = sensorData.ec;
          scheduleEffectivenessCheck(pumpName, amount, beforeValue, 'ec');
          
          result = {
            action: 'dosed',
            details: {
              type: 'Nutrient',
              amount,
              pumpName,
              sensorSimulation: isSimulationMode,
              reason: `EC ${sensorData.ec} below target range (${dosingConfig.targets.ec.target - dosingConfig.targets.ec.tolerance})`
            }
          };
          return result;
        } catch (err) {
          logError(MODULE, 'Error dispensing Nutrient', err);
          recordFailure(); // Record failure for circuit breaker
          
          result = {
            action: 'error',
            details: {
              type: 'Nutrient',
              error: `Failed to dispense Nutrient: ${err}`
            }
          };
          return result;
        }
      } else {
        debug(MODULE, 'Cannot dose Nutrient yet due to minimum interval');
        result = {
          action: 'waiting',
          details: {
            type: 'Nutrient',
            reason: 'Minimum interval between doses not reached'
          }
        };
        return result;
      }
    }
    
    // If EC is too high, we can't automatically reduce it (requires water change)
    if (sensorData.ec > (dosingConfig.targets.ec.target + dosingConfig.targets.ec.tolerance)) {
      info(MODULE, `EC too high: ${sensorData.ec.toFixed(2)}, target: ${dosingConfig.targets.ec.target.toFixed(2)}`);
      
      // Initialize the dosing.ec if it doesn't exist
      if (!sensorData.dosing.ec) {
        sensorData.dosing.ec = {
          target: dosingConfig.targets.ec.target,
          current: sensorData.ec
        };
      }
      
      result = {
        action: 'warning',
        details: {
          type: 'EC High',
          reason: `EC ${sensorData.ec} above target range (${dosingConfig.targets.ec.target + dosingConfig.targets.ec.tolerance}). Consider adding fresh water to dilute solution.`
        }
      };
      return result;
    }
  
    // If we get here, everything is within target ranges
    info(MODULE, 'All parameters within target ranges');
    
    // Record a success for the circuit breaker
    recordSuccess();
    
    result = {
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
    return result;
  } catch (err: unknown) {
    // Ensure the lock is released even if there's an error
    dosingLock.inProgress = false;
    if (dosingLock.timeout) {
      clearTimeout(dosingLock.timeout);
      dosingLock.timeout = null;
    }
    
    // Record the failure for circuit breaker
    recordFailure();
    
    logError(MODULE, 'Error during auto-dosing:', err);
    result = {
      action: 'error',
      details: { 
        reason: 'Error during auto-dosing operation', 
        error: err instanceof Error ? err.message : String(err)
      }
    };
    return result;
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
  // Don't schedule if circuit breaker is open
  if (isCircuitOpen()) {
    warn(MODULE, 'Circuit breaker is open, not scheduling effectiveness check');
    return;
  }

  const checkTimeout = setTimeout(async () => {
    try {
      // Check circuit breaker status again at time of execution
      if (isCircuitOpen()) {
        warn(MODULE, 'Circuit breaker open, skipping delayed effectiveness check');
        return;
      }

      // Get current reading after stabilization
      let currentReadings;
      
      if (await isSimulationEnabled()) {
        currentReadings = await getSimulatedSensorReadings();
      } else {
        currentReadings = await getAllSensorReadings();
      }
      
      // Validate readings before recording
      if (!validateSensorReadings(currentReadings)) {
        warn(MODULE, 'Invalid sensor readings for effectiveness check, skipping');
        return;
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
      logError(MODULE, 'Error recording dose effectiveness', err);
      recordFailure(); // Record failure in error tracking
    }
  }, 300000); // Check after 5 minutes for stabilization
  
  // Allow process to exit if this is the only timer running
  checkTimeout.unref?.();
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
      
      // Load config and set defaults for any missing values
      await loadDosingConfigFromDisk(); // Must happen first to load saved settings
      
      // CRITICAL SAFETY REQUIREMENT: Force auto-dosing to be disabled on startup
      // Track if it was previously enabled just for logging
      const wasEnabled = dosingConfig.enabled;
      
      // Always force disable regardless of loaded config
      dosingConfig.enabled = false;
      autoDosingEnabled = false; // Also update our new unified flag
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
      
      // Initialize our auto-dosing state flag for consistency
      initializeAutoDosingState();
      
      // Get active profile for pump configuration
      const profile = await getActiveProfile();
      
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
          const pumpStatus = getAllPumpStatus();
          const activePumps = pumpStatus.filter(p => p.active);
          
          if (activePumps.length > 0) {
            logError(MODULE, `SAFETY CRITICAL: Found ${activePumps.length} active pumps during auto-dosing init. Forcing stop.`);
            
            // Stop all active pumps
            await Promise.all(activePumps.map(pump => {
              logError(MODULE, `Emergency stopping active pump ${pump.name} during auto-dosing init`);
              return stopPump(pump.name).catch(err => 
                logError(MODULE, `Error stopping pump ${pump.name}:`, err));
            }));
          }
        } catch (err) {
          logError(MODULE, "Error checking pump status during initialization:", err);
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
    logError(MODULE, "Failed to initialize auto-dosing:", err);
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
  
  // Log the requested update
  info(MODULE, `Explicitly setting enabled state to: ${newEnabled}`);
  debug(MODULE, 'Received updates:', updates);
  
  // Validate target values before applying updates
  if (updates.targets) {
    // Validate pH target
    if (updates.targets.ph?.target !== undefined) {
      if (updates.targets.ph.target < 4.0 || updates.targets.ph.target > 10.0) {
        warn(MODULE, `Invalid pH target value: ${updates.targets.ph.target}, must be between 4.0 and 10.0`);
        // Clamp to valid range
        updates.targets.ph.target = Math.max(4.0, Math.min(updates.targets.ph.target, 10.0));
      }
    }
    
    // Validate pH tolerance
    if (updates.targets.ph?.tolerance !== undefined) {
      if (updates.targets.ph.tolerance < 0.1 || updates.targets.ph.tolerance > 1.0) {
        warn(MODULE, `Invalid pH tolerance value: ${updates.targets.ph.tolerance}, must be between 0.1 and 1.0`);
        // Clamp to valid range
        updates.targets.ph.tolerance = Math.max(0.1, Math.min(updates.targets.ph.tolerance, 1.0));
      }
    }
    
    // Validate EC target
    if (updates.targets.ec?.target !== undefined) {
      if (updates.targets.ec.target < 0.1 || updates.targets.ec.target > 3.0) {
        warn(MODULE, `Invalid EC target value: ${updates.targets.ec.target}, must be between 0.1 and 3.0`);
        // Clamp to valid range
        updates.targets.ec.target = Math.max(0.1, Math.min(updates.targets.ec.target, 3.0));
      }
    }
    
    // Validate EC tolerance
    if (updates.targets.ec?.tolerance !== undefined) {
      if (updates.targets.ec.tolerance < 0.05 || updates.targets.ec.tolerance > 0.5) {
        warn(MODULE, `Invalid EC tolerance value: ${updates.targets.ec.tolerance}, must be between 0.05 and 0.5`);
        // Clamp to valid range
        updates.targets.ec.tolerance = Math.max(0.05, Math.min(updates.targets.ec.tolerance, 0.5));
      }
    }
  }
  
  // Validate dosing values
  if (updates.dosing) {
    // Validate pH Up dosing
    if (updates.dosing.phUp) {
      if (updates.dosing.phUp.doseAmount !== undefined && (updates.dosing.phUp.doseAmount <= 0 || updates.dosing.phUp.doseAmount > 5)) {
        warn(MODULE, `Invalid pH Up dose amount: ${updates.dosing.phUp.doseAmount}, must be between 0.1 and 5.0 mL`);
        updates.dosing.phUp.doseAmount = Math.max(0.1, Math.min(updates.dosing.phUp.doseAmount, 5.0));
      }
      
      if (updates.dosing.phUp.flowRate !== undefined && (updates.dosing.phUp.flowRate <= 0 || updates.dosing.phUp.flowRate > 5)) {
        warn(MODULE, `Invalid pH Up flow rate: ${updates.dosing.phUp.flowRate}, must be between 0.1 and 5.0 mL/s`);
        updates.dosing.phUp.flowRate = Math.max(0.1, Math.min(updates.dosing.phUp.flowRate, 5.0));
      }
      
      if (updates.dosing.phUp.minInterval !== undefined && (updates.dosing.phUp.minInterval < 1 || updates.dosing.phUp.minInterval > 3600)) {
        warn(MODULE, `Invalid pH Up minimum interval: ${updates.dosing.phUp.minInterval}, must be between 1 and 3600 seconds`);
        updates.dosing.phUp.minInterval = Math.max(1, Math.min(updates.dosing.phUp.minInterval, 3600));
      }
    }
    
    // Validate pH Down dosing - similar to pH Up
    if (updates.dosing.phDown) {
      if (updates.dosing.phDown.doseAmount !== undefined && (updates.dosing.phDown.doseAmount <= 0 || updates.dosing.phDown.doseAmount > 5)) {
        warn(MODULE, `Invalid pH Down dose amount: ${updates.dosing.phDown.doseAmount}, must be between 0.1 and 5.0 mL`);
        updates.dosing.phDown.doseAmount = Math.max(0.1, Math.min(updates.dosing.phDown.doseAmount, 5.0));
      }
      
      if (updates.dosing.phDown.flowRate !== undefined && (updates.dosing.phDown.flowRate <= 0 || updates.dosing.phDown.flowRate > 5)) {
        warn(MODULE, `Invalid pH Down flow rate: ${updates.dosing.phDown.flowRate}, must be between 0.1 and 5.0 mL/s`);
        updates.dosing.phDown.flowRate = Math.max(0.1, Math.min(updates.dosing.phDown.flowRate, 5.0));
      }
      
      if (updates.dosing.phDown.minInterval !== undefined && (updates.dosing.phDown.minInterval < 1 || updates.dosing.phDown.minInterval > 3600)) {
        warn(MODULE, `Invalid pH Down minimum interval: ${updates.dosing.phDown.minInterval}, must be between 1 and 3600 seconds`);
        updates.dosing.phDown.minInterval = Math.max(1, Math.min(updates.dosing.phDown.minInterval, 3600));
      }
    }
    
    // Validate nutrient dosing - similar structure
    if (updates.dosing.nutrient) {
      if (updates.dosing.nutrient.doseAmount !== undefined && (updates.dosing.nutrient.doseAmount <= 0 || updates.dosing.nutrient.doseAmount > 10)) {
        warn(MODULE, `Invalid nutrient dose amount: ${updates.dosing.nutrient.doseAmount}, must be between 0.1 and 10.0 mL`);
        updates.dosing.nutrient.doseAmount = Math.max(0.1, Math.min(updates.dosing.nutrient.doseAmount, 10.0));
      }
      
      if (updates.dosing.nutrient.flowRate !== undefined && (updates.dosing.nutrient.flowRate <= 0 || updates.dosing.nutrient.flowRate > 5)) {
        warn(MODULE, `Invalid nutrient flow rate: ${updates.dosing.nutrient.flowRate}, must be between 0.1 and 5.0 mL/s`);
        updates.dosing.nutrient.flowRate = Math.max(0.1, Math.min(updates.dosing.nutrient.flowRate, 5.0));
      }
      
      if (updates.dosing.nutrient.minInterval !== undefined && (updates.dosing.nutrient.minInterval < 1 || updates.dosing.nutrient.minInterval > 3600)) {
        warn(MODULE, `Invalid nutrient minimum interval: ${updates.dosing.nutrient.minInterval}, must be between 1 and 3600 seconds`);
        updates.dosing.nutrient.minInterval = Math.max(1, Math.min(updates.dosing.nutrient.minInterval, 3600));
      }
    }
    
    // Validate nutrient pumps if they exist
    if (updates.dosing.nutrientPumps) {
      for (const pumpName in updates.dosing.nutrientPumps) {
        const pump = updates.dosing.nutrientPumps[pumpName];
        
        if (pump.doseAmount !== undefined && (pump.doseAmount <= 0 || pump.doseAmount > 10)) {
          warn(MODULE, `Invalid dose amount for ${pumpName}: ${pump.doseAmount}, must be between 0.1 and 10.0 mL`);
          pump.doseAmount = Math.max(0.1, Math.min(pump.doseAmount, 10.0));
        }
        
        if (pump.flowRate !== undefined && (pump.flowRate <= 0 || pump.flowRate > 5)) {
          warn(MODULE, `Invalid flow rate for ${pumpName}: ${pump.flowRate}, must be between 0.1 and 5.0 mL/s`);
          pump.flowRate = Math.max(0.1, Math.min(pump.flowRate, 5.0));
        }
        
        if (pump.minInterval !== undefined && (pump.minInterval < 1 || pump.minInterval > 3600)) {
          warn(MODULE, `Invalid minimum interval for ${pumpName}: ${pump.minInterval}, must be between 1 and 3600 seconds`);
          pump.minInterval = Math.max(1, Math.min(pump.minInterval, 3600));
        }
        
        if (pump.proportion !== undefined && (pump.proportion < 0 || pump.proportion > 1)) {
          warn(MODULE, `Invalid proportion for ${pumpName}: ${pump.proportion}, must be between 0 and 1`);
          pump.proportion = Math.max(0, Math.min(pump.proportion, 1));
        }
      }
    }
  }
  
  // Deep merge the updates with the current config
  // This ensures nested objects are properly merged
  dosingConfig = deepMerge(dosingConfig, updates);
  
  // Ensure enabled state is explicitly set as specified
  if (updates.enabled !== undefined) {
    dosingConfig.enabled = updates.enabled;
    info(MODULE, `Auto-dosing enabled state set to: ${dosingConfig.enabled}`);
  }
  
  // Check if minimum intervals have changed
  const intervalsChanged = checkForIntervalChanges(updates);
  
  // Save the configuration to disk
  saveDosingConfig();
  
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
      logError(MODULE, "Failed to sync profile pumps when enabling auto-dosing:", err);
    });
    
    // Dynamically import server-init to avoid circular dependencies
    if (typeof window === 'undefined') {
      // Stop any existing monitoring first to ensure a clean restart
      // Use internal monitoring functions instead of removed monitorControl module
      startMonitoring();
      info(MODULE, 'Explicitly enabled monitoring on auto-dosing enable');
    }
  } else if (oldEnabled && !newEnabled) {
    // Auto-dosing was just disabled
    info(MODULE, 'Auto-dosing has been disabled');
    autoDosingExplicitlyDisabled = true;
  }
  
  if (intervalsChanged) {
    info(MODULE, 'Minimum intervals have been updated');
  }
  
  return dosingConfig;
}

// Export getDosingConfig function
export function getDosingConfig(): DosingConfig {
  // Return a deep copy to prevent external mutation
  return JSON.parse(JSON.stringify(dosingConfig));
}

// Global flag to control auto-dosing system state
// We'll immediately initialize it from the config for consistency
let autoDosingEnabled = false;

// Initialize the flag once config is loaded
export function initializeAutoDosingState(): void {
  autoDosingEnabled = dosingConfig?.enabled || false;
  info(MODULE, `Auto-dosing system initialized to ${autoDosingEnabled ? 'ENABLED' : 'DISABLED'} state`);
  
  // If auto-dosing is enabled, start monitoring
  if (autoDosingEnabled && !monitoringInterval) {
    startMonitoring();
  } else if (!autoDosingEnabled && monitoringInterval) {
    stopMonitoring();
  }
  
  debug(MODULE, `Auto-dosing state initialized: enabled=${autoDosingEnabled}, monitoring=${monitoringInterval !== null}`);
}

/**
 * Check if auto-dosing system is enabled
 * This is the single source of truth for the system status
 */
export function isAutoDosingEnabled(): boolean {
  return autoDosingEnabled && dosingConfig?.enabled === true;
}

/**
 * Enable the auto-dosing system
 * This is the single unified function to control the system
 */
export function enableAutoDosing(): DosingConfig {
  info(MODULE, `!!! ENABLING AUTO-DOSING SYSTEM (current state: ${autoDosingEnabled ? 'enabled' : 'disabled'}) !!!`);
  
  // Update both our internal flag and the config
  autoDosingEnabled = true;
  
  // Update the config and return the updated version
  const updatedConfig = updateDosingConfig({ enabled: true });
  
  if (updatedConfig.enabled) {
    info(MODULE, 'Auto-dosing system is now ENABLED');
  } else {
    logError(MODULE, 'Failed to enable auto-dosing system - config update did not take effect');
    // Force the value in case something went wrong
    dosingConfig.enabled = true;
    autoDosingEnabled = true;
    saveDosingConfig();
  }
  
  return dosingConfig;
}

/**
 * Disable the auto-dosing system
 * This is the single unified function to control the system
 */
export function disableAutoDosing(): DosingConfig {
  info(MODULE, `!!! DISABLING AUTO-DOSING SYSTEM (current state: ${autoDosingEnabled ? 'enabled' : 'disabled'}) !!!`);
  
  // Update both our internal flag and the config
  autoDosingEnabled = false;
  
  // Stop monitoring when auto-dosing is disabled
  if (typeof window === 'undefined') {
    stopMonitoring();
    info(MODULE, 'Stopped monitoring on auto-dosing disable');
  }
  
  // Update the config and return the updated version
  const updatedConfig = updateDosingConfig({ enabled: false });
  
  if (!updatedConfig.enabled) {
    info(MODULE, 'Auto-dosing system is now DISABLED');
  } else {
    logError(MODULE, 'Failed to disable auto-dosing system - config update did not take effect');
    // Force the value in case something went wrong
    dosingConfig.enabled = false;
    autoDosingEnabled = false;
    saveDosingConfig();
  }
  
  return dosingConfig;
}

// Monitoring functionality
let monitoringInterval: NodeJS.Timeout | null = null;
const MONITORING_INTERVAL_MS = 10000; // Check every 10 seconds

/**
 * Start the monitoring interval that periodically checks sensor values
 * and triggers dosing as needed
 */
export function startMonitoring() {
  // Don't start if already running
  if (monitoringInterval) {
    debug(MODULE, "Monitoring already active, not starting again");
    return;
  }
  
  info(MODULE, "Starting auto-dosing monitoring");
  
  // Update the global state
  autoDosingEnabled = true;
  autoDosingExplicitlyDisabled = false;
  
  // Create the monitoring interval
  monitoringInterval = setInterval(async () => {
    try {
      await monitoringCycle();
    } catch (err) {
      logError(MODULE, "Error in auto-dosing monitoring cycle:", err);
    }
  }, MONITORING_INTERVAL_MS);
}

/**
 * Stop the monitoring interval
 */
export function stopMonitoring() {
  if (!monitoringInterval) {
    debug(MODULE, "Monitoring already stopped, nothing to do");
    return;
  }
  
  info(MODULE, "Stopping auto-dosing monitoring");
  
  // Clear the interval
  clearInterval(monitoringInterval);
  monitoringInterval = null;
  
  // Update the global state
  autoDosingEnabled = false;
}

/**
 * Run a single monitoring cycle, checking sensor values and
 * performing dosing if needed
 */
async function monitoringCycle() {
  // Skip if auto-dosing is not enabled
  if (!autoDosingEnabled) {
    debug(MODULE, "Auto-dosing not enabled, skipping monitoring cycle");
    return;
  }
  
  // Skip if circuit breaker is open (too many errors)
  if (isCircuitBreakerOpen()) {
    warn(MODULE, "Auto-dosing circuit breaker is open (too many errors), skipping monitoring cycle");
    return;
  }
  
  try {
    // Check for safety delay on startup
    const elapsedSinceStart = Date.now() - serverStartTime;
    if (elapsedSinceStart < STARTUP_SAFETY_DELAY) {
      const remainingSeconds = Math.round((STARTUP_SAFETY_DELAY - elapsedSinceStart) / 1000);
      debug(MODULE, `Startup safety delay in effect, ${remainingSeconds}s remaining before dosing is allowed`);
      return;
    }
    
    // Get latest sensor data
    const sensorData = await getLatestSensorData();
    if (!sensorData) {
      warn(MODULE, "Could not get latest sensor data, skipping monitoring cycle");
      return;
    }
    
    // Process sensor data and perform dosing if needed
    await processAutoDosingCycle(sensorData);
    
  } catch (err) {
    logError(MODULE, "Error in monitoring cycle:", err);
    recordFailure();
  }
}

/**
 * Get the latest sensor data for auto-dosing
 */
async function getLatestSensorData(): Promise<SensorData | null> {
  try {
    // Try to get real sensor readings first
    const readings = await getAllSensorReadings();
    
    // If in simulation mode, override with simulated values
    if (isSimulationEnabled()) {
      return getSimulatedSensorReadings();
    }
    
    return readings;
  } catch (err) {
    logError(MODULE, 'Error getting latest sensor data:', err);
    return null;
  }
}

/**
 * Process a single auto-dosing cycle with the provided sensor data
 */
async function processAutoDosingCycle(sensorData: SensorData): Promise<void> {
  try {
    // Skip if auto-dosing is not enabled
    if (!autoDosingEnabled) {
      debug(MODULE, 'Auto-dosing not enabled, skipping processing cycle');
      return;
    }
    
    // Process each target in order of priority (pH first, then EC)
    // Logic similar to performAutoDosing() but more modular
    
    // Will implement dosing logic here
  } catch (err) {
    logError(MODULE, 'Error processing auto-dosing cycle:', err);
    recordFailure();
  }
}

/**
 * Check if circuit breaker is open (too many errors)
 */
function isCircuitBreakerOpen(): boolean {
  return isCircuitOpen();
}

/**
 * Add a nutrient to the dosing mix with its proportion
 */
function addNutrientToDosagePlan(
  pump: PumpName | string,
  mixProportion: number,
  totalDosage: number
): {
  pumpName: PumpName | string;
  dosage: number;
} {
  return {
    pumpName: pump,
    dosage: mixProportion * totalDosage
  };
}

/**
 * Map profile data from either array or object format to a consistent array output
 * @param profile The profile data that could be in array or object format
 * @param keyField The name of the field to use as the key for object conversion
 * @returns An array of type T
 */
function mapProfileData<T>(profile: any, keyField: string): T[] {
  if (!profile) return [];
  
  // Handle array format
  if (Array.isArray(profile)) {
    return profile as T[];
  }
  
  // Handle object format with key:value pairs
  if (typeof profile === 'object') {
    // Convert to object format to array format for consistency
    return Object.entries(profile).map(([key, value]: [string, any]) => {
      const result = { ...(value as object) } as any;
      result[keyField] = key;
      return result as T;
    });
  }
  
  return [];
}