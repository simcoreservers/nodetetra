import { NextRequest, NextResponse } from 'next/server';
import { info, warn } from '@/app/lib/logger';

const MODULE = 'api:autodosing-deprecated';

/**
 * GET handler for auto-dosing API
 * DEPRECATED: Redirects to the new unified dosing API
 */
export async function GET() {
  try {
    warn(MODULE, 'Deprecated API endpoint called - redirecting to unified API');
    
    // Get data from the new API
    const response = await fetch(`${process.env.HOST_URL || 'http://localhost:3000'}/api/dosing/auto`, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache'
      }
    });
    
    const data = await response.json();
    
    // Transform response to match old format
    return NextResponse.json({
      status: 'success',
      config: data.config,
      isDosingInProgress: data.autodosing?.inProgress || false,
      _deprecated: true
    });
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to get auto-dosing configuration',
        message: error instanceof Error ? error.message : String(error),
        _deprecated: true
      },
      { status: 500 }
    );
  }
}

/**
 * POST handler for auto-dosing API
 * DEPRECATED: Redirects to the new unified dosing API
 */
export async function POST(request: NextRequest) {
  try {
    warn(MODULE, 'Deprecated API endpoint called - redirecting to unified API');
    
    const body = await request.json();
    const { action, config } = body;
    
    let url;
    let transformedBody;
    
    // Map old actions to new API endpoints
    switch (action) {
      case 'update':
      case 'enable':
      case 'disable':
      case 'reset':
        url = '/api/dosing';
        transformedBody = body;
        break;
        
      case 'dose':
      case 'forceNext':
        url = '/api/dosing/auto';
        transformedBody = body;
        break;
        
      default:
        return NextResponse.json(
          { 
            status: 'error', 
            error: `Unknown action: ${action}`,
            _deprecated: true
          },
          { status: 400 }
        );
    }
    
    // Forward the request to the new API
    const response = await fetch(`${process.env.HOST_URL || 'http://localhost:3000'}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(transformedBody),
    });
    
    const data = await response.json();
    
    // Add deprecated flag
    data._deprecated = true;
    
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { 
        status: 'error', 
        error: 'Failed to process auto-dosing request',
        message: error instanceof Error ? error.message : String(error),
        _deprecated: true
      },
      { status: 500 }
    );
  }
}
