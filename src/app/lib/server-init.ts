// Continuous monitoring for auto-dosing
let monitoringInterval: NodeJS.Timeout | null = null;
const MONITORING_FREQUENCY = 1000; // Check every second for stuck pumps
// Add safety timeout to ensure pumps don't get stuck
const SAFETY_PUMP_TIMEOUT = 30000; // 30 seconds maximum pump operation time

// Separate timer for auto-dosing with a more appropriate interval
let dosingInterval: NodeJS.Timeout | null = null;
const DOSING_FREQUENCY = 60 * 1000; // Check dosing needs every 1 minute (changed from 5 minutes)
// Store last dosing time to prevent too frequent attempts
let lastDosingAttemptTime = 0;

// Track if server initialization is complete
let serverInitialized = false;
// Maximum time to wait for module imports
const MODULE_IMPORT_TIMEOUT = 10000; // 10 seconds

// Flag to track if intervals were properly cleared during shutdown
let intervalsCleared = false;

// Import type for pump status
import type { PumpStatus } from './pumps';

// Import with timeout to prevent hanging
async function importWithTimeout(modulePath: string, timeout: number): Promise<any> {
  return new Promise(async (resolve, reject) => {
    // Set a timeout to reject if import takes too long
    const timeoutId = setTimeout(() => {
      reject(new Error(`Import of ${modulePath} timed out after ${timeout}ms`));
    }, timeout);
    
    try {
      // Attempt to import the module
      const module = await import(modulePath);
      clearTimeout(timeoutId);
      resolve(module);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
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
      const pumpsModule = await importWithTimeout('./pumps', MODULE_IMPORT_TIMEOUT);
      if (typeof pumpsModule.cleanupGpio === 'function') {
        cleanupGPIO = pumpsModule.cleanupGpio;
        return;
      }
      
      // Try other possible modules if the first attempt fails
      const hardwareModules = ['./hardware', './gpio', './rpi'];
      for (const module of hardwareModules) {
        try {
          const mod = await importWithTimeout(module, MODULE_IMPORT_TIMEOUT / 2);
          if (typeof mod.cleanupGPIO === 'function') {
            cleanupGPIO = mod.cleanupGPIO;
            return;
          }
        } catch (err) {
          // Ignore import errors and try the next module
        }
      }
      
      console.warn('No GPIO cleanup function found - this is expected in development environments');
    } catch (err) {
      console.error('Failed to load GPIO cleanup function:', err);
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
      console.error(`Failed to clear ${name} interval:`, err);
      return false;
    }
  }
  return true; // Already null
}

export function startContinuousMonitoring() {
  // First ensure any existing intervals are properly cleared
  const monitoringCleared = safeClearInterval(monitoringInterval, 'monitoring');
  const dosingCleared = safeClearInterval(dosingInterval, 'dosing');
  
  if (!monitoringCleared || !dosingCleared) {
    console.error('Failed to clear existing intervals. Attempting to proceed anyway.');
  }
  
  monitoringInterval = null;
  dosingInterval = null;
  intervalsCleared = false;
  
  console.log('Starting continuous monitoring for auto-dosing');
  
  // Set a timeout for module import to prevent hanging
  const importTimeoutId = setTimeout(() => {
    console.error(`Module import timeout occurred during startContinuousMonitoring after ${MODULE_IMPORT_TIMEOUT}ms`);
    // Attempt recovery if import times out
    if (!monitoringInterval && !dosingInterval) {
      console.log('No intervals were started. Import likely failed.');
    }
  }, MODULE_IMPORT_TIMEOUT);
  
  // Import with error handling
  importWithTimeout('./monitorControl', MODULE_IMPORT_TIMEOUT)
    .then(({ enableMonitoring }) => {
      // Clear the timeout since import succeeded
      clearTimeout(importTimeoutId);
      
      enableMonitoring();
      
      // Monitoring interval - runs frequently to check for stuck pumps
      monitoringInterval = setInterval(async () => {
        try {
          // Skip processing if monitoring disabled via control flag
          if (!(await importWithTimeout('./monitorControl', MODULE_IMPORT_TIMEOUT)).isMonitoringEnabled()) {
            return;
          }
          
          // Check for any pumps that might be stuck in "on" state
          try {
            const { getAllPumpStatus, stopPump } = await importWithTimeout('./pumps', MODULE_IMPORT_TIMEOUT);
            const pumpStatus = getAllPumpStatus();
            
            for (const pump of pumpStatus) {
              if (pump.active && pump.activeSince && (Date.now() - pump.activeSince > SAFETY_PUMP_TIMEOUT)) {
                console.error(`Safety timeout: Pump ${pump.name} has been active for more than ${SAFETY_PUMP_TIMEOUT/1000}s, forcing stop`);
                await stopPump(pump.name);
              }
            }
          } catch (err) {
            console.error('Error checking for stuck pumps:', err);
          }
        } catch (err) {
          console.error('Auto-dosing monitoring error:', err);
        }
      }, MONITORING_FREQUENCY);
      
      // Ensure interval is cleared if process exits
      monitoringInterval.unref?.();
      
      // Run performAutoDosing immediately at startup to check if dosing is needed now
      setTimeout(async () => {
        try {
          const monitoringModule = await importWithTimeout('./monitorControl', MODULE_IMPORT_TIMEOUT);
          if (monitoringModule.isMonitoringEnabled()) {
            const { getDosingConfig, performAutoDosing } = await importWithTimeout('./autoDosing', MODULE_IMPORT_TIMEOUT);
            const config = getDosingConfig();
            
            if (config && config.enabled === true) {
              console.log('Initial auto-dosing check on startup');
              await performAutoDosing();
            }
          }
        } catch (err) {
          console.error('Error during initial auto-dosing check:', err);
        }
      }, 5000); // Wait 5 seconds after startup
      
      // Separate interval for actual auto-dosing checks - runs less frequently
      dosingInterval = setInterval(async () => {
        try {
          // Skip processing if monitoring disabled via control flag
          const monitoringModule = await importWithTimeout('./monitorControl', MODULE_IMPORT_TIMEOUT);
          if (!monitoringModule.isMonitoringEnabled()) {
            console.log('Monitoring disabled via control flag, skipping auto-dosing check');
            return;
          }
          
          const { getDosingConfig, performAutoDosing } = await importWithTimeout('./autoDosing', MODULE_IMPORT_TIMEOUT);
          const config = getDosingConfig();
          
          if (config && config.enabled === true) {
            // Check if minimum time has passed since last dosing attempt
            const now = Date.now();
            const minTimeBetweenDosing = 15 * 1000; // 15 seconds minimum between checks (reduced from 60s)
            
            if (now - lastDosingAttemptTime >= minTimeBetweenDosing) {
              console.log('Auto-dosing scheduled check - running performAutoDosing()');
              lastDosingAttemptTime = now;
              
              // Perform auto-dosing based on current sensor readings
              const result = await performAutoDosing();
              
              // Log action taken
              console.log(`Auto-dosing result: ${result.action}`, 
                result.action !== 'none' ? result.details : '');
            } else {
              console.log(`Skipping dosing check - too soon since last attempt (${Math.round((now - lastDosingAttemptTime)/1000)}s ago)`);
            }
          } else {
            // If config.enabled is false, ensure monitoring is disabled
            if (config && config.enabled === false) {
              monitoringModule.disableMonitoring();
              console.log('Auto-dosing disabled in config, disabling monitoring flag');
            }
          }
        } catch (err) {
          console.error('Auto-dosing check error:', err);
        }
      }, DOSING_FREQUENCY);
      
      // Ensure interval is cleared if process exits
      dosingInterval.unref?.();
      
      console.log(`Continuous monitoring started: safety checks every ${MONITORING_FREQUENCY/1000}s, dosing checks every ${DOSING_FREQUENCY/60000} minute(s)`);
    })
    .catch(err => {
      // Clear the timeout since import failed
      clearTimeout(importTimeoutId);
      console.error('Failed to start continuous monitoring:', err);
    });
}

// Stop continuous monitoring and clean up
export function stopContinuousMonitoring() {
  console.log('Stopping continuous monitoring');
  
  const monitoringCleared = safeClearInterval(monitoringInterval, 'monitoring');
  const dosingCleared = safeClearInterval(dosingInterval, 'dosing');
  
  monitoringInterval = null;
  dosingInterval = null;
  
  // Track if intervals were successfully cleared
  intervalsCleared = monitoringCleared && dosingCleared;
  
  if (!intervalsCleared) {
    console.error('Failed to clear some intervals during stopContinuousMonitoring');
  } else {
    console.log('Cleared all monitoring intervals successfully');
  }
  
  // Ensure monitoring flag is disabled
  importWithTimeout('./monitorControl', MODULE_IMPORT_TIMEOUT)
    .then(({ disableMonitoring }) => {
      disableMonitoring();
      console.log('Disabled monitoring flag');
    })
    .catch(err => {
      console.error('Error disabling monitoring flag:', err);
    });
}

// Initialize server components in the correct order with proper verification
export async function initializeServer(): Promise<boolean> {
  if (serverInitialized) {
    console.log('Server already initialized, skipping');
    return true;
  }
  
  console.log('=== INITIALIZING SERVER COMPONENTS ===');
  
  try {
    // 1. First verify the pump system is operational
    console.log('1. Verifying pump system');
    const pumpModule = await importWithTimeout('./pumps', MODULE_IMPORT_TIMEOUT);
    const pumpStatus = pumpModule.getAllPumpStatus();
    
    // Stop any active pumps that might be lingering
    const activePumps = pumpStatus.filter((p: PumpStatus) => p.active);
    if (activePumps.length > 0) {
      console.warn(`Found ${activePumps.length} active pumps during initialization, stopping them...`);
      for (const pump of activePumps) {
        await pumpModule.stopPump(pump.name).catch((err: Error) => 
          console.error(`Failed to stop pump ${pump.name}:`, err));
      }
    }
    
    console.log('Pump system verification complete');
    
    // 2. Now that pumps are verified, initialize auto-dosing
    console.log('2. Initializing auto-dosing system');
    const { initializeAutoDosing } = await importWithTimeout('./autoDosing', MODULE_IMPORT_TIMEOUT);
    await initializeAutoDosing();
    
    // 3. Set up the monitoring system, but keep it disabled until explicitly enabled
    console.log('3. Setting up monitoring (will remain disabled)');
    const { disableMonitoring } = await importWithTimeout('./monitorControl', MODULE_IMPORT_TIMEOUT);
    disableMonitoring(); // Ensure monitoring starts in disabled state
    
    // 4. Try to load GPIO cleanup for future use
    await tryLoadGPIOCleanup();
    
    serverInitialized = true;
    console.log('=== SERVER INITIALIZATION COMPLETE ===');
    return true;
  } catch (err) {
    console.error('Server initialization failed:', err);
    // Attempt partial cleanup if initialization fails
    try {
      await cleanupServer();
    } catch (cleanupErr) {
      console.error('Failed to clean up after initialization error:', cleanupErr);
    }
    return false;
  }
}

// Clean up server resources properly
export async function cleanupServer(): Promise<void> {
  console.log('Cleaning up server resources');
  
  try {
    // First stop the continuous monitoring to prevent more checks
    console.log('Stopping continuous monitoring');
    stopContinuousMonitoring();
    
    try {
      // Ensure all pumps are stopped
      const { getAllPumpStatus, stopPump } = await importWithTimeout('./pumps', MODULE_IMPORT_TIMEOUT);
      const pumpStatus = getAllPumpStatus();
      
      // Force stop any active pumps
      const activePumps = pumpStatus.filter((p: PumpStatus) => p.active);
      if (activePumps.length > 0) {
        console.log(`Found ${activePumps.length} active pumps, forcing stop`);
        
        await Promise.all(activePumps.map((pump: PumpStatus) => {
          console.log(`Emergency stopping pump ${pump.name} during cleanup`);
          return stopPump(pump.name);
        }));
      }
      
      // Optionally run hardware-specific cleanup
      if (cleanupGPIO) {
        console.log('Running GPIO cleanup');
        await cleanupGPIO();
      }
    } catch (error) {
      console.error('Error during server cleanup:', error);
    }
    
    // Ensure monitoring flag is disabled
    try {
      const monitorControlModule = await importWithTimeout('./monitorControl', MODULE_IMPORT_TIMEOUT);
      monitorControlModule.disableMonitoring();
    } catch (error) {
      console.error('Error disabling monitoring flag:', error);
    }
    
    // Never auto-start monitoring based on config file - user must explicitly enable
    try {
      const { getDosingConfig, updateDosingConfig } = await importWithTimeout('./autoDosing', MODULE_IMPORT_TIMEOUT);
      const config = getDosingConfig();
      
      if (config.enabled === true) {
        console.log('Auto-dosing was enabled, disabling on shutdown for safety');
        updateDosingConfig({ enabled: false });
      }
    } catch (error) {
      console.error('Failed to clean up after initialization error:', error);
    }
  } catch (error) {
    console.error('Fatal error during server cleanup:', error);
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
    console.error('Error checking import context:', err);
  }
  
  if (!isJustImportingForMonitoring) {
    console.log('Server initialization - auto-dosing will remain OFF until explicitly enabled by user');
    
    // Never auto-start monitoring based on config file - user must explicitly enable
    importWithTimeout('./autoDosing', MODULE_IMPORT_TIMEOUT)
      .then(({ getDosingConfig, updateDosingConfig }) => {
        const config = getDosingConfig();
        // Force disable on startup if somehow enabled
        if (config && config.enabled === true) {
          console.log('SAFETY: Found auto-dosing enabled in config, forcing OFF on startup');
          updateDosingConfig({ enabled: false });
        }
      })
      .catch(err => {
        console.error('Failed to check auto-dosing status on startup:', err);
      });
  }
  
  // Auto-dosing check now happens on schedule, not just with sensor polls
  
  // Set up cleanup on process termination
  process.on('SIGINT', async () => {
    console.log('Received SIGINT. Cleaning up...');
    try {
      await cleanupServer();
    } catch (error) {
      console.error('Error during cleanup:', error);
    } finally {
      process.exit(0);
    }
  });
  
  // Also clean up on SIGTERM
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Cleaning up...');
    try {
      await cleanupServer();
    } catch (error) {
      console.error('Error during cleanup:', error);
    } finally {
      process.exit(0);
    }
  });
  
  // Add more signal handlers for unexpected terminations
  process.on('uncaughtException', async (err) => {
    console.error('Uncaught Exception:', err);
    console.log('Attempting cleanup before exit...');
    try {
      await cleanupServer();
    } catch (error) {
      console.error('Error during emergency cleanup:', error);
    } finally {
      process.exit(1);
    }
  });
} 