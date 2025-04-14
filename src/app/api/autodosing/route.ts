import { NextRequest, NextResponse } from 'next/server';
import { 
  initializeAutoDosing, 
  updateDosingConfig, 
  getDosingConfig, 
  resetDosingConfig,
  performAutoDosing,
  syncProfilePumps,
  DosingConfig 
} from '../../lib/autoDosing';
import { info, error, debug, trace, warn, LogLevel, setLogLevel } from '../../lib/logger';

// Module name for logging
const MODULE = 'autodosingAPI';

// Set log level - use INFO by default, but can be adjusted via environment variables
// Options: ERROR=0, WARN=1, INFO=2, DEBUG=3, TRACE=4
const envLogLevel = process.env.NUTETRA_LOG_LEVEL;
let logLevel = LogLevel.INFO;

// Set log level from environment if provided
if (envLogLevel !== undefined) {
  const parsedLevel = parseInt(envLogLevel, 10);
  if (!isNaN(parsedLevel) && parsedLevel >= 0 && parsedLevel <= 4) {
    logLevel = parsedLevel;
    info(MODULE, `Setting log level from environment: ${LogLevel[logLevel]}`);
  } else {
    warn(MODULE, `Invalid log level in environment (${envLogLevel}), using default: ${LogLevel[logLevel]}`);
  }
}

setLogLevel(logLevel);

// Initialize auto-dosing when server starts
try {
  info(MODULE, 'Initializing auto-dosing system');
  
  // Notice we don't pass any config parameters here to ensure we use the 
  // configuration loaded from disk, preserving custom minInterval settings
  initializeAutoDosing();
  
  // Log the initialized config for verification
  const config = getDosingConfig();
  info(MODULE, 'Auto-dosing initialized with intervals', {
    phUp: config.dosing.phUp.minInterval,
    phDown: config.dosing.phDown.minInterval,
    nutrientPumps: Object.keys(config.dosing.nutrientPumps).map(name => ({
      name,
      minInterval: config.dosing.nutrientPumps[name].minInterval
    }))
  });
  
} catch (err) {
  error(MODULE, 'Error initializing auto-dosing system', err);
}

/**
 * GET API route for fetching auto-dosing configuration and status
 */
