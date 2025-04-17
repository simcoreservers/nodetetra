/**
 * Migration utility for combining legacy dosing and auto-dosing systems
 */

import fs from 'fs/promises';
import path from 'path';
import { DosingConfig } from './autoDosing';
import { info, error, debug } from './logger';

const MODULE = 'dosingMigration';

// Singleton control
let migrationInProgress = false;
let migrationCompleted = false;

// Path constants
const DATA_PATH = path.join(process.cwd(), 'data');
const DOSING_FILE = path.join(DATA_PATH, 'dosing.json');
const AUTODOSING_FILE = path.join(DATA_PATH, 'autodosing.json');
const UNIFIED_FILE = path.join(DATA_PATH, 'dosing-config.json');

interface LegacyDosingData {
  settings: {
    targetPh: {
      min: number;
      max: number;
      current: number;
    };
    targetEc: {
      min: number;
      max: number;
      current: number;
    };
    dosingLimits: Record<string, number>;
    dosingSchedule?: string;
    timestamp: string;
  };
  history: any[];
  timestamp?: string;
}

interface UnifiedDosingConfig {
  version: number;
  migratedAt: string;
  enabled: boolean;
  targets: {
    ph: {
      min: number;
      max: number;
      target: number;
      tolerance: number;
    };
    ec: {
      min: number;
      max: number;
      target: number;
      tolerance: number;
    };
  };
  pumps: Record<string, {
    limits: number;
    flowRate: number;
    doseAmount: number;
    minInterval: number;
    nutrientType?: string;
    proportion?: number;
  }>;
  schedule: {
    mode: 'auto' | 'manual' | 'timed';
    intervals: Record<string, number>;
  };
  lastDose: {
    phUp: string | null;
    phDown: string | null;
    nutrientPumps: Record<string, string | null>;
  };
  // Maintain PID controllers and other advanced features
  pidControllers?: {
    ph: any;
    ec: any;
  };
  errorHandling?: any;
  telemetry?: any;
}

/**
 * Migrate dosing data from legacy formats to unified format
 */
