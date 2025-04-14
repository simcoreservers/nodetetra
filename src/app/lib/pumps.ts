/**
 * NuTetra Pump Control API
 * Handles communication with dosing pumps via Raspberry Pi GPIO
 * 
 * This file is designed to run on the server only
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

// Define type for exec result
interface ExecResult {
  stdout: string;
  stderr: string;
}

// Define data path for persistence
const DATA_PATH = path.join(process.cwd(), 'data');
const PUMP_CONFIG_FILE = path.join(DATA_PATH, 'pump_config.json');
const PUMP_STATE_FILE = path.join(DATA_PATH, 'pump_state.json');

// Check if we're on the client side (browser)
const isClient = typeof window !== 'undefined';
const execAsync = promisify(exec);

// Define GPIO pins for each pump
const PUMP_GPIO = {
  'pH Up': 17,     // GPIO pin for pH Up pump
  'pH Down': 27,   // GPIO pin for pH Down pump
  'Pump 1': 22,    // GPIO pin for nutrient pump 1
  'Pump 2': 23,    // GPIO pin for nutrient pump 2
  'Pump 3': 24,    // GPIO pin for nutrient pump 3
  'Pump 4': 25,    // GPIO pin for nutrient pump 4
};

// Define pump types
export type PumpName = 'pH Up' | 'pH Down' | 'Pump 1' | 'Pump 2' | 'Pump 3' | 'Pump 4';

export interface PumpStatus {
  name: PumpName;
  active: boolean;
  lastActivated?: Date;
  flowRate?: number; // mL per second
  nutrient?: {
    productId: number;
    brandId: number;
    brandName: string;
    productName: string;
    npk: string;
  } | null;
  error?: string; // Store error message if pump has issues
}

// Store current status of pumps
const pumpStatus: Record<PumpName, PumpStatus> = {
  'pH Up': { name: 'pH Up', active: false, nutrient: null },
  'pH Down': { name: 'pH Down', active: false, nutrient: null },
  'Pump 1': { name: 'Pump 1', active: false, nutrient: null },
  'Pump 2': { name: 'Pump 2', active: false, nutrient: null },
  'Pump 3': { name: 'Pump 3', active: false, nutrient: null },
  'Pump 4': { name: 'Pump 4', active: false, nutrient: null },
};

// Store recent pump events
export interface PumpEvent {
  time: string;
  event: string;
  timestamp: Date;
  isError?: boolean;
}

const recentEvents: PumpEvent[] = [];

/**
 * Load saved pump configurations from file
 */
export function loadPumpConfig(): void {
  if (isClient) {
    return;
  }

  try {
    // Ensure the data directory exists
    if (!fs.existsSync(DATA_PATH)) {
      fs.mkdirSync(DATA_PATH, { recursive: true });
    }

    // Check if the pump config file exists, if not create it with default values
    if (!fs.existsSync(PUMP_CONFIG_FILE)) {
      // Save default config to file
      savePumpConfig();
      return;
    }

    // Read the saved configuration
    const rawData = fs.readFileSync(PUMP_CONFIG_FILE, 'utf8');
    const savedConfig = JSON.parse(rawData);

    // Apply saved nutrient assignments to pumps
    for (const pumpName in savedConfig) {
      if (pumpStatus[pumpName as PumpName]) {
        pumpStatus[pumpName as PumpName].nutrient = savedConfig[pumpName].nutrient;
        
        // Also load flow rate if available
        if (savedConfig[pumpName].flowRate) {
          pumpStatus[pumpName as PumpName].flowRate = savedConfig[pumpName].flowRate;
        }
      }
    }

    // Also load pump active states if state file exists
    loadPumpStates();

    console.log('Pump configurations loaded from file');
  } catch (error) {
    console.error('Error loading pump configurations:', error);
    logErrorEvent('Failed to load pump configurations from file');
    throw new Error(`Failed to load pump configuration: ${error}`);
  }
}

/**
 * Load the active state of pumps from file
 */
