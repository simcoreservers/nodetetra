/**
 * NuTetra Hydroponic Simulation System
 * Provides realistic simulated sensor data for development and testing
 */

import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { SensorData } from './sensors';

const readFileAsync = promisify(fs.readFile);
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);

// Define simulation configuration file path
const DATA_DIR = path.join(process.cwd(), 'data');
const SIMULATION_CONFIG_FILE = path.join(DATA_DIR, 'simulation.json');
const TEMP_CONFIG_FILE = path.join(DATA_DIR, 'simulation.json.tmp');

// File operation timeout in milliseconds (3 seconds)
const FILE_OP_TIMEOUT = 3000;

// Define a helper to add timeout to filesystem operations
async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  return new Promise<T>(async (resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout: ${errorMessage}`));
    }, timeoutMs);
    
    try {
      const result = await operation;
      clearTimeout(timeout);
      resolve(result);
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

// Define simulation configuration interface
export interface SimulationConfig {
  enabled: boolean;
  baseline: {
    ph: number;
    ec: number;
    waterTemp: number;
  };
  variation: {
    ph: number;
    ec: number;
    waterTemp: number;
  };
  drift: {
    ph: number;
    ec: number;
    waterTemp: number;
  };
  lastUpdated: string;
}

// Default simulation configuration
const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  enabled: false,
  baseline: {
    ph: 6.0,
    ec: 1.4,
    waterTemp: 22.0
  },
  variation: {
    ph: 0.05,
    ec: 0.03,
    waterTemp: 0.2
  },
  drift: {
    ph: 0.0004,
    ec: 0.0002,
    waterTemp: 0.001
  },
  lastUpdated: new Date().toISOString()
};

// In-memory cache of current simulated values
let currentSimulatedValues = {
  ph: DEFAULT_SIMULATION_CONFIG.baseline.ph,
  ec: DEFAULT_SIMULATION_CONFIG.baseline.ec,
  waterTemp: DEFAULT_SIMULATION_CONFIG.baseline.waterTemp
};

// In-memory cache of configuration to avoid frequent disk reads
let cachedConfig: SimulationConfig | null = null;
let lastConfigRead = 0;
const CONFIG_CACHE_TTL = 30000; // 30 seconds cache validity

/**
 * Initialize the simulation system
 */
export async function initializeSimulation(): Promise<void> {
  try {
    // Ensure the data directory exists
    try {
      if (!fs.existsSync(DATA_DIR)) {
        await withTimeout(
          mkdirAsync(DATA_DIR, { recursive: true }),
          FILE_OP_TIMEOUT,
          'Creating data directory timed out'
        );
      }
    } catch (error) {
      console.error('Error creating data directory:', error);
      // Continue execution - we'll use in-memory defaults
    }

    // Check if the simulation config file exists
    if (!fs.existsSync(SIMULATION_CONFIG_FILE)) {
      // Create default simulation configuration file
      try {
        await withTimeout(
          writeFileAsync(
            SIMULATION_CONFIG_FILE,
            JSON.stringify(DEFAULT_SIMULATION_CONFIG, null, 2),
            'utf8'
          ),
          FILE_OP_TIMEOUT,
          'Writing default configuration timed out'
        );
        console.log('Default simulation configuration created');
      } catch (error) {
        console.error('Error creating default configuration file:', error);
        // Continue with in-memory defaults
      }
    } else {
      // Load existing configuration with timeout
      try {
        const config = await getSimulationConfig();
        // Initialize current values from baseline
        currentSimulatedValues = { ...config.baseline };
        console.log('Simulation configuration loaded');
      } catch (error) {
        console.error('Error loading existing configuration:', error);
        // Continue with in-memory defaults
      }
    }
    
    // Cache the current config
    cachedConfig = await getSimulationConfig();
    lastConfigRead = Date.now();
  } catch (error) {
    console.error('Error initializing simulation system:', error);
    // Don't throw - use defaults and log error
    console.log('Using default simulation configuration due to initialization error');
  }
}

/**
 * Get the current simulation configuration
 */
export async function getSimulationConfig(): Promise<SimulationConfig> {
  // Check if we have a valid cached config
  const now = Date.now();
  if (cachedConfig && (now - lastConfigRead) < CONFIG_CACHE_TTL) {
    return { ...cachedConfig };
  }
  
  try {
    const data = await withTimeout(
      readFileAsync(SIMULATION_CONFIG_FILE, 'utf8'),
      FILE_OP_TIMEOUT,
      'Reading simulation config timed out'
    );
    
    const config = JSON.parse(data) as SimulationConfig;
    
    // Update cache
    cachedConfig = config;
    lastConfigRead = now;
    
    return config;
  } catch (error) {
    console.error('Error reading simulation config:', error);
    // If we have a previously cached config, return that instead of defaults
    if (cachedConfig) {
      console.log('Using cached simulation config due to file read error');
      return { ...cachedConfig };
    }
    // Otherwise use defaults
    return DEFAULT_SIMULATION_CONFIG;
  }
}

/**
 * Update the simulation configuration
 */
export async function updateSimulationConfig(updates: Partial<SimulationConfig>): Promise<SimulationConfig> {
  try {
    // Get current config
    let currentConfig: SimulationConfig;
    try {
      currentConfig = await getSimulationConfig();
    } catch (error) {
      console.error('Error reading current config, using defaults:', error);
      currentConfig = DEFAULT_SIMULATION_CONFIG;
    }
    
    // Create updated config
    const updatedConfig: SimulationConfig = {
      ...currentConfig,
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    
    // If enabling simulation or updating baseline values, reset current values to match baseline
    if (updates.enabled === true && !currentConfig.enabled || updates.baseline) {
      currentSimulatedValues = { ...updatedConfig.baseline };
      console.log('Reset simulated values to new baseline:', updatedConfig.baseline);
    }
    
    // Ensure directory exists
    if (!fs.existsSync(DATA_DIR)) {
      await withTimeout(
        mkdirAsync(DATA_DIR, { recursive: true }),
        FILE_OP_TIMEOUT,
        'Creating data directory timed out'
      );
    }
    
    // Save to temp file first
    await withTimeout(
      writeFileAsync(
        TEMP_CONFIG_FILE,
        JSON.stringify(updatedConfig, null, 2),
        'utf8'
      ),
      FILE_OP_TIMEOUT,
      'Writing to temp config file timed out'
    );
    
    // Rename temp file to actual file - atomic operation
    fs.renameSync(TEMP_CONFIG_FILE, SIMULATION_CONFIG_FILE);
    
    // Update cache
    cachedConfig = updatedConfig;
    lastConfigRead = Date.now();
    
    return updatedConfig;
  } catch (error) {
    console.error('Error updating simulation config:', error);
    // Log error but don't throw - use current cached config or defaults
    if (cachedConfig) {
      return { ...cachedConfig };
    }
    return DEFAULT_SIMULATION_CONFIG;
  }
}

/**
 * Get simulated sensor readings that mimic realistic values
 * Uses a combination of baseline values with small random variations
 * and slight drift over time to create realistic water chemistry behavior
 */
export async function getSimulatedSensorReadings(): Promise<SensorData> {
  try {
    // Get current configuration - use cached if available
    let config: SimulationConfig;
    try {
      config = await getSimulationConfig();
    } catch (error) {
      console.error('Error getting simulation config, using defaults:', error);
      // Use cached config if available, otherwise defaults
      config = cachedConfig || DEFAULT_SIMULATION_CONFIG;
    }
    
    if (!config.enabled) {
      throw new Error('Simulation mode is not enabled');
    }
    
    // Apply small random variations and drift to current values
    currentSimulatedValues = {
      ph: applyRealisticVariation(
        currentSimulatedValues.ph, 
        config.variation.ph, 
        config.drift.ph,
        0.0, 14.0 // pH full range 0-14 instead of restricted 5-7 range
      ),
      
      ec: applyRealisticVariation(
        currentSimulatedValues.ec, 
        config.variation.ec, 
        config.drift.ec,
        0.0, 5.0 // EC full range 0-5 instead of restricted 0.8-2.5 range
      ),
      
      waterTemp: applyRealisticVariation(
        currentSimulatedValues.waterTemp, 
        config.variation.waterTemp, 
        config.drift.waterTemp,
        0.0, 40.0 // Temperature wider range 0-40 instead of restricted 15-30 range
      )
    };
    
    // Return sensor data with current timestamp
    return {
      ph: parseFloat(currentSimulatedValues.ph.toFixed(2)),
      ec: parseFloat(currentSimulatedValues.ec.toFixed(2)),
      waterTemp: parseFloat(currentSimulatedValues.waterTemp.toFixed(1)),
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error generating simulated readings:', error);
    // Provide fallback values in case of error
    return {
      ph: 6.0,
      ec: 1.4,
      waterTemp: 22.0,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Apply realistic variations to a value while keeping it within constraints
 * @param currentValue The current value to modify
 * @param variation Maximum random variation to apply
 * @param drift Small directional change to simulate trends
 * @param min Minimum allowed value
 * @param max Maximum allowed value
 */
function applyRealisticVariation(
  currentValue: number, 
  variation: number, 
  drift: number,
  min: number, 
  max: number
): number {
  // Generate random variation between -variation and +variation
  const randomVariation = (Math.random() * 2 - 1) * variation;
  
  // Apply random drift direction (±1) if not already set
  const driftDirection = Math.random() > 0.5 ? 1 : -1;
  
  // Calculate new value with variation and drift
  let newValue = currentValue + randomVariation + (drift * driftDirection);
  
  // Ensure value stays within realistic constraints
  newValue = Math.max(min, Math.min(max, newValue));
  
  return newValue;
}

/**
 * Reset simulated values to baseline
 */
export async function resetSimulation(): Promise<void> {
  try {
    // Use cached config if available to avoid file system access
    let config: SimulationConfig;
    if (cachedConfig && (Date.now() - lastConfigRead) < CONFIG_CACHE_TTL) {
      config = cachedConfig;
    } else {
      try {
        config = await getSimulationConfig();
      } catch (error) {
        console.error('Error reading config for reset, using defaults:', error);
        config = DEFAULT_SIMULATION_CONFIG;
      }
    }
    
    // Reset current simulated values to match baseline
    currentSimulatedValues = { ...config.baseline };
    
    // This is important to force the system to use these values immediately
    // rather than allowing drift to continue from previous values
    await updateSimulationConfig({
      enabled: config.enabled // Keep current enabled state
    });
    
    console.log('Simulation values reset to baseline');
  } catch (error) {
    console.error('Error resetting simulation:', error);
    // Don't throw, just log error
  }
}

/**
 * Check if simulation mode is enabled
 */
export async function isSimulationEnabled(): Promise<boolean> {
  try {
    // Use cached config if available
    if (cachedConfig && (Date.now() - lastConfigRead) < CONFIG_CACHE_TTL) {
      return cachedConfig.enabled;
    }
    
    const config = await getSimulationConfig();
    return config.enabled;
  } catch (error) {
    console.error('Error checking if simulation is enabled:', error);
    // Default to false if there's an error
    return false;
  }
} 