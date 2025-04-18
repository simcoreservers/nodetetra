// Continuous monitoring for auto-dosing
let monitoringInterval: NodeJS.Timeout | null = null;
const MONITORING_FREQUENCY = 1000; // Check every second

export function startContinuousMonitoring() {
  if (monitoringInterval) {
    console.log('Continuous monitoring already active, skipping start');
    return;
  }
  
  console.log('Starting continuous monitoring for auto-dosing');
  enableMonitoring();
  
  monitoringInterval = setInterval(async () => {
    try {
      // Skip processing if monitoring disabled via control flag
      if (!isMonitoringEnabled()) {
        console.log('Monitoring disabled via control flag, skipping auto-dosing check');
        return;
      }
      
      const { getDosingConfig, performAutoDosing } = await import('./autoDosing');
      const config = getDosingConfig();
      
      if (config && config.enabled === true) {
        console.log('Auto-dosing scheduled check - running performAutoDosing()');
        await performAutoDosing();
      } else {
        // If config.enabled is false, ensure monitoring is disabled
        if (config && config.enabled === false) {
          disableMonitoring();
          console.log('Auto-dosing disabled in config, disabling monitoring flag');
        }
        // Use debug level instead of info to reduce noise
        // console.log('Auto-dosing disabled, skipping scheduled check');
      }
    } catch (err) {
      console.error('Auto-dosing monitoring error:', err);
    }
  }, MONITORING_FREQUENCY);
  
  console.log(`Continuous monitoring started with interval of ${MONITORING_FREQUENCY/1000}s`);
}

export function stopContinuousMonitoring() {
  if (monitoringInterval) {
    clearInterval(monitoringInterval);
    monitoringInterval = null;
    // Disable the monitoring flag
    disableMonitoring();
    console.log('Continuous monitoring for auto-dosing stopped');
  } else {
    console.log('No active monitoring to stop');
  }
}
/**
 * NuTetra Server Initialization
 * This file handles all server-side initialization tasks and scheduled jobs
 */

import { initializePumps, loadPumpConfig, cleanupGpio } from './pumps';
import { initializeSimulation } from './simulation';
import { initializeAutoDosing, performAutoDosing } from './autoDosing';
import { enableMonitoring, disableMonitoring, isMonitoringEnabled } from './monitorControl';

// Track interval IDs for cleanup
const intervals: NodeJS.Timeout[] = [];
// Global initialization flag to prevent duplicate initialization
let isSystemInitialized = false;

// Add timeout for task execution
const TASK_TIMEOUT = 60000; // 60 seconds timeout for tasks

/**
 * Execute function with timeout protection
 */
async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  taskName: string
): Promise<T> {
  return new Promise<T>(async (resolve, reject) => {
    // Create timeout error
    const timeoutId = setTimeout(() => {
      reject(new Error(`Task '${taskName}' timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    
    try {
      const result = await fn();
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * Initialize all server-side systems
 */
export async function initializeServer(): Promise<void> {
  if (isSystemInitialized) {
    console.log('Server already initialized. Skipping initialization.');
    return;
  }

  try {
    console.log('Starting server initialization...');
    
    // Initialize the pump system
    try {
      console.log('Initializing pump system...');
      loadPumpConfig();
      await executeWithTimeout(
        () => initializePumps(),
        TASK_TIMEOUT,
        'pump initialization'
      );
      console.log('Pump system initialized successfully');
    } catch (error) {
      console.error('Error initializing pump system:', error);
      // Continue initialization despite pump error
    }
    
    // Initialize the simulation system
    try {
      console.log('Initializing simulation system...');
      await executeWithTimeout(
        () => initializeSimulation(),
        TASK_TIMEOUT,
        'simulation initialization'
      );
      console.log('Simulation system initialized successfully');
    } catch (error) {
      console.error('Error initializing simulation system:', error);
      // Continue initialization despite simulation error
    }
    
    // Initialize the auto-dosing system
    try {
      console.log('Initializing auto-dosing system...');
      initializeAutoDosing();
      console.log('Auto-dosing system initialized successfully');
    } catch (error) {
      console.error('Error initializing auto-dosing system:', error);
      // Continue initialization despite auto-dosing error
    }
    
    // Set up scheduled tasks
    setupScheduledTasks();
    
    isSystemInitialized = true;
    console.log('Server initialization completed successfully');
  } catch (error) {
    console.error('Error during server initialization:', error);
    // Make sure to clean up even if initialization fails
    await cleanupServer();
    throw error;
  }
}

/**
 * Set up scheduled tasks that run at regular intervals
 */
function setupScheduledTasks(): void {
  // We're removing the scheduled auto-dosing check as per user requirement
  // The system will now check for auto-dosing needs when sensors are polled
  
  // Schedule profile pump sync every 15 minutes to keep auto-dosing using the correct pumps
  const profileSyncInterval = setInterval(async () => {
    try {
      console.log('Syncing auto-dosing pumps with active profile...');
      const { syncProfilePumps } = await import('./autoDosing');
      const result = await executeWithTimeout(
        () => syncProfilePumps(),
        TASK_TIMEOUT,
        'profile pump sync'
      );
      if (result) {
        console.log('Successfully synced auto-dosing pumps with active profile');
      } else {
        console.log('No changes needed for auto-dosing pump assignments');
      }
    } catch (error) {
      console.error('Error syncing auto-dosing pumps with profile:', error);
      // Log error but continue execution
    }
  }, 15 * 60 * 1000); // 15 minutes
  
  // Add intervals to the tracking array
  intervals.push(profileSyncInterval);
  
  console.log('Scheduled tasks set up successfully');
}

/**
 * Clean up any resources before server shutdown
 */
export async function cleanupServer(): Promise<void> {
  // Clear all intervals first to prevent new tasks
  intervals.forEach(interval => clearInterval(interval));
  intervals.length = 0; // Clear the array
  console.log('Cleared all scheduled tasks');
  
  // Stop continuous monitoring if running
  stopContinuousMonitoring();
  
  // Clean up hardware resources
  try {
    await executeWithTimeout(
      () => cleanupGpio(),
      TASK_TIMEOUT,
      'GPIO cleanup'
    );
    console.log('GPIO pins cleaned up successfully');
  } catch (error) {
    console.error('Error cleaning up GPIO pins:', error);
  }
  
  // Set initialized flag to false
  isSystemInitialized = false;
  console.log('Server cleanup completed');
}

// Initialize server when this module is imported
if (typeof window === 'undefined') {
  // Note: Actual initialization now triggered from middleware.ts
  
  // Start continuous monitoring on server init if not already started
  import('./autoDosing').then(({ getDosingConfig }) => {
    const config = getDosingConfig();
    if (config && config.enabled === true) {
      startContinuousMonitoring();
    }
  }).catch(err => {
    console.error('Failed to check auto-dosing status on startup:', err);
  });
  
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
  
  // Handle uncaught exceptions to prevent crashes
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught exception:', error);
    try {
      await cleanupServer();
    } catch (cleanupError) {
      console.error('Error during cleanup after uncaught exception:', cleanupError);
    } finally {
      // Exit with error code after cleanup
      process.exit(1);
    }
  });
} 