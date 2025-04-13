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

    console.log('Pump configurations loaded from file');
  } catch (error) {
    console.error('Error loading pump configurations:', error);
    logErrorEvent('Failed to load pump configurations from file');
    throw new Error(`Failed to load pump configuration: ${error}`);
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
      console.error(`Error writing to GPIO pin ${pin}:`, error);
      
      // Set error status for this pump
      pumpStatus[pumpName].error = `GPIO error: ${error}`;
      
      // Log the error event
      logErrorEvent(`Failed to control pump ${pumpName}: ${error}`);
      
      throw new Error(`Failed to write to GPIO pin ${pin}: ${error}`);
    }
    
    // Update pump status
    pumpStatus[pumpName].active = true;
    pumpStatus[pumpName].lastActivated = new Date();
    
    // Log event
    const event: PumpEvent = {
      time: new Date().toLocaleTimeString(),
      event: `${pumpName} activated`,
      timestamp: new Date()
    };
    recentEvents.unshift(event);
    if (recentEvents.length > 10) recentEvents.pop(); // Keep only 10 most recent events
    
    console.log(`Activated pump: ${pumpName}`);
  } catch (error) {
    console.error(`Error activating pump ${pumpName}:`, error);
    
    // Log the error event
    logErrorEvent(`Failed to activate pump ${pumpName}: ${error}`);
    
    throw new Error(`Failed to activate pump ${pumpName}: ${error}`);
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
      console.error(`Error writing to GPIO pin ${pin}:`, error);
      
      // Set error status for this pump
      pumpStatus[pumpName].error = `GPIO error: ${error}`;
      
      // Log the error event
      logErrorEvent(`Failed to control pump ${pumpName}: ${error}`);
      
      throw new Error(`Failed to write to GPIO pin ${pin}: ${error}`);
    }
    
    // Update pump status
    pumpStatus[pumpName].active = false;
    
    // Log event
    const event: PumpEvent = {
      time: new Date().toLocaleTimeString(),
      event: `${pumpName} deactivated`,
      timestamp: new Date()
    };
    recentEvents.unshift(event);
    if (recentEvents.length > 10) recentEvents.pop(); // Keep only 10 most recent events
    
    console.log(`Deactivated pump: ${pumpName}`);
  } catch (error) {
    console.error(`Error deactivating pump ${pumpName}:`, error);
    
    // Log the error event
    logErrorEvent(`Failed to deactivate pump ${pumpName}: ${error}`);
    
    throw new Error(`Failed to deactivate pump ${pumpName}: ${error}`);
  }
}

/**
 * Dispense a specific amount from a pump
 * @param pumpName - Name of the pump to use
 * @param amount - Amount to dispense in mL
 * @param flowRate - Flow rate in mL per second
 */
export async function dispensePump(pumpName: PumpName, amount: number, flowRate: number): Promise<void> {
  if (isClient) {
    return;
  }
  
  try {
    // Check if pump has an error
    if (pumpStatus[pumpName].error) {
      throw new Error(`Cannot dispense from pump with error: ${pumpStatus[pumpName].error}`);
    }
    
    if (amount <= 0) {
      throw new Error('Amount must be greater than 0');
    }
    if (flowRate <= 0) {
      throw new Error('Flow rate must be greater than 0');
    }
    
    // Calculate run time in milliseconds
    const runTimeMs = (amount / flowRate) * 1000;
    
    // Activate pump
    await activatePump(pumpName);
    
    // Wait for the calculated time
    await new Promise(resolve => setTimeout(resolve, runTimeMs));
    
    // Deactivate pump
    await deactivatePump(pumpName);
    
    // Log event
    const event: PumpEvent = {
      time: new Date().toLocaleTimeString(),
      event: `${pumpName} dispensed ${amount}mL`,
      timestamp: new Date()
    };
    recentEvents.unshift(event);
    if (recentEvents.length > 10) recentEvents.pop();
    
    console.log(`Dispensed ${amount}mL from pump ${pumpName}`);
  } catch (error) {
    console.error(`Error dispensing from pump ${pumpName}:`, error);
    
    // Ensure pump is off in case of error
    try {
      await deactivatePump(pumpName);
    } catch (e) {
      console.error('Error during emergency pump shutdown:', e);
      logErrorEvent(`Emergency shutdown failed for pump ${pumpName}: ${e}`);
    }
    
    // Set error status for this pump
    pumpStatus[pumpName].error = `Dispensing error: ${error}`;
    
    // Log the error event
    logErrorEvent(`Failed to dispense from pump ${pumpName}: ${error}`);
    
    throw new Error(`Failed to dispense from pump ${pumpName}: ${error}`);
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
 * Ensure development pumps would error appropriately
 */
export function ensureDevPumpsInitialized(): void {
  if (isClient) {
    return;
  }
  
  console.error('NuTetra is designed to operate with real sensor data only. Development mode is not supported.');
  throw new Error('NuTetra requires real hardware. Development mode is not supported.');
}

/**
 * Cleanup GPIO resources when shutting down the application
 * This should be called when the server is shutting down to release GPIO resources
 */
export function cleanupGpio(): void {
  if (isClient) {
    return;
  }
  
  console.log('Cleaning up GPIO resources...');
  
  // Ensure all pumps are turned off by setting pins low
  for (const [name, pin] of Object.entries(PUMP_GPIO)) {
    try {
      // Turn off the pump
      execAsync(`gpio -g write ${pin} 0`).catch(err => {
        console.error(`Error cleaning up GPIO pin ${pin}:`, err);
      });
      
      console.log(`Cleaned up GPIO pin ${pin}`);
    } catch (error) {
      console.error(`Error cleaning up GPIO pin ${pin}:`, error);
    }
  }
} 