// Continuous monitoring for auto-dosing
let monitoringInterval: NodeJS.Timeout | null = null;
const MONITORING_FREQUENCY = 1000; // Check every second for stuck pumps
// Add safety timeout to ensure pumps don't get stuck
const SAFETY_PUMP_TIMEOUT = 30000; // 30 seconds maximum pump operation time

// Timing for dosing checks within the monitoring interval
const DOSING_FREQUENCY = 60 * 1000; // Check dosing needs every 1 minute
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
import * as monitorControl from './monitorControl';
import * as autoDosing from './autoDosing';
import * as pumps from './pumps';

// Helper functions for module imports with timeout
// These use direct string literals for each possible import

// Import monitorControl with timeout
async function importMonitorControl(): Promise<typeof monitorControl> {
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Import of monitorControl timed out after ${MODULE_IMPORT_TIMEOUT}ms`));
    }, MODULE_IMPORT_TIMEOUT);
    
    try {
      const module = await import('./monitorControl');
      clearTimeout(timeoutId);
      resolve(module);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

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
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
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
      const pumpsModule = await importPumps();
      if (typeof pumpsModule.cleanupGpio === 'function') {
        cleanupGPIO = pumpsModule.cleanupGpio;
        return;
      }
      
      // Not using dynamic imports for hardware modules as they're optional
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
  // Only initialize interval if it doesn't already exist
  // Do not clear existing interval as it may have been set by the user
  if (monitoringInterval) {
    console.log('Monitoring interval already exists, not overwriting user settings');
    return;
  }
  
  console.log('Starting continuous monitoring for auto-dosing');
  
  // Set a timeout for module import to prevent hanging
  const importTimeoutId = setTimeout(() => {
    console.error(`Module import timeout occurred during startContinuousMonitoring after ${MODULE_IMPORT_TIMEOUT}ms`);
    // Attempt recovery if import times out
    if (!monitoringInterval) {
      console.log('No interval was started. Import likely failed.');
    }
  }, MODULE_IMPORT_TIMEOUT);
  
  // Import with error handling
  Promise.all([importMonitorControl(), importAutoDosing()])
    .then(([monitorControlModule, autoDosingModule]) => {
      // Clear the timeout since import succeeded
      clearTimeout(importTimeoutId);
      
      // Check current auto-dosing config to set initial monitoring state
      const dosingConfig = autoDosingModule.getDosingConfig();
      
      if (dosingConfig && dosingConfig.enabled === true) {
        // Auto-dosing is enabled, so enable monitoring
        monitorControlModule.enableMonitoring();
        console.log('Auto-dosing enabled in config, enabling monitoring on startup');
      } else {
        // Auto-dosing is disabled, ensure monitoring is also disabled
        monitorControlModule.disableMonitoring();
        console.log('Auto-dosing disabled in config, ensuring monitoring is disabled on startup');
      }
      
      // Initialize the timestamps for dosing check tracking
      lastDosingCheckTime = Date.now();
      lastDosingAttemptTime = Date.now();
      
      // Combined monitoring interval - handles both pump safety and dosing
      monitoringInterval = setInterval(async () => {
        try {
          // Skip all processing if monitoring disabled via control flag
          const monitoringModule = await importMonitorControl();
          if (!monitoringModule.isMonitoringEnabled()) {
            return;
          }
          
          // PART 1: SAFETY MONITORING - Check for stuck pumps (runs every interval)
          try {
            const { getAllPumpStatus, stopPump } = await importPumps();
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
          
          // PART 2: AUTO-DOSING - Check if it's time to perform auto-dosing
          const now = Date.now();
          if (now - lastDosingCheckTime >= DOSING_FREQUENCY) {
            lastDosingCheckTime = now;
            
            try {
              const { getDosingConfig, performAutoDosing } = await importAutoDosing();
              const config = getDosingConfig();
              
              // Ensure monitoring state is synchronized with auto-dosing config
              if (config && config.enabled === true) {
                // If auto-dosing is enabled but monitoring is not, enable it
                if (!monitoringModule.isMonitoringEnabled()) {
                  monitoringModule.enableMonitoring();
                  console.log('Auto-dosing enabled in config, enabling monitoring flag');
                }
              
                // Check if minimum time has passed since last dosing attempt
                const minTimeBetweenDosing = 15 * 1000; // 15 seconds minimum between checks
                
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
              } else if (config && config.enabled === false) {
                // If auto-dosing is disabled but monitoring is enabled, disable it
                if (monitoringModule.isMonitoringEnabled()) {
                  monitoringModule.disableMonitoring();
                  console.log('Auto-dosing disabled in config, disabling monitoring flag');
                }
              }
            } catch (err) {
              console.error('Auto-dosing check error:', err);
            }
          }
        } catch (err) {
          console.error('Monitoring interval error:', err);
        }
      }, MONITORING_FREQUENCY);
      
      // Ensure interval is cleared if process exits
      monitoringInterval.unref?.();
      
      console.log(`Unified monitoring started: safety checks every ${MONITORING_FREQUENCY/1000}s, dosing checks every ${DOSING_FREQUENCY/60000} minute(s)`);
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
  
  monitoringInterval = null;
  
  // Track if interval was successfully cleared
  intervalsCleared = monitoringCleared;
  
  if (!intervalsCleared) {
    console.error('Failed to clear monitoring interval during stopContinuousMonitoring');
  } else {
    console.log('Cleared monitoring interval successfully');
  }
  
  // Ensure monitoring flag is disabled
  importMonitorControl()
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
    const pumpModule = await importPumps();
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
    const { initializeAutoDosing } = await importAutoDosing();
    await initializeAutoDosing();
    
    // 3. Set up the monitoring system, but keep it disabled until explicitly enabled
    console.log('3. Setting up monitoring (will remain disabled)');
    const { disableMonitoring } = await importMonitorControl();
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
      const { getAllPumpStatus, stopPump } = await importPumps();
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
      const monitorControlModule = await importMonitorControl();
      monitorControlModule.disableMonitoring();
    } catch (error) {
      console.error('Error disabling monitoring flag:', error);
    }
    
    // Never auto-start monitoring based on config file - user must explicitly enable
    try {
      const { getDosingConfig, updateDosingConfig } = await importAutoDosing();
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
    importAutoDosing()
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