function loadPumpStates(): void {
  if (isClient) {
    return;
  }

  try {
    // Check if the pump state file exists
    if (!fs.existsSync(PUMP_STATE_FILE)) {
      // No state file, all pumps are assumed to be off
      return;
    }

    // Read the saved states
    const rawData = fs.readFileSync(PUMP_STATE_FILE, 'utf8');
    const savedStates = JSON.parse(rawData);

    // For each pump in the saved states
    for (const pumpName in savedStates) {
      if (pumpStatus[pumpName as PumpName]) {
        // Get the saved state
        const isActive = Boolean(savedStates[pumpName].active);
        
        // If the saved state is active, ensure the pump is actually on
        if (isActive) {
          const pin = PUMP_GPIO[pumpName as PumpName];
          if (pin) {
            try {
              // Set GPIO pin to match saved state (synchronous to ensure state is applied)
              exec(`gpio -g write ${pin} 1`, (error) => {
                if (error) {
                  console.error(`Error reapplying active state to pump ${pumpName}:`, error);
                  pumpStatus[pumpName as PumpName].active = false;
                } else {
                  pumpStatus[pumpName as PumpName].active = true;
                  console.log(`Restored active state for pump ${pumpName}`);
                }
              });
            } catch (error) {
              console.error(`Error reapplying active state to pump ${pumpName}:`, error);
              pumpStatus[pumpName as PumpName].active = false;
            }
          }
        }
      }
    }

    console.log('Pump active states loaded from file');
  } catch (error) {
    console.error('Error loading pump states:', error);
    // Don't throw error, just log it - non-critical
  }
}

/**
 * Save the current active state of pumps to file
 */
function savePumpStates(): void {
  if (isClient) {
    return;
  }

  try {
    // Ensure the data directory exists
    if (!fs.existsSync(DATA_PATH)) {
      fs.mkdirSync(DATA_PATH, { recursive: true });
    }

    // Create a state object with just the active state for each pump
    const statesToSave: Record<string, { active: boolean, lastActivated?: Date }> = {};
    
    for (const [name, status] of Object.entries(pumpStatus)) {
      statesToSave[name] = {
        active: status.active,
        lastActivated: status.lastActivated
      };
    }

    // Write the state object to file
    fs.writeFileSync(PUMP_STATE_FILE, JSON.stringify(statesToSave, null, 2), 'utf8');
    
    console.log('Pump active states saved to file');
  } catch (error) {
    console.error('Error saving pump states:', error);
    // Don't throw error, just log it - non-critical
  }
}

/**
 * Save current pump configurations to file
 */
export function savePumpConfig(): void {
  if (isClient) {
    return;
  }

  try {
    // Ensure the data directory exists
    if (!fs.existsSync(DATA_PATH)) {
      fs.mkdirSync(DATA_PATH, { recursive: true });
    }

    // Create a simplified config object with just the persistent fields
    const configToSave: Record<string, { nutrient: PumpStatus['nutrient'], flowRate?: number }> = {};
    
    for (const [name, status] of Object.entries(pumpStatus)) {
      configToSave[name] = {
        nutrient: status.nutrient,
        flowRate: status.flowRate
      };
    }

    // For better reliability, first write to a temporary file, then rename it
    const tempFile = `${PUMP_CONFIG_FILE}.tmp`;
    
    // Write to the temporary file
    fs.writeFileSync(tempFile, JSON.stringify(configToSave, null, 2), 'utf8');
    
    // Rename the temporary file to the actual config file (atomic operation)
    fs.renameSync(tempFile, PUMP_CONFIG_FILE);
    
    // Optionally force sync the parent directory to ensure changes are flushed to disk
    // This is more reliable but can be slower
    try {
      const dirFd = fs.openSync(DATA_PATH, 'r');
      fs.fsyncSync(dirFd);
      fs.closeSync(dirFd);
    } catch (syncError) {
      console.warn('Could not fsync directory:', syncError);
      // Continue without error - this is just an additional safety measure
    }
    
    console.log('Pump configurations saved to file');
  } catch (error) {
    console.error('Error saving pump configurations:', error);
    logErrorEvent('Failed to save pump configurations to file');
    throw new Error(`Failed to save pump configuration: ${error}`);
  }
}

/**
 * Initialize GPIO pins for pumps
 */
