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

/**
 * Initialize the simulation system
 */
export async function initializeSimulation(): Promise<void> {
  try {
    // Ensure the data directory exists
    if (!fs.existsSync(DATA_DIR)) {
      await mkdirAsync(DATA_DIR, { recursive: true });
    }

    // Check if the simulation config file exists
    if (!fs.existsSync(SIMULATION_CONFIG_FILE)) {
      // Create default simulation configuration file
      await writeFileAsync(
        SIMULATION_CONFIG_FILE,
        JSON.stringify(DEFAULT_SIMULATION_CONFIG, null, 2),
        'utf8'
      );
      console.log('Default simulation configuration created');
    } else {
      // Load existing configuration
      const config = await getSimulationConfig();
      
      // Initialize current values from baseline
      currentSimulatedValues = { ...config.baseline };
      console.log('Simulation configuration loaded');
    }
  } catch (error) {
    console.error('Error initializing simulation system:', error);
    throw new Error(`Failed to initialize simulation system: ${error}`);
  }
}

/**
 * Get the current simulation configuration
 */
export async function getSimulationConfig(): Promise<SimulationConfig> {
  try {
    const data = await readFileAsync(SIMULATION_CONFIG_FILE, 'utf8');
    return JSON.parse(data) as SimulationConfig;
  } catch (error) {
    console.error('Error reading simulation config:', error);
    return DEFAULT_SIMULATION_CONFIG;
  }
}

/**
 * Update the simulation configuration
 */
export async function updateSimulationConfig(updates: Partial<SimulationConfig>): Promise<SimulationConfig> {
  try {
    // Get current config
    const currentConfig = await getSimulationConfig();
    
    // Create updated config
    const updatedConfig: SimulationConfig = {
      ...currentConfig,
      ...updates,
      lastUpdated: new Date().toISOString()
    };
    
    // If enabling simulation, reset current values to baseline
    if (updates.enabled === true && !currentConfig.enabled) {
      currentSimulatedValues = { ...updatedConfig.baseline };
    }
    
    // Save updated config
    await writeFileAsync(
      SIMULATION_CONFIG_FILE,
      JSON.stringify(updatedConfig, null, 2),
      'utf8'
    );
    
    return updatedConfig;
  } catch (error) {
    console.error('Error updating simulation config:', error);
    throw new Error(`Failed to update simulation config: ${error}`);
  }
}

/**
 * Get simulated sensor readings that mimic realistic values
 * Uses a combination of baseline values with small random variations
 * and slight drift over time to create realistic water chemistry behavior
 */
export async function getSimulatedSensorReadings(): Promise<SensorData> {
  try {
    // Get current configuration
    const config = await getSimulationConfig();
    
    if (!config.enabled) {
      throw new Error('Simulation mode is not enabled');
    }
    
    // Apply small random variations and drift to current values
    currentSimulatedValues = {
      ph: applyRealisticVariation(
        currentSimulatedValues.ph, 
        config.variation.ph, 
        config.drift.ph,
        5.0, 7.0 // pH realistic range constraints
      ),
      
      ec: applyRealisticVariation(
        currentSimulatedValues.ec, 
        config.variation.ec, 
        config.drift.ec,
        0.8, 2.5 // EC realistic range constraints
      ),
      
      waterTemp: applyRealisticVariation(
        currentSimulatedValues.waterTemp, 
        config.variation.waterTemp, 
        config.drift.waterTemp,
        15.0, 30.0 // Temperature realistic range constraints
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
    throw error;
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
    const config = await getSimulationConfig();
    currentSimulatedValues = { ...config.baseline };
    console.log('Simulation values reset to baseline');
  } catch (error) {
    console.error('Error resetting simulation:', error);
    throw new Error(`Failed to reset simulation: ${error}`);
  }
}

/**
 * Check if simulation mode is enabled
 */
export async function isSimulationEnabled(): Promise<boolean> {
  try {
    const config = await getSimulationConfig();
    return config.enabled;
  } catch (error) {
    console.error('Error checking simulation status:', error);
    return false;
  }
} 