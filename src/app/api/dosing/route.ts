import { NextRequest, NextResponse } from 'next/server';
import { getDosingConfig, updateDosingConfig } from '@/app/lib/autoDosing';
import { error, info } from '@/app/lib/logger';
import { disableMonitoring, enableMonitoring } from '@/app/lib/monitorControl';

const MODULE = 'api:dosing';

/**
 * GET handler for combined dosing API
 * Returns the unified dosing configuration
 */
export async function GET() {
  try {
    // Get the config
    const config = getDosingConfig();
    
    if (!config) {
      return NextResponse.json(
        { status: 'error', error: 'Failed to load dosing configuration' },
        { status: 500 }
      );
    }
    
    // Check if a dosing operation is currently in progress
    let isDosingInProgress = false;
    try {
      // Look for active pumps as an indicator of dosing in progress
      const { getAllPumpStatus } = await import('@/app/lib/pumps');
      const pumpStatus = getAllPumpStatus();
      
      // If any pump is active, consider dosing in progress
      isDosingInProgress = pumpStatus.some(pump => pump.active);
    } catch (err) {
      error(MODULE, 'Error checking active pumps:', err);
    }
    
    return NextResponse.json({
      status: 'success',
      config,
      isDosingInProgress
    });
  } catch (err) {
    error(MODULE, 'Error getting dosing config:', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to get dosing configuration',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for unified dosing API
 * Supports multiple actions: update, enable, disable, reset
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const action = body.action;
    const forceReset = body.forceReset === true;

    // Safety check - server side only
    if (typeof window !== 'undefined') {
      return new Response(JSON.stringify({ status: 'error', error: 'Server side operation only' }), { status: 400 });
    }

    // Get current config
    let config = await getDosingConfig();

    if (action === 'enable') {
      info(MODULE, 'User explicitly enabled auto-dosing system');
      
      // Enable the unified auto-dosing system
      await enableMonitoring();
      
      // Reload config to ensure we have the updated state
      config = getDosingConfig();
      
      // Make sure monitoring system is running
      try {
        // Import and start monitoring if needed
        const { startContinuousMonitoring } = await import('../../lib/server-init');
        startContinuousMonitoring();
        info(MODULE, 'Started continuous monitoring');
      } catch (err) {
        error(MODULE, 'Failed to start continuous monitoring:', err);
      }
      
      if (forceReset) {
        info(MODULE, 'Force resetting safety flags for clean start');
        // First stop any active pumps
        try {
          const { getAllPumpStatus, stopPump } = await import('../../lib/pumps');
          const pumpStatus = getAllPumpStatus();
          
          // Force stop any active pumps
          for (const pump of pumpStatus) {
            if (pump.active) {
              info(MODULE, `Stopping active pump ${pump.name} during force reset`);
              await stopPump(pump.name);
            }
          }
          info(MODULE, 'All pumps stopped during force reset');
        } catch (err) {
          error(MODULE, 'Error stopping pumps during force reset:', err);
        }
      }
    } else if (action === 'disable') {
      info(MODULE, 'User explicitly disabled auto-dosing system');
      
      // Disable the unified auto-dosing system
      await disableMonitoring();
      
      // Reload config to ensure we have the updated state
      config = getDosingConfig();
      
      // Force stop any running pumps
      try {
        const { getAllPumpStatus, stopPump } = await import('../../lib/pumps');
        const pumpStatus = getAllPumpStatus();
        
        // Force stop any active pumps
        for (const pump of pumpStatus) {
          if (pump.active) {
            info(MODULE, `Stopping active pump ${pump.name} during disable`);
            await stopPump(pump.name);
          }
        }
        info(MODULE, 'All pumps stopped during disable');
      } catch (err) {
        error(MODULE, 'Error stopping pumps during disable:', err);
      }
    } else if (action === 'update') {
      info(MODULE, 'Updating auto-dosing configuration');
      
      if (body.config) {
        // Check if enabled state is changing
        const enabledChanging = body.config.enabled !== undefined && body.config.enabled !== config.enabled;
        
        // Apply the provided updates to the config
        config = updateDosingConfig(body.config);
        
        if (enabledChanging) {
          info(MODULE, `Auto-dosing system ${config.enabled ? 'enabled' : 'disabled'} through config update`);
        }
      }
    } else if (action === 'reset') {
      info(MODULE, 'Resetting auto-dosing configuration to defaults');
      
      // Use the default configuration
      try {
        // Reset to default values
        config = {
          ...config,
          enabled: false, // Always set to disabled for safety
          targets: {
            ph: {
              target: 6.0,
              tolerance: 0.2
            },
            ec: {
              target: 1.4,
              tolerance: 0.1
            }
          }
        };
        
        // Update the config using updateDosingConfig which will handle saving
        config = updateDosingConfig(config);
        
        // After reset, explicitly ensure system is disabled
        await disableMonitoring();
        info(MODULE, 'Disabled auto-dosing system after reset');
      } catch (err) {
        error(MODULE, 'Failed to reset dosing config:', err);
      }
    }

    // Check if a dosing operation is currently in progress
    let isDosingInProgress = false;
    try {
      // Look for active pumps as an indicator of dosing in progress
      const { getAllPumpStatus } = await import('@/app/lib/pumps');
      const pumpStatus = getAllPumpStatus();
      
      // If any pump is active, consider dosing in progress
      isDosingInProgress = pumpStatus.some(pump => pump.active);
    } catch (err) {
      error(MODULE, 'Error checking active pumps:', err);
    }

    return new Response(JSON.stringify({ 
      status: 'success', 
      config,
      isDosingInProgress
    }), { status: 200 });
  } catch (err) {
    error(MODULE, 'API error:', err);
    return new Response(JSON.stringify({ status: 'error', error: String(err) }), { status: 500 });
  }
}