export async function GET(request: NextRequest) {
  try {
    // Get current configuration
    const config = getDosingConfig();
    
    // Get dosing status - import the dosingInProgress variable from autoDosing
    let isDosingInProgress = false;
    try {
      const { dosingInProgress } = require('../../lib/autoDosing');
      isDosingInProgress = dosingInProgress;
    } catch (err) {
      error(MODULE, 'Error checking dosing progress', err);
    }
    
    trace(MODULE, 'GET request completed successfully');
    
    return NextResponse.json({
      config,
      timestamp: new Date().toISOString(),
      isDosingInProgress,
      status: 'ok'
    });
  } catch (err) {
    error(MODULE, 'Error fetching auto-dosing configuration', err);
    
    return NextResponse.json({
      error: `Failed to fetch auto-dosing configuration: ${err instanceof Error ? err.message : String(err)}`,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST endpoint for updating auto-dosing configuration or triggering a dosing cycle
 * 
 * Note: This system only performs auto-dosing when explicitly called via this API.
 * There are no scheduled checks - dosing only happens when triggered by the UI
 * or directly via API calls, ensuring it only uses live sensor readings.
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { action } = data;
    
    if (!action) {
      return NextResponse.json(
        { error: 'Missing required action parameter' },
        { status: 400 }
      );
    }
    
    info(MODULE, `POST request received with action: ${action}`);
    let response: any = {};
    
    // Handle different actions
    switch (action) {
      case 'update':
        // Update auto-dosing configuration
        const { config } = data;
        if (!config) {
          return NextResponse.json(
            { error: 'Missing config parameter for update action' },
            { status: 400 }
          );
        }
        
        debug(MODULE, 'Received update request with config', config);
        
        // Special handling for nutrient pump minInterval updates
        if (config.dosing && config.dosing.nutrientPumps) {
          debug(MODULE, 'Processing nutrient pump updates');
          const nutrientPumps = config.dosing.nutrientPumps;
          
          // Log each pump update
          Object.keys(nutrientPumps).forEach(pumpName => {
            const pumpConfig = nutrientPumps[pumpName];
            trace(MODULE, `Pump ${pumpName} settings`, {
              minInterval: pumpConfig.minInterval, 
              doseAmount: pumpConfig.doseAmount, 
              flowRate: pumpConfig.flowRate
            });
          });
        }
        
        // Update the configuration
        const updatedConfig = updateDosingConfig(config as Partial<DosingConfig>);
        
        // Verify the updates were applied (but only at debug level)
        debug(MODULE, 'Configuration after update', {
          phUp: updatedConfig.dosing.phUp.minInterval,
          phDown: updatedConfig.dosing.phDown.minInterval,
          nutrientPumps: Object.keys(updatedConfig.dosing.nutrientPumps).map(name => ({
            name,
            minInterval: updatedConfig.dosing.nutrientPumps[name].minInterval
          }))
        });
        
        info(MODULE, 'Auto-dosing configuration updated successfully');
        
        response = {
          action: 'update',
          config: updatedConfig,
          success: true
        };
        break;
        
      case 'enable':
        // Enable auto-dosing
        info(MODULE, 'Enabling auto-dosing');
        
        // Store current interval settings before enabling
        const preEnableConfig = getDosingConfig();
        const savedEnableIntervals = {
          phUp: preEnableConfig.dosing.phUp.minInterval,
          phDown: preEnableConfig.dosing.phDown.minInterval,
          nutrientPumps: {} as Record<string, number>
        };
        
        // Save all nutrient pump intervals
        Object.keys(preEnableConfig.dosing.nutrientPumps).forEach(pumpName => {
          savedEnableIntervals.nutrientPumps[pumpName] = preEnableConfig.dosing.nutrientPumps[pumpName].minInterval;
        });
        
        debug(MODULE, 'Saved intervals before enabling auto-dosing', savedEnableIntervals);
        
        // Enable auto-dosing
        const enabledConfig = updateDosingConfig({ enabled: true });
        
        // Check if system is operational immediately to provide feedback
        const postEnableConfig = getDosingConfig();
        
        if (postEnableConfig.enabled) {
          // Apply the saved interval settings
          const restoreIntervals: Partial<DosingConfig> = {
            dosing: {
              phUp: {
                ...postEnableConfig.dosing.phUp,
                minInterval: savedEnableIntervals.phUp
              },
              phDown: {
                ...postEnableConfig.dosing.phDown,
                minInterval: savedEnableIntervals.phDown
              },
              nutrientPumps: {}
            }
          };
          
          // Restore all nutrient pump intervals that still exist
          Object.keys(postEnableConfig.dosing.nutrientPumps).forEach(pumpName => {
            if (pumpName in savedEnableIntervals.nutrientPumps) {
              if (!restoreIntervals.dosing!.nutrientPumps) {
                restoreIntervals.dosing!.nutrientPumps = {};
              }
              
              restoreIntervals.dosing!.nutrientPumps[pumpName] = {
                ...postEnableConfig.dosing.nutrientPumps[pumpName],
                minInterval: savedEnableIntervals.nutrientPumps[pumpName]
              };
            }
          });
          
          // Apply the restored interval settings
          updateDosingConfig(restoreIntervals);
          info(MODULE, 'Auto-dosing enabled and custom interval settings restored');
          
          // Try to get pump status for diagnostics
          let pumpInfo = "Unable to get pump status";
          try {
            const { getAllPumpStatus } = await import('../../lib/pumps');
            const pumps = getAllPumpStatus();
            pumpInfo = JSON.stringify(pumps.map(p => ({ name: p.name, active: p.active })));
            debug(MODULE, 'Auto-dosing enabled with pump status', pumps.map(p => ({ name: p.name, active: p.active })));
          } catch (err) {
            error(MODULE, 'Failed to get pump status for diagnostics', err);
          }
        } else {
          error(MODULE, 'Auto-dosing was not properly enabled');
        }
        
        response = {
          action: 'enable',
          config: getDosingConfig(), // Get the fully updated config
          success: true
        };
        break;
        
      case 'disable':
        // Disable auto-dosing
        info(MODULE, 'Disabling auto-dosing');
        const disabledConfig = updateDosingConfig({ enabled: false });
        response = {
          action: 'disable',
          config: disabledConfig,
          success: true
        };
        break;
        
      case 'reset':
        // Reset auto-dosing configuration to defaults
        info(MODULE, 'Resetting auto-dosing configuration to defaults');
        const resetConfig = resetDosingConfig();
        response = {
          action: 'reset',
          config: resetConfig,
          success: true
        };
        break;
        
      case 'dose':
        // Manually trigger a dosing cycle
        info(MODULE, 'Manually triggering dosing cycle');
        
        // Verify auto-dosing is enabled
        const dosingConfig = getDosingConfig();
        if (!dosingConfig.enabled) {
          return NextResponse.json({
            error: 'Auto-dosing is disabled, enable it first',
            action: 'dose',
            success: false
          }, { status: 400 });
        }
        
        try {
          // Sync with profile to ensure we have the latest pump assignments
          await syncProfilePumps();
          
          // Perform the auto-dosing
          info(MODULE, 'Executing auto-dosing...');
          const result = await performAutoDosing();
          info(MODULE, 'Auto-dosing completed', { action: result.action });
          debug(MODULE, 'Auto-dosing result details', result);
          
          // Include diagnostic info
          let diagnostics = {};
          try {
            const { getAllSensorReadings } = await import('../../lib/sensors');
            const { getAllPumpStatus } = await import('../../lib/pumps');
            
            const readings = await getAllSensorReadings();
            const pumps = getAllPumpStatus();
            
            diagnostics = {
              sensors: readings,
              pumps: pumps.map(p => ({ name: p.name, active: p.active })),
              config: getDosingConfig()
            };
            
            debug(MODULE, 'Auto-dosing diagnostics', diagnostics);
          } catch (err) {
            error(MODULE, 'Failed to get diagnostic info', err);
          }
          
          // Return the result
          response = {
            action: 'dose',
            result,
            diagnostics,
            success: true
          };
        } catch (err) {
          error(MODULE, 'Error performing auto-dosing', err);
          return NextResponse.json({
            error: 'Failed to perform auto-dosing',
            details: err instanceof Error ? err.message : String(err),
            action: 'dose',
            success: false
          }, { status: 500 });
        }
        
        break;
        
      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
    
    return NextResponse.json({
      ...response,
      timestamp: new Date().toISOString()
    });
    
  } catch (err) {
    error(MODULE, 'Error in auto-dosing API', err);
    return NextResponse.json(
      { 
        error: 'Failed to execute auto-dosing action', 
        details: err instanceof Error ? err.message : String(err) 
      },
      { status: 500 }
    );
  }
} 