export async function migrateDosing(): Promise<boolean> {
  // Skip if already completed or in progress
  if (migrationCompleted) return true;
  if (migrationInProgress) return true;
  
  migrationInProgress = true;
  try {
    info(MODULE, 'Starting dosing system migration');
    
    // Ensure data directory exists
    try {
      await fs.access(DATA_PATH);
    } catch {
      await fs.mkdir(DATA_PATH, { recursive: true });
    }
    
    // Check if already migrated
    try {
      await fs.access(UNIFIED_FILE);
      debug(MODULE, 'Unified dosing config already exists');
      return true; // Already migrated
    } catch {
      // Not migrated yet, continue
    }
    
    // Initialize with default values
    const unifiedConfig: UnifiedDosingConfig = {
      version: 1,
      migratedAt: new Date().toISOString(),
      enabled: false, // Always disabled by default
      targets: {
        ph: {
          min: 5.8,
          max: 6.2,
          target: 6.0,
          tolerance: 0.2
        },
        ec: {
          min: 1.2,
          max: 1.6,
          target: 1.4,
          tolerance: 0.1
        }
      },
      pumps: {},
      schedule: {
        mode: 'auto',
        intervals: {}
      },
      lastDose: {
        phUp: null,
        phDown: null,
        nutrientPumps: {}
      }
    };
    
    // Attempt to load legacy dosing data
    let legacyDosingData: LegacyDosingData | null = null;
    try {
      const fileData = await fs.readFile(DOSING_FILE, 'utf8');
      legacyDosingData = JSON.parse(fileData);
      info(MODULE, 'Legacy dosing data loaded');
    } catch {
      debug(MODULE, 'No legacy dosing data found');
    }
    
    // Attempt to load auto-dosing data
    let autoDosingData: DosingConfig | null = null;
    try {
      const fileData = await fs.readFile(AUTODOSING_FILE, 'utf8');
      autoDosingData = JSON.parse(fileData);
      info(MODULE, 'Auto-dosing data loaded');
    } catch {
      debug(MODULE, 'No auto-dosing data found');
    }
    
    // Merge dosing data if available
    if (legacyDosingData) {
      // Update pH targets
      unifiedConfig.targets.ph.min = legacyDosingData.settings.targetPh.min;
      unifiedConfig.targets.ph.max = legacyDosingData.settings.targetPh.max;
      unifiedConfig.targets.ph.target = legacyDosingData.settings.targetPh.current;
      unifiedConfig.targets.ph.tolerance = 
        (legacyDosingData.settings.targetPh.max - legacyDosingData.settings.targetPh.min) / 2;
      
      // Update EC targets
      unifiedConfig.targets.ec.min = legacyDosingData.settings.targetEc.min;
      unifiedConfig.targets.ec.max = legacyDosingData.settings.targetEc.max;
      unifiedConfig.targets.ec.target = legacyDosingData.settings.targetEc.current;
      unifiedConfig.targets.ec.tolerance = 
        (legacyDosingData.settings.targetEc.max - legacyDosingData.settings.targetEc.min) / 2;
      
      // Process pump limits
      Object.entries(legacyDosingData.settings.dosingLimits).forEach(([pumpName, limit]) => {
        // Initialize pump if not exists
        if (!unifiedConfig.pumps[pumpName]) {
          unifiedConfig.pumps[pumpName] = {
            limits: 0,
            flowRate: 1.0,
            doseAmount: 0.5,
            minInterval: 120
          };
        }
        
        // Update limit
        unifiedConfig.pumps[pumpName].limits = limit;
      });
      
      // Update schedule if present
      if (legacyDosingData.settings.dosingSchedule) {
        const modeMap: Record<string, 'auto' | 'manual' | 'timed'> = {
          'Continuous': 'auto',
          'Timed': 'timed',
          'Scheduled': 'timed'
        };
        
        unifiedConfig.schedule.mode = 
          modeMap[legacyDosingData.settings.dosingSchedule] || 'auto';
      }
      
      info(MODULE, 'Legacy dosing data merged');
    }
    
    // Merge auto-dosing data if available
    if (autoDosingData) {
      // Always start disabled regardless of previous setting
      unifiedConfig.enabled = false;
      
      // Update pH target and tolerance
      unifiedConfig.targets.ph.target = autoDosingData.targets.ph.target;
      unifiedConfig.targets.ph.tolerance = autoDosingData.targets.ph.tolerance;
      
      // Recalculate min/max from target and tolerance
      unifiedConfig.targets.ph.min = autoDosingData.targets.ph.target - autoDosingData.targets.ph.tolerance;
      unifiedConfig.targets.ph.max = autoDosingData.targets.ph.target + autoDosingData.targets.ph.tolerance;
      
      // Update EC target and tolerance
      unifiedConfig.targets.ec.target = autoDosingData.targets.ec.target;
      unifiedConfig.targets.ec.tolerance = autoDosingData.targets.ec.tolerance;
      
      // Recalculate min/max from target and tolerance
      unifiedConfig.targets.ec.min = autoDosingData.targets.ec.target - autoDosingData.targets.ec.tolerance;
      unifiedConfig.targets.ec.max = autoDosingData.targets.ec.target + autoDosingData.targets.ec.tolerance;
      
      // Process pH pumps
      unifiedConfig.pumps[autoDosingData.dosing.phUp.pumpName] = {
        limits: unifiedConfig.pumps[autoDosingData.dosing.phUp.pumpName]?.limits || 50,
        flowRate: autoDosingData.dosing.phUp.flowRate,
        doseAmount: autoDosingData.dosing.phUp.doseAmount,
        minInterval: autoDosingData.dosing.phUp.minInterval
      };
      
      unifiedConfig.pumps[autoDosingData.dosing.phDown.pumpName] = {
        limits: unifiedConfig.pumps[autoDosingData.dosing.phDown.pumpName]?.limits || 50,
        flowRate: autoDosingData.dosing.phDown.flowRate,
        doseAmount: autoDosingData.dosing.phDown.doseAmount,
        minInterval: autoDosingData.dosing.phDown.minInterval
      };
      
      // Process nutrient pumps
      Object.entries(autoDosingData.dosing.nutrientPumps).forEach(([pumpName, settings]) => {
        unifiedConfig.pumps[pumpName] = {
          limits: unifiedConfig.pumps[pumpName]?.limits || 100,
          flowRate: settings.flowRate,
          doseAmount: settings.doseAmount,
          minInterval: settings.minInterval,
          nutrientType: settings.nutrientType,
          proportion: settings.proportion
        };
      });
      
      // Copy last dose timestamps
      unifiedConfig.lastDose.phUp = autoDosingData.lastDose.phUp ? 
        new Date(autoDosingData.lastDose.phUp).toISOString() : null;
      
      unifiedConfig.lastDose.phDown = autoDosingData.lastDose.phDown ? 
        new Date(autoDosingData.lastDose.phDown).toISOString() : null;
      
      // Copy nutrient dose timestamps
      Object.entries(autoDosingData.lastDose.nutrientPumps).forEach(([pumpName, timestamp]) => {
        unifiedConfig.lastDose.nutrientPumps[pumpName] = timestamp ? 
          new Date(timestamp).toISOString() : null;
      });
      
      // Copy advanced features
      if (autoDosingData.pidControllers) {
        unifiedConfig.pidControllers = autoDosingData.pidControllers;
      }
      
      if (autoDosingData.errorHandling) {
        unifiedConfig.errorHandling = autoDosingData.errorHandling;
      }
      
      if (autoDosingData.telemetry) {
        unifiedConfig.telemetry = autoDosingData.telemetry;
      }
      
      // Set intervals for schedule
      Object.keys(unifiedConfig.pumps).forEach(pumpName => {
        const interval = unifiedConfig.pumps[pumpName].minInterval;
        unifiedConfig.schedule.intervals[pumpName] = interval;
      });
      
      info(MODULE, 'Auto-dosing data merged');
    }
    
    // Save the unified configuration
    await fs.writeFile(UNIFIED_FILE, JSON.stringify(unifiedConfig, null, 2), 'utf8');
    info(MODULE, 'Unified dosing configuration saved successfully');
    
    migrationCompleted = true;
    return true;
  } catch (err) {
    error(MODULE, 'Migration failed', err);
    migrationInProgress = false;
    return false;
  }
}

/**
 * Get the unified dosing configuration
 */
export async function getUnifiedDosingConfig(): Promise<UnifiedDosingConfig | null> {
  try {
    // Ensure migration has run
    await migrateDosing();
    
    // Read the unified config
    const fileData = await fs.readFile(UNIFIED_FILE, 'utf8');
    return JSON.parse(fileData);
  } catch (err) {
    error(MODULE, 'Failed to get unified config', err);
    return null;
  }
}

/**
 * Save the unified dosing configuration
 */
export async function saveUnifiedDosingConfig(config: UnifiedDosingConfig): Promise<boolean> {
  try {
    // Ensure data directory exists
    try {
      await fs.access(DATA_PATH);
    } catch {
      await fs.mkdir(DATA_PATH, { recursive: true });
    }
    
    // Write the config
    await fs.writeFile(UNIFIED_FILE, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    error(MODULE, 'Failed to save unified config', err);
    return false;
  }
}
