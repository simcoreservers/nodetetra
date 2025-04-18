import { NextRequest, NextResponse } from 'next/server';
import { 
  getDosingConfig, 
  performAutoDosing,
  forceNextDosing,
  isLocked
} from '@/app/lib/autoDosing';
import { error, info, debug } from '@/app/lib/logger';

const MODULE = 'api:dosing:auto';

/**
 * GET handler - get auto-dosing status
 */
export async function GET() {
  try {
    const config = getDosingConfig();
    const isDosingInProgress = isLocked();
    
    return NextResponse.json({
      status: 'success',
      autodosing: {
        enabled: config?.enabled || false,
        inProgress: isDosingInProgress
      },
      config
    });
  } catch (err) {
    error(MODULE, 'Error getting auto-dosing status:', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to get auto-dosing status',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler - trigger dosing actions
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    
    if (!action) {
      return NextResponse.json(
        { status: 'error', error: 'Missing action parameter' },
        { status: 400 }
      );
    }
    
    // Get current config 
    const config = getDosingConfig();
    if (!config) {
      return NextResponse.json(
        { status: 'error', error: 'Failed to load dosing configuration' },
        { status: 500 }
      );
    }
    
    switch (action) {
      case 'dose':
        // Check if auto-dosing is enabled
        if (!config.enabled) {
          return NextResponse.json({
            status: 'success',
            result: {
              action: 'none',
              details: { reason: 'Auto-dosing is disabled' }
            }
          });
        }
        
        // Perform dosing using the autoDosing module
        const result = await performAutoDosing();
        return NextResponse.json({
          status: 'success',
          result
        });
        
      case 'forceNext':
        // Reset all dose timestamps using the autoDosing module
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
  } catch (err) {
    error(MODULE, 'Error in auto-dosing API:', err);
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to process auto-dosing request',
        message: err instanceof Error ? err.message : String(err)
      },
      { status: 500 }
    );
  }
}