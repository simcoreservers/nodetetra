/**
 * NuTetra Pump Control API
 * Handles communication with dosing pumps via Raspberry Pi GPIO
 * 
 * This file is designed to run on the server only
 */

import fs from 'fs';
import path from 'path';

// Define data path for persistence
const DATA_PATH = path.join(process.cwd(), 'data');
const PUMP_CONFIG_FILE = path.join(DATA_PATH, 'pump_config.json');

// Mock implementation for client-side use
const isClient = typeof window !== 'undefined';
let mockExec: any;
let execAsync: any;
let Gpio: any = null;
let gpioInstances: Record<number, any> = {};

if (!isClient) {
  // Only import Node.js modules on the server
  const { exec } = require('child_process');
  const { promisify } = require('util');
  execAsync = promisify(exec);
  
  // Try to import onoff for direct GPIO control
  try {
    const onoff = require('onoff');
    Gpio = onoff.Gpio;
    console.log('Successfully loaded onoff library for GPIO control');
  } catch (error) {
    console.error('Failed to load onoff library:', error);
    throw new Error(`Failed to load onoff library: ${error}. Please install it using: npm install onoff`);
  }
} else {
  // Client-side mock implementation
  mockExec = async () => ({ stdout: 'mock output', stderr: '' });
  execAsync = mockExec;
  Gpio = null;
}

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
}

const recentEvents: PumpEvent[] = [];

/**
 * Load saved pump configurations from file
 */
export function loadPumpConfig(): void {
  if (isClient) {
    console.log('[CLIENT] Mock load pump config');
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
    // Continue with default config if load fails
  }
}

/**
 * Save current pump configurations to file
 */
export function savePumpConfig(): void {
  if (isClient) {
    console.log('[CLIENT] Mock save pump config');
    return;
  }

  try {
    // Ensure the data directory exists
    if (!fs.existsSync(DATA_PATH)) {
      fs.mkdirSync(DATA_PATH, { recursive: true });
    }

    // Create a simplified config object with just the persistent fields
    const configToSave: Record<string, any> = {};
    
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
    throw new Error(`Failed to save pump configuration: ${error}`);
  }
}

/**
 * Initialize GPIO pins for pumps
 */
export async function initializePumps(): Promise<void> {
  if (isClient) {
    console.log('[CLIENT] Mock pump initialization');
    return;
  }
  
  try {
    // Load saved configurations first
    loadPumpConfig();

    // For each pump, configure the GPIO pin and set it as output
    for (const [name, pin] of Object.entries(PUMP_GPIO)) {
      try {
        // Configure pin as output using onoff
        gpioInstances[pin] = new Gpio(pin, 'out');
        
        // Initialize as OFF (0)
        gpioInstances[pin].writeSync(0);
        
        console.log(`Initialized pump ${name} on GPIO ${pin} using onoff`);
      } catch (error) {
        console.error(`Error initializing GPIO for pump ${name}:`, error);
        throw new Error(`Failed to initialize GPIO for pump ${name}: ${error}`);
      }
    }
  } catch (error) {
    console.error('Error initializing pumps:', error);
    throw new Error(`Failed to initialize pumps: ${error}`);
  }
}

/**
 * Turn on a specific pump
 * @param pumpName - Name of the pump to activate
 */
export async function activatePump(pumpName: PumpName): Promise<void> {
  if (isClient) {
    console.log(`[CLIENT] Mock activate pump: ${pumpName}`);
    return;
  }
  
  try {
    const pin = PUMP_GPIO[pumpName];
    if (!pin) {
      throw new Error(`Unknown pump: ${pumpName}`);
    }

    // Set GPIO pin high to turn on pump
    try {
      // Get the Gpio instance for this pin
      const gpio = gpioInstances[pin];
      if (!gpio) {
        throw new Error(`GPIO instance for pin ${pin} not found. Has initializePumps() been called?`);
      }
      
      // Write 1 to turn on
      gpio.writeSync(1);
    } catch (error) {
      console.error(`Error writing to GPIO pin ${pin}:`, error);
      throw new Error(`Failed to write to GPIO pin ${pin}: ${error}`);
    }
    
    // Update pump status
    pumpStatus[pumpName].active = true;
    pumpStatus[pumpName].lastActivated = new Date();
    
    // Log event
    const event = {
      time: new Date().toLocaleTimeString(),
      event: `${pumpName} activated`,
      timestamp: new Date()
    };
    recentEvents.unshift(event);
    if (recentEvents.length > 10) recentEvents.pop(); // Keep only 10 most recent events
    
    console.log(`Activated pump: ${pumpName}`);
  } catch (error) {
    console.error(`Error activating pump ${pumpName}:`, error);
    throw new Error(`Failed to activate pump ${pumpName}: ${error}`);
  }
}

/**
 * Turn off a specific pump
 * @param pumpName - Name of the pump to deactivate
 */
export async function deactivatePump(pumpName: PumpName): Promise<void> {
  if (isClient) {
    console.log(`[CLIENT] Mock deactivate pump: ${pumpName}`);
    return;
  }
  
  try {
    const pin = PUMP_GPIO[pumpName];
    if (!pin) {
      throw new Error(`Unknown pump: ${pumpName}`);
    }

    // Set GPIO pin low to turn off pump
    try {
      // Get the Gpio instance for this pin
      const gpio = gpioInstances[pin];
      if (!gpio) {
        throw new Error(`GPIO instance for pin ${pin} not found. Has initializePumps() been called?`);
      }
      
      // Write 0 to turn off
      gpio.writeSync(0);
    } catch (error) {
      console.error(`Error writing to GPIO pin ${pin}:`, error);
      throw new Error(`Failed to write to GPIO pin ${pin}: ${error}`);
    }
    
    // Update pump status
    pumpStatus[pumpName].active = false;
    
    // Log event
    const event = {
      time: new Date().toLocaleTimeString(),
      event: `${pumpName} deactivated`,
      timestamp: new Date()
    };
    recentEvents.unshift(event);
    if (recentEvents.length > 10) recentEvents.pop(); // Keep only 10 most recent events
    
    console.log(`Deactivated pump: ${pumpName}`);
  } catch (error) {
    console.error(`Error deactivating pump ${pumpName}:`, error);
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
    console.log(`[CLIENT] Mock dispense ${amount}mL from pump: ${pumpName}`);
    return;
  }
  
  try {
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
    const event = {
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
    }
    throw new Error(`Failed to dispense from pump ${pumpName}: ${error}`);
  }
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
    const event = {
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
 * Ensure pumps are initialized for development mode
 * This function is useful when running in a development environment
 * where the actual hardware initialization code would not run
 */
export function ensureDevPumpsInitialized(): void {
  if (isClient || process.env.NODE_ENV !== 'development') {
    return; // Only run this in development server-side
  }
  
  console.log('Initializing pumps for development mode');
  
  try {
    // Load saved configurations
    loadPumpConfig();
    console.log('Pump configurations loaded for development');
  } catch (error) {
    console.error('Error initializing development pumps:', error);
  }
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
  
  // Ensure all pumps are turned off and GPIO resources are released
  for (const [pin, gpio] of Object.entries(gpioInstances)) {
    try {
      // Turn off the pump
      gpio.writeSync(0);
      
      // Unexport the GPIO to free resources
      gpio.unexport();
      
      console.log(`Cleaned up GPIO pin ${pin}`);
    } catch (error) {
      console.error(`Error cleaning up GPIO pin ${pin}:`, error);
    }
  }
} 