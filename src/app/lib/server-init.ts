// Continuous monitoring for auto-dosing
let monitoringInterval: NodeJS.Timeout | null = null;
const MONITORING_FREQUENCY = 1000; // Check every second for stuck pumps
// Add safety timeout to ensure pumps don't get stuck
const SAFETY_PUMP_TIMEOUT = 30000; // 30 seconds maximum pump operation time

// Timing for dosing checks within the monitoring interval
const DOSING_FREQUENCY = 1 * 1000; // Check dosing needs every 1 second
// Store last dosing time to prevent too frequent attempts
let lastDosingAttemptTime = 0;
// Store last check time for dosing
let lastDosingCheckTime = 0;

// Track if server initialization is complete
let serverInitialized = false;
// Maximum time to wait for module imports
const MODULE_IMPORT_TIMEOUT = 10000; // 10 seconds

// Flag to track if intervals were properly cleared during shutdown
let intervalsCleared = false;

// Import type for pump status
import type { PumpStatus } from './pumps';

// Static imports for better build-time analysis
import * as autoDosing from './autoDosing';
import * as pumps from './pumps';

// Auto-import the logger
import { info, warn, error } from './logger';
const MODULE = 'server-init';

// Helper functions for module imports with timeout
// Import autoDosing with timeout
async function importAutoDosing(): Promise<typeof autoDosing> {
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Import of autoDosing timed out after ${MODULE_IMPORT_TIMEOUT}ms`));
    }, MODULE_IMPORT_TIMEOUT);
    
    try {
      const module = await import('./autoDosing');
      clearTimeout(timeoutId);
      resolve(module);
    } catch (importError) {
      clearTimeout(timeoutId);
      reject(importError);
    }
  });
}

// Import pumps with timeout
async function importPumps(): Promise<typeof pumps> {
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Import of pumps timed out after ${MODULE_IMPORT_TIMEOUT}ms`));
    }, MODULE_IMPORT_TIMEOUT);
    
    try {
      const module = await import('./pumps');
      clearTimeout(timeoutId);
      resolve(module);
    } catch (importError) {
      clearTimeout(timeoutId);
      reject(importError);
    }
  });
}

// Import the cleanupGPIO function if available
let cleanupGPIO: (() => Promise<void>) | undefined;
// Try to import GPIO cleanup function dynamically when needed
async function tryLoadGPIOCleanup(): Promise<void> {
  if (typeof window === 'undefined' && !cleanupGPIO) {
    try {
      // Try to dynamically import modules that might have GPIO cleanup
      const pumpsModule = await importPumps();
      if (typeof pumpsModule.cleanupGpio === 'function') {
        cleanupGPIO = pumpsModule.cleanupGpio;
        return;
      }
      
      // Not using dynamic imports for hardware modules as they're optional
      warn(MODULE, 'No GPIO cleanup function found - this is expected in development environments');
    } catch (err) {
      error(MODULE, 'Failed to load GPIO cleanup function:', err);
    }
  }
}

// Helper to safely clear intervals with verification
function safeClearInterval(interval: NodeJS.Timeout | null, name: string): boolean {
  if (interval) {
    try {
      clearInterval(interval);
      return true;
    } catch (err) {
      error(MODULE, `Failed to clear ${name} interval:`, err);
      return false;
    }
  }
  return true; // Already null
}

