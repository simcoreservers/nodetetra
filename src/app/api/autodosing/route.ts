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

// Initialize auto-dosing when server starts
try {
  console.log('Initializing auto-dosing system');
  
  // Notice we don't pass any config parameters here to ensure we use the 
  // configuration loaded from disk, preserving custom minInterval settings
  initializeAutoDosing();
  
  // Log the initialized config for verification
  const config = getDosingConfig();
  console.log('Auto-dosing initialized with intervals:', JSON.stringify({
    phUp: config.dosing.phUp.minInterval,
    phDown: config.dosing.phDown.minInterval,
    nutrientPumps: Object.keys(config.dosing.nutrientPumps).map(name => ({
      name,
      minInterval: config.dosing.nutrientPumps[name].minInterval
    }))
  }, null, 2));
  
} catch (error) {
  console.error('Error initializing auto-dosing system:', error);
}

/**
 * GET API route for fetching auto-dosing configuration and status
 */
export async function GET(request: NextRequest) {
  try {
    // Get current configuration
    const config = getDosingConfig();
    
    return NextResponse.json({
      config,
      timestamp: new Date().toISOString(),
      status: 'ok'
    });
  } catch (error) {
    console.error('Error fetching auto-dosing configuration:', error);
    
    return NextResponse.json({
      error: `Failed to fetch auto-dosing configuration: ${error instanceof Error ? error.message : String(error)}`,
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
        
        console.log('Received update request with config:', JSON.stringify(config, null, 2));
        
        // Special handling for nutrient pump minInterval updates
        if (config.dosing && config.dosing.nutrientPumps) {
          console.log('Processing nutrient pump updates:');
          const nutrientPumps = config.dosing.nutrientPumps;
          
          // Log each pump update
          Object.keys(nutrientPumps).forEach(pumpName => {
            const pumpConfig = nutrientPumps[pumpName];
            console.log(`  - Pump ${pumpName}: minInterval = ${pumpConfig.minInterval}, doseAmount = ${pumpConfig.doseAmount}, flowRate = ${pumpConfig.flowRate}`);
          });
        }
        
        // Update the configuration
        const updatedConfig = updateDosingConfig(config as Partial<DosingConfig>);
        
        // Verify the updates were applied
        console.log('Configuration after update:');
        console.log(`  - pH Up minInterval: ${updatedConfig.dosing.phUp.minInterval}`);
        console.log(`  - pH Down minInterval: ${updatedConfig.dosing.phDown.minInterval}`);
        
        // Verify nutrient pump updates
        if (updatedConfig.dosing.nutrientPumps) {
          console.log('  - Nutrient pump intervals:');
          Object.keys(updatedConfig.dosing.nutrientPumps).forEach(pumpName => {
            console.log(`    * ${pumpName}: ${updatedConfig.dosing.nutrientPumps[pumpName].minInterval}`);
          });
        }
        
        response = {
          action: 'update',
          config: updatedConfig,
          success: true
        };
        break;
        
      case 'enable':
        // Enable auto-dosing
        console.log('Enabling auto-dosing with configuration:', getDosingConfig());
        
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
        
        console.log('Saved intervals before enabling auto-dosing:', JSON.stringify(savedEnableIntervals, null, 2));
        
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
          console.log('Restored custom interval settings after enabling auto-dosing');
          
          // Try to get pump status for diagnostics
          let pumpInfo = "Unable to get pump status";
          try {
            const { getAllPumpStatus } = await import('../../lib/pumps');
            const pumps = getAllPumpStatus();
            pumpInfo = JSON.stringify(pumps.map(p => ({ name: p.name, active: p.active })));
          } catch (err) {
            console.error('Failed to get pump status for diagnostics:', err);
          }
          
          console.log('Auto-dosing enabled successfully with pumps:', pumpInfo);
        } else {
          console.warn('Auto-dosing was not properly enabled');
        }
        
        response = {
          action: 'enable',
          config: getDosingConfig(), // Get the fully updated config
          success: true
        };
        break;
        
      case 'disable':
        // Disable auto-dosing
        const disabledConfig = updateDosingConfig({ enabled: false });
        response = {
          action: 'disable',
          config: disabledConfig,
          success: true
        };
        break;
        
      case 'reset':
        // Reset auto-dosing configuration to defaults
        const resetConfig = resetDosingConfig();
        response = {
          action: 'reset',
          config: resetConfig,
          success: true
        };
        break;
        
      case 'dose':
        // Manually trigger a dosing cycle
        console.log('Manually triggering dosing cycle...');
        
        // Store current interval settings before sync
        const preDosingConfig = getDosingConfig();
        const savedIntervals = {
          phUp: preDosingConfig.dosing.phUp.minInterval,
          phDown: preDosingConfig.dosing.phDown.minInterval,
          nutrientPumps: {} as Record<string, number>
        };
        
        // Save all nutrient pump intervals
        Object.keys(preDosingConfig.dosing.nutrientPumps).forEach(pumpName => {
          savedIntervals.nutrientPumps[pumpName] = preDosingConfig.dosing.nutrientPumps[pumpName].minInterval;
        });
        
        console.log('Saved current intervals before sync:', JSON.stringify(savedIntervals, null, 2));
        
        // First sync with profile pumps to ensure using the correct pumps
        try {
          await syncProfilePumps();
          
          // Restore the minInterval settings after sync
          const postSyncConfig = getDosingConfig();
          
          // Create updates object to restore intervals
          const intervalUpdates: Partial<DosingConfig> = {
            dosing: {
              phUp: {
                ...postSyncConfig.dosing.phUp,
                minInterval: savedIntervals.phUp
              },
              phDown: {
                ...postSyncConfig.dosing.phDown,
                minInterval: savedIntervals.phDown
              },
              nutrientPumps: {}
            }
          };
          
          // Restore all nutrient pump intervals that still exist
          Object.keys(postSyncConfig.dosing.nutrientPumps).forEach(pumpName => {
            if (pumpName in savedIntervals.nutrientPumps) {
              if (!intervalUpdates.dosing) {
                intervalUpdates.dosing = { 
                  phUp: postSyncConfig.dosing.phUp,
                  phDown: postSyncConfig.dosing.phDown,
                  nutrientPumps: {}
                };
              }
              
              if (!intervalUpdates.dosing.nutrientPumps) {
                intervalUpdates.dosing.nutrientPumps = {};
              }
              
              intervalUpdates.dosing.nutrientPumps[pumpName] = {
                ...postSyncConfig.dosing.nutrientPumps[pumpName],
                minInterval: savedIntervals.nutrientPumps[pumpName]
              };
            }
          });
          
          // Apply the interval updates
          updateDosingConfig(intervalUpdates);
          console.log('Restored user interval settings after sync');
          
        } catch (err) {
          console.warn('Could not sync profile pumps before dosing:', err);
        }
        
        const result = await performAutoDosing();
        console.log('Manual dosing cycle result:', result);
        
        // Include more diagnostic info
        let diagnostics = {};
        try {
          const { getAllSensorReadings } = await import('../../lib/sensors');
          const { getAllPumpStatus } = await import('../../lib/pumps');
          
          const readings = await getAllSensorReadings();
          const pumps = getAllPumpStatus();
          
          diagnostics = {
            sensors: readings,
            pumps: pumps.map(p => ({ name: p.name, active: p.active }))
          };
        } catch (err) {
          console.error('Failed to get diagnostic info:', err);
        }
        
        response = {
          action: 'dose',
          result,
          diagnostics,
          success: true
        };
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
    
  } catch (error) {
    console.error('Error in auto-dosing API:', error);
    return NextResponse.json(
      { 
        error: 'Failed to execute auto-dosing action', 
        details: error instanceof Error ? error.message : String(error) 
      },
      { status: 500 }
    );
  }
} 