export async function initializePumps(): Promise<void> {
  if (isClient) {
    return;
  }
  
  try {
    // Load saved configurations first
    loadPumpConfig();

    // For each pump, configure the GPIO pin and set it as output
    for (const [name, pin] of Object.entries(PUMP_GPIO)) {
      try {
        // Clear any previous error
        if (pumpStatus[name as PumpName]) {
          delete pumpStatus[name as PumpName].error;
        }
        
        // First check if gpio utility is working
        try {
          const { stdout } = await execAsync('gpio -v');
          console.log('GPIO utility version:', stdout.split('\n')[0]);
        } catch (gpioError) {
          throw new Error(`GPIO utility not available: ${gpioError}. Please install WiringPi/GPIO utility.`);
        }
        
        // Configure pin as output using gpio command
        await execAsync(`gpio -g mode ${pin} out`);
        
        // Initialize as OFF (0)
        await execAsync(`gpio -g write ${pin} 0`);
        
        console.log(`Initialized pump ${name} on GPIO ${pin}`);
      } catch (error) {
        console.error(`Error initializing GPIO for pump ${name}:`, error);
        
        // Set error status for this pump
        if (pumpStatus[name as PumpName]) {
          pumpStatus[name as PumpName].error = `Initialization error: ${error}`;
        }
        
        // Log the error event
        logErrorEvent(`Failed to initialize pump ${name}: ${error}`);
        
        throw new Error(`Failed to initialize GPIO for pump ${name}: ${error}`);
      }
    }
  } catch (error) {
    console.error('Error initializing pumps:', error);
    logErrorEvent('Failed to initialize pump system');
    throw new Error(`Failed to initialize pumps: ${error}`);
  }
}

/**
 * Turn on a specific pump
 * @param pumpName - Name of the pump to activate
 */
export async function activatePump(pumpName: PumpName): Promise<void> {
  if (isClient) {
    return;
  }
  
  try {
    // Check if pump has an error
    if (pumpStatus[pumpName].error) {
      throw new Error(`Cannot activate pump with error: ${pumpStatus[pumpName].error}`);
    }
    
    const pin = PUMP_GPIO[pumpName];
    if (!pin) {
      throw new Error(`Unknown pump: ${pumpName}`);
    }

    // Set GPIO pin high to turn on pump
    try {
      // Use gpio command to set pin high
      await execAsync(`gpio -g write ${pin} 1`);
    } catch (error) {
      console.error(`Error activating pump ${pumpName}:`, error);
      throw new Error(`Failed to activate pump ${pumpName}: ${error}`);
    }
    
    // Update the pump status
    pumpStatus[pumpName].active = true;
    pumpStatus[pumpName].lastActivated = new Date();
    
    // Save the pump states to maintain activation between server restarts
    savePumpStates();
    
    console.log(`Pump ${pumpName} activated`);
    
    // Log the activation event
    recentEvents.unshift({
      time: new Date().toLocaleTimeString(),
      event: `Pump ${pumpName} activated`,
      timestamp: new Date()
    });
    
    // Limit event history to most recent 100 events
    if (recentEvents.length > 100) {
      recentEvents.length = 100;
    }
  } catch (error) {
    console.error(`Error activating pump ${pumpName}:`, error);
    
    // Log the error event
    recentEvents.unshift({
      time: new Date().toLocaleTimeString(),
      event: `Failed to activate pump ${pumpName}: ${error}`,
      timestamp: new Date(),
      isError: true
    });
    
    throw error;
  }
}

/**
 * Turn off a specific pump
 * @param pumpName - Name of the pump to deactivate
 */
export async function deactivatePump(pumpName: PumpName): Promise<void> {
  if (isClient) {
    return;
  }
  
  try {
    const pin = PUMP_GPIO[pumpName];
    if (!pin) {
      throw new Error(`Unknown pump: ${pumpName}`);
    }

    // Set GPIO pin low to turn off pump
    try {
      // Use gpio command to set pin low
      await execAsync(`gpio -g write ${pin} 0`);
    } catch (error) {
      console.error(`Error deactivating pump ${pumpName}:`, error);
      throw new Error(`Failed to deactivate pump ${pumpName}: ${error}`);
    }
    
    // Update the pump status
    pumpStatus[pumpName].active = false;
    
    // Save the pump states to file
    savePumpStates();
    
    console.log(`Pump ${pumpName} deactivated`);
    
    // Log the deactivation event
    recentEvents.unshift({
      time: new Date().toLocaleTimeString(),
      event: `Pump ${pumpName} deactivated`,
      timestamp: new Date()
    });
    
    // Limit event history to most recent 100 events
    if (recentEvents.length > 100) {
      recentEvents.length = 100;
    }
  } catch (error) {
    console.error(`Error deactivating pump ${pumpName}:`, error);
    
    // Log the error event
    recentEvents.unshift({
      time: new Date().toLocaleTimeString(),
      event: `Failed to deactivate pump ${pumpName}: ${error}`,
      timestamp: new Date(),
      isError: true
    });
    
    throw error;
  }
}

