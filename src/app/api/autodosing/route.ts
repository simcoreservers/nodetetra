import { NextRequest, NextResponse } from 'next/server';
import { 
  getDosingConfig, 
  updateDosingConfig, 
  resetDosingConfig, 
  performAutoDosing, 
  isLocked,
  forceNextDosing 
} from '@/app/lib/autoDosing';

/**
 * GET handler for auto-dosing API
 * Returns the current auto-dosing configuration
 */
export async function GET() {
  try {
    const config = getDosingConfig();
    const isDosingInProgress = isLocked();
    
    return NextResponse.json({
      status: 'success',
      config,
      isDosingInProgress
    });
  } catch (error) {
    console.error('Error getting auto-dosing config:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to get auto-dosing configuration',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for auto-dosing API
 * Supports multiple actions: update, enable, disable, reset, dose, forceNext
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, config } = body;
    
    if (!action) {
      return NextResponse.json(
        { status: 'error', error: 'Missing action parameter' },
        { status: 400 }
      );
    }
    
    // Handle different actions
    switch (action) {
      case 'update':
        if (!config) {
          return NextResponse.json(
            { status: 'error', error: 'Missing config parameter for update action' },
            { status: 400 }
          );
        }
        const updatedConfig = updateDosingConfig(config);
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
        return NextResponse.json({
          status: 'success',
          config: disabledConfig
        });
        
      case 'reset':
        const resetedConfig = resetDosingConfig();
        return NextResponse.json({
          status: 'success',
          config: resetedConfig
        });
        
      case 'dose':
        // Check if dosing is already in progress
        if (isLocked()) {
          return NextResponse.json({
            status: 'success',
            result: {
              action: 'waiting',
              details: { reason: 'A dosing operation is already in progress' }
            }
          });
        }
        
        // Perform auto-dosing
        const result = await performAutoDosing();
        return NextResponse.json({
          status: 'success',
          result
        });
        
      case 'forceNext':
        forceNextDosing();
        return NextResponse.json({
          status: 'success',
          message: 'Force next dosing triggered successfully'
        });
        
      default:
        return NextResponse.json(
          { status: 'error', error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Error in auto-dosing API:', error);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to process auto-dosing request',
        message: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 