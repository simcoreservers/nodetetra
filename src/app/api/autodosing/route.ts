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
  initializeAutoDosing();
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
        
        console.log('Updating auto-dosing configuration:', config);
        const updatedConfig = updateDosingConfig(config as Partial<DosingConfig>);
        response = {
          action: 'update',
          config: updatedConfig,
          success: true
        };
        break;
        
      case 'enable':
        // Enable auto-dosing
        console.log('Enabling auto-dosing with configuration:', getDosingConfig());
        const enabledConfig = updateDosingConfig({ enabled: true });
        
        // Check if system is operational immediately to provide feedback
        const currentConfig = getDosingConfig();
        if (currentConfig.enabled) {
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
          config: enabledConfig,
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
        
        // First sync with profile pumps to ensure using the correct pumps
        try {
          await syncProfilePumps();
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