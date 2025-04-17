#!/usr/bin/env node

/**
 * Migration script for the NuTetra dosing system
 * 
 * This script combines the legacy dosing and auto-dosing systems into a unified system
 */

// Set up path
process.env.NODE_PATH = process.cwd();
require('module').Module._initPaths();

const fs = require('fs');
const path = require('path');

// Path constants
const DATA_PATH = path.join(process.cwd(), 'data');
const DOSING_FILE = path.join(DATA_PATH, 'dosing.json');
const AUTODOSING_FILE = path.join(DATA_PATH, 'autodosing.json');
const UNIFIED_FILE = path.join(DATA_PATH, 'dosing-config.json');

// Logging
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function error(message, err) {
  console.error(`[${new Date().toISOString()}] ERROR: ${message}`, err);
}

// Check if files exist
function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}

// Main migration function
async function migrateDosing() {
  try {
    log('Starting dosing system migration');
    
    // Ensure data directory exists
    if (!fileExists(DATA_PATH)) {
      log('Creating data directory');
      fs.mkdirSync(DATA_PATH, { recursive: true });
    }
    
    // Check if already migrated
    if (fileExists(UNIFIED_FILE)) {
      log('Unified dosing config already exists - migration already completed');
      return true;
    }
    
    // Initialize with default values
    const unifiedConfig = {
      version: 1,
      migratedAt: new Date().toISOString(),
      enabled: false, // Force disabled regardless of legacy settings
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
    
    // Load legacy dosing data
    let legacyDosingData = null;
    if (fileExists(DOSING_FILE)) {
      try {
        const fileData = fs.readFileSync(DOSING_FILE, 'utf8');
        legacyDosingData = JSON.parse(fileData);
        log('Legacy dosing data loaded');
        
        // Make a backup
        fs.copyFileSync(DOSING_FILE, `${DOSING_FILE}.bak`);
        log('Created backup of legacy dosing data');
      } catch (err) {
        error('Failed to load legacy dosing data', err);
      }
    } else {
      log('No legacy dosing data found');
    }
    
    // Load auto-dosing data
    let autoDosingData = null;
    if (fileExists(AUTODOSING_FILE)) {
      try {
        const fileData = fs.readFileSync(AUTODOSING_FILE, 'utf8');
        autoDosingData = JSON.parse(fileData);
        log('Auto-dosing data loaded');
        
        // Make a backup
        fs.copyFileSync(AUTODOSING_FILE, `${AUTODOSING_FILE}.bak`);
        log('Created backup of auto-dosing data');
      } catch (err) {
        error('Failed to load auto-dosing data', err);
      }
    } else {
      log('No auto-dosing data found');
    }
    
    // Merge dosing data if available
    if (legacyDosingData) {
      // Update pH targets if they exist
      if (legacyDosingData.settings?.targetPh) {
        unifiedConfig.targets.ph.min = legacyDosingData.settings.targetPh.min;
        unifiedConfig.targets.ph.max = legacyDosingData.settings.targetPh.max;
        unifiedConfig.targets.ph.target = legacyDosingData.settings.targetPh.current;
        unifiedConfig.targets.ph.tolerance = 
          (legacyDosingData.settings.targetPh.max - legacyDosingData.settings.targetPh.min) / 2;
      }
      
      // Update EC targets if they exist
      if (legacyDosingData.settings?.targetEc) {
        unifiedConfig.targets.ec.min = legacyDosingData.settings.targetEc.min;
        unifiedConfig.targets.ec.max = legacyDosingData.settings.targetEc.max;
        unifiedConfig.targets.ec.target = legacyDosingData.settings.targetEc.current;
        unifiedConfig.targets.ec.tolerance = 
          (legacyDosingData.settings.targetEc.max - legacyDosingData.settings.targetEc.min) / 2;
      }
      
      // Process pump limits if they exist
      if (legacyDosingData.settings?.dosingLimits) {
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
      }
      
      // Update schedule if present
      if (legacyDosingData.settings?.dosingSchedule) {
        const modeMap = {
          'Continuous': 'auto',
          'Timed': 'timed',
          'Scheduled': 'timed'
        };
        
        unifiedConfig.schedule.mode = 
          modeMap[legacyDosingData.settings.dosingSchedule] || 'auto';
      }
      
      log('Legacy dosing data merged');
    }
    
    // Merge auto-dosing data if available
    if (autoDosingData) {
      // Always disabled by default, user must explicitly enable
      unifiedConfig.enabled = false;
      
      // Update pH target and tolerance if they exist
      if (autoDosingData.targets?.ph) {
        unifiedConfig.targets.ph.target = autoDosingData.targets.ph.target;
        unifiedConfig.targets.ph.tolerance = autoDosingData.targets.ph.tolerance;
        
        // Recalculate min/max from target and tolerance
        unifiedConfig.targets.ph.min = autoDosingData.targets.ph.target - autoDosingData.targets.ph.tolerance;
        unifiedConfig.targets.ph.max = autoDosingData.targets.ph.target + autoDosingData.targets.ph.tolerance;
      }
      
      // Update EC target and tolerance if they exist
      if (autoDosingData.targets?.ec) {
        unifiedConfig.targets.ec.target = autoDosingData.targets.ec.target;
        unifiedConfig.targets.ec.tolerance = autoDosingData.targets.ec.tolerance;
        
        // Recalculate min/max from target and tolerance
        unifiedConfig.targets.ec.min = autoDosingData.targets.ec.target - autoDosingData.targets.ec.tolerance;
        unifiedConfig.targets.ec.max = autoDosingData.targets.ec.target + autoDosingData.targets.ec.tolerance;
      }
      
      // Process pH pumps if they exist
      if (autoDosingData.dosing?.phUp) {
        unifiedConfig.pumps[autoDosingData.dosing.phUp.pumpName] = {
          limits: unifiedConfig.pumps[autoDosingData.dosing.phUp.pumpName]?.limits || 50,
          flowRate: autoDosingData.dosing.phUp.flowRate,
          doseAmount: autoDosingData.dosing.phUp.doseAmount,
          minInterval: autoDosingData.dosing.phUp.minInterval
        };
      }
      
      if (autoDosingData.dosing?.phDown) {
        unifiedConfig.pumps[autoDosingData.dosing.phDown.pumpName] = {
          limits: unifiedConfig.pumps[autoDosingData.dosing.phDown.pumpName]?.limits || 50,
          flowRate: autoDosingData.dosing.phDown.flowRate,
          doseAmount: autoDosingData.dosing.phDown.doseAmount,
          minInterval: autoDosingData.dosing.phDown.minInterval
        };
      }
      
      // Process nutrient pumps if they exist
      if (autoDosingData.dosing?.nutrientPumps) {
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
      }
      
      // Copy last dose timestamps if they exist
      if (autoDosingData.lastDose) {
        if (autoDosingData.lastDose.phUp) {
          unifiedConfig.lastDose.phUp = typeof autoDosingData.lastDose.phUp === 'string' ?
            autoDosingData.lastDose.phUp :
            new Date(autoDosingData.lastDose.phUp).toISOString();
        }
        
        if (autoDosingData.lastDose.phDown) {
          unifiedConfig.lastDose.phDown = typeof autoDosingData.lastDose.phDown === 'string' ?
            autoDosingData.lastDose.phDown :
            new Date(autoDosingData.lastDose.phDown).toISOString();
        }
        
        // Copy nutrient dose timestamps
        if (autoDosingData.lastDose.nutrientPumps) {
          Object.entries(autoDosingData.lastDose.nutrientPumps).forEach(([pumpName, timestamp]) => {
            if (timestamp) {
              unifiedConfig.lastDose.nutrientPumps[pumpName] = typeof timestamp === 'string' ?
                timestamp : 
                new Date(timestamp).toISOString();
            }
          });
        }
      }
      
      // Copy advanced features if they exist
      if (autoDosingData.pidControllers) {
        unifiedConfig.pidControllers = autoDosingData.pidControllers;
      }
      
      if (autoDosingData.errorHandling) {
        unifiedConfig.errorHandling = autoDosingData.errorHandling;
      }
      
      if (autoDosingData.telemetry) {
        unifiedConfig.telemetry = autoDosingData.telemetry;
      }
      
      // Set intervals for schedule based on pump configurations
      Object.keys(unifiedConfig.pumps).forEach(pumpName => {
        const interval = unifiedConfig.pumps[pumpName].minInterval;
        unifiedConfig.schedule.intervals[pumpName] = interval;
      });
      
      log('Auto-dosing data merged');
    }
    
    // Save the unified configuration
    fs.writeFileSync(UNIFIED_FILE, JSON.stringify(unifiedConfig, null, 2), 'utf8');
    log('Unified dosing configuration saved successfully');
    
    console.log('\n=========================================================');
    console.log('               MIGRATION COMPLETED SUCCESSFULLY');
    console.log('=========================================================');
    console.log('Unified config saved to:', UNIFIED_FILE);
    console.log('\nBackups of the original files have been created at:');
    console.log(`- ${DOSING_FILE}.bak`);
    console.log(`- ${AUTODOSING_FILE}.bak`);
    console.log('\nYou can now use the new unified dosing API at:');
    console.log('- /api/dosing (main API)');
    console.log('- /api/dosing/auto (auto-dosing features)');
    console.log('- /api/dosing/manual (manual dosing)');
    console.log('- /api/dosing/targets (pH/EC targets)');
    console.log('\nThe old endpoints will continue to work but are deprecated:');
    console.log('- /api/autodosing');
    console.log('- /api/dosing/target-ph');
    console.log('- /api/dosing/target-ec');
    console.log('=========================================================\n');
    
    return true;
  } catch (err) {
    error('Migration failed', err);
    console.error('\nMIGRATION FAILED! See error details above.');
    return false;
  }
}

// Run the migration
migrateDosing().catch(err => {
  console.error('Unhandled error during migration:', err);
  process.exit(1);
});