/**
 * Dispense a specific amount from a pump
 * @param pumpName The name of the pump to dispense from
 * @param amount The amount in mL to dispense
 * @param flowRate The flow rate in mL per second
 */
export async function dispensePump(pumpName: PumpName, amount: number, flowRate: number): Promise<void> {
  if (isClient) {
    throw new Error('Cannot dispense pump from client-side code');
  }

  // Validate input parameters
  if (!pumpName || !PUMP_GPIO[pumpName]) {
    throw new Error(`Invalid pump name: ${pumpName}`);
  }
  
  if (amount <= 0) {
    throw new Error(`Invalid amount to dispense: ${amount}mL`);
  }
  
  if (flowRate <= 0) {
    throw new Error(`Invalid flow rate: ${flowRate}mL/s`);
  }
  
  // Check if the pump is already active
  if (pumpStatus[pumpName].active) {
    throw new Error(`Pump ${pumpName} is already active`);
  }
  
  // Calculate how long to run the pump based on flow rate
  const runTime = Math.round((amount / flowRate) * 1000); // Convert to milliseconds
  const maxRunTime = 60000; // Maximum 60 seconds as a safety measure
  
  if (runTime > maxRunTime) {
    throw new Error(`Requested dispense time (${runTime}ms) exceeds maximum allowed time (${maxRunTime}ms)`);
  }
  
  // Get the GPIO pin for this pump
  const pin = PUMP_GPIO[pumpName];
  
  try {
    // Log the event
    const event = `Dispensing ${amount}mL from ${pumpName} at ${flowRate}mL/s (${runTime}ms)`;
    recentEvents.unshift({
      time: new Date().toLocaleTimeString(),
      event,
      timestamp: new Date()
    });
    console.log(event);
    
    // Turn on the pump
    await activatePump(pumpName);
    
    // Create a promise that resolves after the run time
    // and a timeout to ensure we eventually resolve
    return new Promise((resolve, reject) => {
      // Safety timeout that's slightly longer than the run time
      const safetyTimeout = setTimeout(() => {
        // If this timeout triggers, something went wrong with the main timer
        console.error(`Safety timeout triggered for ${pumpName}`);
        
        // Attempt to deactivate the pump as a safety measure
        deactivatePump(pumpName)
          .catch(err => console.error(`Error deactivating pump in safety timeout: ${err}`))
          .finally(() => {
            reject(new Error(`Dispense operation timed out for pump ${pumpName}`));
          });
      }, runTime + 5000); // 5 seconds more than the run time
      
      // Set a timeout to turn off the pump after the calculated run time
      const runTimer = setTimeout(async () => {
        clearTimeout(safetyTimeout); // Clear the safety timeout
        
        try {
          await deactivatePump(pumpName);
          resolve();
        } catch (error) {
          reject(error);
        }
      }, runTime);
      
      // Add event listeners to handle unexpected termination
      const cleanup = () => {
        clearTimeout(runTimer);
        clearTimeout(safetyTimeout);
      };
      
      // Attach cleanup to process events for safety
      process.once('SIGINT', cleanup);
      process.once('SIGTERM', cleanup);
      
      // Also handle unhandled promise rejections
      const rejectionHandler = () => {
        cleanup();
        deactivatePump(pumpName).catch(console.error);
      };
      
      // Attach rejection handler
      process.once('unhandledRejection', rejectionHandler);
      
      // Remove event listeners once completed
      const removeListeners = () => {
        process.removeListener('SIGINT', cleanup);
        process.removeListener('SIGTERM', cleanup);
        process.removeListener('unhandledRejection', rejectionHandler);
      };
      
      // Ensure listeners are removed in both success and failure cases
      runTimer.unref(); // Allow the process to exit if this timer is the only thing running
      safetyTimeout.unref(); // Allow the process to exit if this timer is the only thing running
    });
  } catch (error) {
    // Make sure to deactivate the pump if anything goes wrong
    try {
      await deactivatePump(pumpName);
    } catch (deactivateError) {
      console.error(`Error deactivating pump after failure: ${deactivateError}`);
    }
    
    // Re-throw the original error
    throw error;
  }
}

