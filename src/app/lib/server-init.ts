/**
 * NuTetra Server Initialization
 * This file handles all server-side initialization tasks and scheduled jobs
 */

import { initializePumps, loadPumpConfig } from './pumps';
import { initializeSimulation } from './simulation';
import { initializeAutoDosing, performAutoDosing } from './autoDosing';

// Track interval IDs for cleanup
const intervals: NodeJS.Timeout[] = [];

/**
 * Initialize all server-side systems
 */
export async function initializeServer(): Promise<void> {
  try {
    console.log('Starting server initialization...');
    
    // Initialize the pump system
    try {
      console.log('Initializing pump system...');
      loadPumpConfig();
      await initializePumps();
      console.log('Pump system initialized successfully');
    } catch (error) {
      console.error('Error initializing pump system:', error);
      // Continue initialization despite pump error
    }
    
    // Initialize the simulation system
    try {
      console.log('Initializing simulation system...');
      await initializeSimulation();
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
    
    console.log('Server initialization completed successfully');
  } catch (error) {
    console.error('Error during server initialization:', error);
    throw error;
  }
}

/**
 * Set up scheduled tasks that run at regular intervals
 */
function setupScheduledTasks(): void {
  // Schedule auto-dosing checks every 5 minutes
  const autoDoseInterval = setInterval(async () => {
    try {
      console.log('Running scheduled auto-dosing check...');
      const result = await performAutoDosing();
      console.log('Auto-dosing result:', result);
    } catch (error) {
      console.error('Error in scheduled auto-dosing:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  // Add interval to the tracking array
  intervals.push(autoDoseInterval);
  
  console.log('Scheduled tasks set up successfully');
}

/**
 * Clean up any resources before server shutdown
 */
export function cleanupServer(): void {
  // Clear all intervals
  intervals.forEach(interval => clearInterval(interval));
  console.log('Cleared all scheduled tasks');
  
  // Add any other cleanup tasks here
}

// Initialize server when this module is imported
if (typeof window === 'undefined') {
  initializeServer().catch(error => {
    console.error('Failed to initialize server:', error);
  });
  
  // Set up cleanup on process termination
  process.on('SIGINT', () => {
    console.log('Received SIGINT. Cleaning up...');
    cleanupServer();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('Received SIGTERM. Cleaning up...');
    cleanupServer();
    process.exit(0);
  });
} 