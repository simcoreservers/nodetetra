import { NextRequest, NextResponse } from 'next/server';
import { getDosingConfig, updateDosingConfig } from '@/app/lib/autoDosing';
import { error, info } from '@/app/lib/logger';
import { disableMonitoring } from '@/app/lib/monitorControl';


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
      config.enabled = false;
    } else if (action === 'update') {
      // Handle configuration updates from UI
      console.log('[INFO] [dosing-api] Updating auto-dosing configuration');
      
      if (body.config) {
        // Apply the provided updates to the config
        config = updateDosingConfig(body.config);
      }
    } else if (action === 'reset') {
      console.log('[INFO] [dosing-api] Resetting auto-dosing configuration to defaults');
      
      // Import and use resetDosingConfig
      try {
        const { resetDosingConfig } = await import('../../lib/autoDosing');
        config = resetDosingConfig();
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