/**
 * Log an error event to the recent events list
 */
function logErrorEvent(message: string): void {
  const event: PumpEvent = {
    time: new Date().toLocaleTimeString(),
    event: `ERROR: ${message}`,
    timestamp: new Date(),
    isError: true
  };
  recentEvents.unshift(event);
  if (recentEvents.length > 10) recentEvents.pop();
}

/**
 * Assign a nutrient product to a pump
 * @param pumpName - Name of the pump
 * @param nutrient - Nutrient data to assign
 */
export function assignNutrientToPump(
  pumpName: PumpName, 
  nutrient: {
    productId: number;
    brandId: number;
    brandName: string;
    productName: string;
    npk: string;
  } | null
): void {
  if (!pumpStatus[pumpName]) {
    throw new Error(`Unknown pump: ${pumpName}`);
  }
  
  // Store previous nutrient value for logging
  const previousNutrient = pumpStatus[pumpName].nutrient;
  
  // Update the pump status
  pumpStatus[pumpName].nutrient = nutrient;
  
  try {
    // Save the updated configuration to file
    savePumpConfig();
    
    // Log event if nutrient is assigned or removed
    const event: PumpEvent = {
      time: new Date().toLocaleTimeString(),
      event: nutrient ? 
        `${nutrient.productName} assigned to ${pumpName}` : 
        `Nutrient removed from ${pumpName}`,
      timestamp: new Date()
    };
    recentEvents.unshift(event);
    if (recentEvents.length > 10) recentEvents.pop();
    
    console.log(`Pump ${pumpName} nutrient assignment updated`, nutrient ? nutrient.productName : 'removed');
  } catch (error) {
    // Revert the change if saving to file fails
    pumpStatus[pumpName].nutrient = previousNutrient;
    console.error(`Failed to save nutrient assignment for ${pumpName}:`, error);
    logErrorEvent(`Failed to assign nutrient to ${pumpName}: ${error}`);
    throw new Error(`Failed to save nutrient assignment: ${error}`);
  }
}

/**
 * Get current status of all pumps
 */
export function getAllPumpStatus(): PumpStatus[] {
  return Object.values(pumpStatus);
}

/**
 * Get current status of a specific pump
 * @param pumpName - Name of the pump to check
 */
export function getPumpStatus(pumpName: PumpName): PumpStatus {
  if (!pumpStatus[pumpName]) {
    throw new Error(`Unknown pump: ${pumpName}`);
  }
  return pumpStatus[pumpName];
}

/**
 * Get recent pump events
 * @param limit - Maximum number of events to return
 */
export function getRecentEvents(limit: number = 10): PumpEvent[] {
  return recentEvents.slice(0, limit);
}

/**
 * Initialize pumps for development mode
 * Now uses the same approach as production mode
 */
export function ensureDevPumpsInitialized(): void {
  if (isClient) {
    return;
  }
  
  console.log('NuTetra development mode using real hardware access (same as production)');
  
  // Just use the standard initialization flow
  try {
    // Load configuration (including pump states)
    loadPumpConfig();
    
    // Initialize pump hardware
    initializePumps().catch(error => {
      console.error('Error initializing pumps in development mode:', error);
    });
  } catch (error) {
    console.warn('Could not load pump configuration in dev mode:', error);
  }
  
  // Initialize pumps using the same method as production
  initializePumps().catch(error => {
    console.error('Error initializing pumps in development mode:', error);
  });
}

/**
 * Cleanup GPIO resources when shutting down the application
 * This should be called when the server is shutting down to release GPIO resources
 */
export async function cleanupGpio(): Promise<void> {
  if (isClient) {
    return;
  }
  
  console.log('Cleaning up GPIO resources...');
  
  // Ensure all pumps are turned off by setting pins low
  const cleanupPromises = Object.entries(PUMP_GPIO).map(async ([name, pin]) => {
    try {
      // Turn off the pump
      await execAsync(`gpio -g write ${pin} 0`);
      console.log(`Cleaned up GPIO pin ${pin}`);
    } catch (error) {
      console.error(`Error cleaning up GPIO pin ${pin}:`, error);
    }
  });
  
  // Wait for all cleanup operations to complete
  await Promise.all(cleanupPromises);
} 