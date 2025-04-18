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
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config: configUpdates } = body;
    
    if (!action) {
      return NextResponse.json(
        { status: 'error', error: 'Missing action parameter' },
        { status: 400 }
      );
    }
    
    // Get current config
    const currentConfig = getDosingConfig();
    if (!currentConfig) {
      return NextResponse.json(
        { status: 'error', error: 'Failed to load current configuration' },
        { status: 500 }
      );
    }
    
    // Handle different actions
    switch (action) {
      case 'update':
        if (!configUpdates) {
          return NextResponse.json(
            { status: 'error', error: 'Missing config parameter for update action' },
            { status: 400 }
          );
        }
        
        // Pass updates to autoDosing.ts handler
        const updatedConfig = updateDosingConfig(configUpdates);
        

        
        return NextResponse.json({
          status: 'success',
          config: updatedConfig
        });
        
      case 'enable':
        const enabledConfig = updateDosingConfig({ enabled: true });
        
        return NextResponse.json({
          status: 'success',
          config: enabledConfig
        });
        
      case 'disable':
        const disabledConfig = updateDosingConfig({ enabled: false });
        
        // Force stop monitoring when disabled by setting global flag
        disableMonitoring();
        
        // Also shutdown the monitoring service completely
        if (typeof window === 'undefined') {
          import('../../lib/server-init').then(({ stopContinuousMonitoring }) => {
            stopContinuousMonitoring();
            console.log('FORCE STOPPING AUTO-DOSING');
          });
        }
        
        return NextResponse.json({
          status: 'success',
          config: disabledConfig
        });
        
      case 'reset':
        // Reset to default config
        const resetUpdates = {
          enabled: false,
          targets: {
            ph: {
              target: 6.0,
              tolerance: 0.2
            },
            ec: {
              target: 1.4,
              tolerance: 0.1
            }
          },
          lastDose: {
            phUp: null,
            phDown: null,
            nutrientPumps: {}
          }
        };
        
        const resetConfig = updateDosingConfig(resetUpdates);
        
        return NextResponse.json({
          status: 'success',
          config: resetConfig
        });
        
      default:
        return NextResponse.json(
          { status: 'error', error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (err) {
    error(MODULE, 'Error in dosing API:', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to process dosing request',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}
