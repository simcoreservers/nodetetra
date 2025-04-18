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
    
    return NextResponse.json({
      status: 'success',
      config,
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
      console.log('[INFO] [dosing-api] User explicitly enabled auto-dosing');
      
      // Explicitly enable monitoring when auto-dosing is enabled
      enableMonitoring();
      console.log('[INFO] [dosing-api] Explicitly enabled monitoring with auto-dosing');
      
      if (forceReset) {
        console.log('[INFO] [dosing-api] Force resetting all safety flags for clean start');
        // Force reset all safety flags
        try {
          await import('../../lib/autoDosing').then(module => {
            if (typeof module.resetSafetyFlags === 'function') {
              module.resetSafetyFlags();
            } else {
              console.warn('[WARN] [dosing-api] resetSafetyFlags function not found in autoDosing module');
            }
          });
        } catch (err) {
          console.error('[ERROR] [dosing-api] Failed to reset safety flags:', err);
        }
      }
      
      // Update config
      config.enabled = true;
    } else if (action === 'disable') {
      console.log('[INFO] [dosing-api] User explicitly disabled auto-dosing');
      
      // Explicitly disable monitoring when auto-dosing is disabled
      disableMonitoring();
      console.log('[INFO] [dosing-api] Explicitly disabled monitoring with auto-dosing');
      
      config.enabled = false;
    } else if (action === 'update') {
      // Handle configuration updates from UI
      console.log('[INFO] [dosing-api] Updating auto-dosing configuration');
      
      if (body.config) {
        // Check if enabled state is changing
        const enabledChanging = body.config.enabled !== undefined && body.config.enabled !== config.enabled;
        
        // Apply the provided updates to the config
        config = updateDosingConfig(body.config);
        
        // Sync monitoring state with dosing enabled state if it changed
        if (enabledChanging) {
          if (config.enabled) {
            enableMonitoring();
            console.log('[INFO] [dosing-api] Enabled monitoring to match auto-dosing state');
          } else {
            disableMonitoring();
            console.log('[INFO] [dosing-api] Disabled monitoring to match auto-dosing state');
          }
        }
      }
    } else if (action === 'reset') {
      console.log('[INFO] [dosing-api] Resetting auto-dosing configuration to defaults');
      
      // Use the default configuration instead of resetDosingConfig
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
        
        // After reset, ensure monitoring is disabled
        disableMonitoring();
        console.log('[INFO] [dosing-api] Disabled monitoring after resetting auto-dosing config');
      } catch (err) {
        console.error('[ERROR] [dosing-api] Failed to reset dosing config:', err);
      }
    }

    // Save config - only updateDosingConfig() is needed as it handles persistence
    if (action === 'enable' || action === 'disable') {
      await updateDosingConfig(config);
    }

    return new Response(JSON.stringify({ status: 'success', config }), { status: 200 });
  } catch (error) {
    console.error('[ERROR] [dosing-api]', error);
    return new Response(JSON.stringify({ status: 'error', error: String(error) }), { status: 500 });
  }
}