export function startContinuousMonitoring() {
  // Only initialize interval if it doesn't already exist
  // Do not clear existing interval as it may have been set by the user
  if (monitoringInterval) {
    info(MODULE, 'Monitoring interval already exists, not overwriting user settings');
    return;
  }
  
  info(MODULE, 'Starting continuous monitoring for auto-dosing system');
  
  // Set a timeout for module import to prevent hanging
  const importTimeoutId = setTimeout(() => {
    error(MODULE, `Module import timeout occurred during startContinuousMonitoring after ${MODULE_IMPORT_TIMEOUT}ms`);
    // Attempt recovery if import times out
    if (!monitoringInterval) {
      info(MODULE, 'No interval was started. Import likely failed.');
    }
  }, MODULE_IMPORT_TIMEOUT);
  
  // Import with error handling
  Promise.all([importAutoDosing()])
    .then(([autoDosingModule]) => {
      // Clear the timeout since import succeeded
      clearTimeout(importTimeoutId);
      
      // Log current auto-dosing system state
      const dosingConfig = autoDosingModule.getDosingConfig();
      const isEnabled = autoDosingModule.isAutoDosingEnabled();
      info(MODULE, `Starting continuous monitoring with auto-dosing system ${isEnabled ? 'ENABLED' : 'DISABLED'}`);
      
      // Initialize the timestamps for dosing check tracking
      lastDosingCheckTime = Date.now();
      lastDosingAttemptTime = Date.now();
      
      // Combined monitoring interval - handles both pump safety and dosing
      monitoringInterval = setInterval(async () => {
        try {
          // Get current auto-dosing state
          const autoDosingModule = await importAutoDosing();
          
          // Skip processing if auto-dosing system is disabled
          if (!autoDosingModule.isAutoDosingEnabled()) {
            return;
          }
          
          // PART 1: SAFETY MONITORING - Check for stuck pumps (runs every interval)
          try {
            const { getAllPumpStatus, stopPump } = await importPumps();
            const pumpStatus = getAllPumpStatus();
            
            for (const pump of pumpStatus) {
              if (pump.active && pump.activeSince && (Date.now() - pump.activeSince > SAFETY_PUMP_TIMEOUT)) {
                error(MODULE, `Safety timeout: Pump ${pump.name} has been active for more than ${SAFETY_PUMP_TIMEOUT/1000}s, forcing stop`);
                await stopPump(pump.name);
              }
            }
          } catch (err) {
            error(MODULE, 'Error checking for stuck pumps:', err);
          }
          
          // PART 2: AUTO-DOSING - Check if it's time to perform auto-dosing
          const now = Date.now();
          if (now - lastDosingCheckTime >= DOSING_FREQUENCY) {
            lastDosingCheckTime = now;
            
            try {
              // Only perform auto-dosing if the system is enabled
              if (autoDosingModule.isAutoDosingEnabled()) {
                // Check if minimum time has passed since last dosing attempt
                const minTimeBetweenDosing = 15 * 1000; // 15 seconds minimum between checks
                
                if (now - lastDosingAttemptTime >= minTimeBetweenDosing) {
                  info(MODULE, 'Auto-dosing scheduled check - running performAutoDosing()');
                  lastDosingAttemptTime = now;
                  
                  // Perform auto-dosing based on current sensor readings
                  const { performAutoDosing } = await importAutoDosing();
                  const result = await performAutoDosing();
                  
                  // Log action taken
                  info(MODULE, `Auto-dosing result: ${result.action}`, 
                    result.action !== 'none' ? result.details : '');
                } else {
                  info(MODULE, `Skipping dosing check - too soon since last attempt (${Math.round((now - lastDosingAttemptTime)/1000)}s ago)`);
                }
              }
            } catch (err) {
              error(MODULE, 'Auto-dosing check error:', err);
            }
          }
        } catch (err) {
          error(MODULE, 'Monitoring interval error:', err);
        }
      }, MONITORING_FREQUENCY);
      
      // Ensure interval is cleared if process exits
      monitoringInterval.unref?.();
      
      info(MODULE, `Unified auto-dosing system monitoring started: safety checks every ${MONITORING_FREQUENCY/1000}s, dosing checks every ${DOSING_FREQUENCY/60000} minute(s)`);
    })
    .catch(err => {
      // Clear the timeout since import failed
      clearTimeout(importTimeoutId);
      error(MODULE, 'Failed to start continuous monitoring:', err);
    });
}

// Stop continuous monitoring and clean up
export function stopContinuousMonitoring() {
  info(MODULE, 'Stopping continuous monitoring');
  
  const monitoringCleared = safeClearInterval(monitoringInterval, 'monitoring');
  
  monitoringInterval = null;
  
  // Track if interval was successfully cleared
  intervalsCleared = monitoringCleared;
  
  if (!intervalsCleared) {
    error(MODULE, 'Failed to clear monitoring interval during stopContinuousMonitoring');
  } else {
    info(MODULE, 'Cleared monitoring interval successfully');
  }
}

// Initialize server components in the correct order with proper verification
export async function initializeServer(): Promise<boolean> {
  if (serverInitialized) {
    info(MODULE, 'Server already initialized, skipping');
    return true;
  }
  
  info(MODULE, '=== INITIALIZING SERVER COMPONENTS ===');
  
  try {
    // 1. First verify the pump system is operational
    info(MODULE, '1. Verifying pump system');
    const pumpModule = await importPumps();
    const pumpStatus = pumpModule.getAllPumpStatus();
    
    // Stop any active pumps that might be lingering
    const activePumps = pumpStatus.filter((p: PumpStatus) => p.active);
    if (activePumps.length > 0) {
      warn(MODULE, `Found ${activePumps.length} active pumps during initialization, stopping them...`);
      for (const pump of activePumps) {
        await pumpModule.stopPump(pump.name).catch((err: Error) => 
          error(MODULE, `Failed to stop pump ${pump.name}:`, err));
      }
    }
    
    info(MODULE, 'Pump system verification complete');
    
    // 2. Now that pumps are verified, initialize auto-dosing
    info(MODULE, '2. Initializing auto-dosing system');
    const { initializeAutoDosing } = await importAutoDosing();
    await initializeAutoDosing();
    
    // 3. Try to load GPIO cleanup for future use
    await tryLoadGPIOCleanup();
    
    serverInitialized = true;
    info(MODULE, '=== SERVER INITIALIZATION COMPLETE ===');
    return true;
  } catch (err) {
    error(MODULE, 'Server initialization failed:', err);
    // Attempt partial cleanup if initialization fails
    try {
      await cleanupServer();
    } catch (cleanupErr) {
      error(MODULE, 'Failed to clean up after initialization error:', cleanupErr);
    }
    return false;
  }
}

