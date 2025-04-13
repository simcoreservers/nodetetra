import { NextResponse } from 'next/server';
import { 
  getAlerts, 
  getAlertSettings, 
  getThresholdSettings,
  acknowledgeAlert,
  resolveAlert,
  updateAlertSettings,
  updateThresholdSettings,
  initializeAlertSystem
} from '@/app/lib/alerts';

// Initialize alert system
let initialized = false;

/**
 * GET API route for fetching alerts and settings
 */
export async function GET(request: Request) {
  try {
    // Initialize if not already done
    if (!initialized) {
      await initializeAlertSystem();
      initialized = true;
    }
    
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode') || 'active';
    
    let alertData;
    
    // Fetch different data based on mode parameter
    switch (mode) {
      case 'settings':
        alertData = await getAlertSettings();
        break;
      case 'thresholds':
        alertData = await getThresholdSettings();
        break;
      case 'active':
        alertData = await getAlerts({ activeOnly: true });
        break;
      case 'history':
        const limit = parseInt(searchParams.get('limit') || '20');
        alertData = await getAlerts({ limit });
        break;
      case 'resolved':
        alertData = await getAlerts({ resolvedOnly: true });
        break;
      case 'all':
        alertData = {
          activeAlerts: await getAlerts({ activeOnly: true }),
          alertSettings: await getAlertSettings(),
          thresholdSettings: await getThresholdSettings()
        };
        break;
      default:
        alertData = await getAlerts({ activeOnly: true });
    }

    return NextResponse.json({
      data: alertData,
      timestamp: new Date().toISOString(),
      status: 'ok'
    });
  } catch (error) {
    console.error('Error fetching alerts data:', error);
    
    return NextResponse.json({
      error: `Failed to fetch alerts data: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

/**
 * POST API route for updating alerts and settings
 */
export async function POST(request: Request) {
  try {
    // Initialize if not already done
    if (!initialized) {
      await initializeAlertSystem();
      initialized = true;
    }
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || '';
    const data = await request.json();
    
    let result;
    
    switch (action) {
      case 'acknowledge':
        if (!data.alertId) {
          throw new Error('Missing alertId parameter');
        }
        result = await acknowledgeAlert(data.alertId);
        if (!result) {
          return NextResponse.json({
            error: `Alert with ID ${data.alertId} not found`,
            status: 'error',
            timestamp: new Date().toISOString()
          }, { status: 404 });
        }
        break;
      
      case 'resolve':
        if (!data.alertId) {
          throw new Error('Missing alertId parameter');
        }
        result = await resolveAlert(data.alertId);
        if (!result) {
          return NextResponse.json({
            error: `Alert with ID ${data.alertId} not found`,
            status: 'error',
            timestamp: new Date().toISOString()
          }, { status: 404 });
        }
        break;
      
      case 'updateSettings':
        result = await updateAlertSettings(data);
        break;
      
      case 'updateThresholds':
        result = await updateThresholdSettings(data);
        break;
      
      default:
        return NextResponse.json({
          error: `Unknown action: ${action}`,
          status: 'error',
          timestamp: new Date().toISOString()
        }, { status: 400 });
    }

    return NextResponse.json({
      data: result,
      timestamp: new Date().toISOString(),
      status: 'ok'
    });
  } catch (error) {
    console.error('Error updating alerts data:', error);
    
    return NextResponse.json({
      error: `Failed to update alerts data: ${error instanceof Error ? error.message : String(error)}`,
      status: 'error',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
} 