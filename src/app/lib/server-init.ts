/**
 * NuTetra Server Initialization
 * This file handles all server-side initialization tasks and scheduled jobs
 */

import { initializePumps, loadPumpConfig, cleanupGpio } from './pumps';
import { initializeSimulation } from './simulation';
import { initializeAutoDosing, performAutoDosing } from './autoDosing';

// Track interval IDs for cleanup
const intervals: NodeJS.Timeout[] = [];
let isServerInitialized = false;

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
  if (isServerInitialized) {
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
    
    isServerInitialized = true;
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
  // Schedule auto-dosing checks every 5 minutes
  const autoDoseInterval = setInterval(async () => {
    // Create a task execution with timeout
    try {
      console.log('Running scheduled auto-dosing check...');
      const result = await executeWithTimeout(
        () => performAutoDosing(),
        TASK_TIMEOUT,
        'auto dosing'
      );
      console.log('Auto-dosing result:', result);
    } catch (error) {
      console.error('Error in scheduled auto-dosing:', error);
      // Log error but continue execution, don't let the task crash the server
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  // Add interval to the tracking array
  intervals.push(autoDoseInterval);
  
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
  isServerInitialized = false;
  console.log('Server cleanup completed');
}

// Initialize server when this module is imported
if (typeof window === 'undefined') {
  // Note: Actual initialization now triggered from middleware.ts
  
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