// Clean up server resources properly
export async function cleanupServer(): Promise<void> {
  info(MODULE, 'Cleaning up server resources');
  
  try {
    // First stop the continuous monitoring to prevent more checks
    info(MODULE, 'Stopping continuous monitoring');
    stopContinuousMonitoring();
    
    try {
      // Ensure all pumps are stopped
      const { getAllPumpStatus, stopPump } = await importPumps();
      const pumpStatus = getAllPumpStatus();
      
      // Force stop any active pumps
      const activePumps = pumpStatus.filter((p: PumpStatus) => p.active);
      if (activePumps.length > 0) {
        info(MODULE, `Found ${activePumps.length} active pumps, forcing stop`);
        
        await Promise.all(activePumps.map((pump: PumpStatus) => {
          info(MODULE, `Emergency stopping pump ${pump.name} during cleanup`);
          return stopPump(pump.name);
        }));
      }
      
      // Optionally run hardware-specific cleanup
      if (cleanupGPIO) {
        info(MODULE, 'Running GPIO cleanup');
        await cleanupGPIO();
      }
    } catch (pumpError) {
      error(MODULE, 'Error during server cleanup:', pumpError);
    }
    
    // Never auto-start monitoring based on config file - user must explicitly enable
    try {
      const { getDosingConfig, updateDosingConfig, disableAutoDosing } = await importAutoDosing();
      const config = getDosingConfig();
      
      if (config.enabled === true) {
        info(MODULE, 'Auto-dosing was enabled, disabling on shutdown for safety');
        disableAutoDosing();
      }
    } catch (configError) {
      error(MODULE, 'Failed to clean up after initialization error:', configError);
    }
  } catch (cleanupError) {
    error(MODULE, 'Fatal error during server cleanup:', cleanupError);
  }
}

// Initialize server when this module is imported
if (typeof window === 'undefined') {
  // Note: Actual initialization now triggered from middleware.ts
  
  // Only run the startup safety code during actual server initialization, not when this module
  // is imported just to access monitoring functions
  let isJustImportingForMonitoring = false;
  try {
    // Check stack trace to determine if we're being imported just for monitoring functions
    const stackTrace = new Error().stack || '';
    isJustImportingForMonitoring = stackTrace.includes('autoDosing.ts') && 
                                   stackTrace.includes('updateDosingConfig');
  } catch (err) {
    error(MODULE, 'Error checking import context:', err);
  }
  
  if (!isJustImportingForMonitoring) {
    info(MODULE, 'Server initialization - auto-dosing will be OFF until explicitly enabled by user');
    
    // Safety measure: always ensure auto-dosing is OFF on startup
    importAutoDosing()
      .then(({ getDosingConfig, updateDosingConfig }) => {
        const config = getDosingConfig();
        // Force disable on startup for safety
        if (config && config.enabled === true) {
          info(MODULE, 'SAFETY: Found auto-dosing enabled in config, forcing OFF on startup');
          updateDosingConfig({ enabled: false });
        }
      })
      .catch(err => {
        error(MODULE, 'Failed to check auto-dosing status on startup:', err);
      });
  }
  
  // Set up cleanup on process termination
  process.on('SIGINT', async () => {
    info(MODULE, 'Received SIGINT. Cleaning up...');
    try {
      await cleanupServer();
    } catch (err) {
      error(MODULE, 'Error during cleanup:', err);
    } finally {
      process.exit(0);
    }
  });
  
  // Also clean up on SIGTERM
  process.on('SIGTERM', async () => {
    info(MODULE, 'Received SIGTERM. Cleaning up...');
    try {
      await cleanupServer();
    } catch (err) {
      error(MODULE, 'Error during cleanup:', err);
    } finally {
      process.exit(0);
    }
  });
  
  // Add more signal handlers for unexpected terminations
  process.on('uncaughtException', async (err) => {
    error(MODULE, 'Uncaught Exception:', err);
    info(MODULE, 'Attempting cleanup before exit...');
    try {
      await cleanupServer();
    } catch (cleanupErr) {
      error(MODULE, 'Error during emergency cleanup:', cleanupErr);
    } finally {
      process.exit(1);
    }
  });
} 